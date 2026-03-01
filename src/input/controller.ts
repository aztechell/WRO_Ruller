import { clamp, mmPerPxX, mmPerPxY, roundedDistanceMm, screenToWorld, worldToScreen } from "../geometry/measure";
import { findNearestSnapPoint } from "../geometry/snap";
import type { LoadedMap } from "../io/mapConfig";
import { AppStore } from "../state/store";
import type { PointPx, ViewState } from "../state/types";

export interface InputControllerOptions {
  canvas: HTMLCanvasElement;
  store: AppStore;
  getActiveMap: () => LoadedMap | null;
  getViewportSize: () => { width: number; height: number };
  requestRender: () => void;
  onResetView: () => void;
}

interface ViewportBounds {
  width: number;
  height: number;
}

const SNAP_RADIUS_SCREEN_PX = 12;
const PAN_VISIBLE_MARGIN_PX = 64;
const MAX_ZOOM_MULTIPLIER_FROM_MIN = 16;
const ARROW_PAN_SPEED_PX_PER_SEC = 520;
const DELETE_HIT_TOLERANCE_PX = 10;

interface SegmentLabelHit {
  kind: "segment";
  segmentId: string;
  anchor: PointPx;
  endpoint: PointPx;
  currentLengthMm: number;
}

interface PolylineLabelHit {
  kind: "polyline";
  polylineId: string;
  pointIndex: number;
  anchor: PointPx;
  endpoint: PointPx;
  currentLengthMm: number;
}

type LabelHit = SegmentLabelHit | PolylineLabelHit;

type DeleteHit =
  | {
      kind: "segment";
      segmentId: string;
      distancePx: number;
    }
  | {
      kind: "polyline";
      polylineId: string;
      distancePx: number;
    };

export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly store: AppStore;
  private readonly getActiveMap: () => LoadedMap | null;
  private readonly getViewportSize: () => ViewportBounds;
  private readonly requestRender: () => void;
  private readonly onResetView: () => void;
  private readonly measureCtx: CanvasRenderingContext2D | null;

  private isMiddlePanning = false;
  private lastPanScreenPoint: PointPx | null = null;
  private readonly pressedArrowKeys = new Set<string>();
  private keyboardPanHandle: number | null = null;
  private lastKeyboardPanTimeMs = 0;

  constructor(options: InputControllerOptions) {
    this.canvas = options.canvas;
    this.store = options.store;
    this.getActiveMap = options.getActiveMap;
    this.getViewportSize = options.getViewportSize;
    this.requestRender = options.requestRender;
    this.onResetView = options.onResetView;
    const measureCanvas = document.createElement("canvas");
    this.measureCtx = measureCanvas.getContext("2d");

    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.canvas.addEventListener("mouseleave", this.onMouseLeave);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onWindowBlur);
  }

  dispose(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("mouseleave", this.onMouseLeave);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onWindowBlur);
    this.stopKeyboardPanLoop();
  }

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onMouseLeave = (): void => {
    this.store.setPointer(null, null);
    this.requestRender();
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    this.canvas.focus();
    if (event.button === 1) {
      event.preventDefault();
      this.isMiddlePanning = true;
      this.lastPanScreenPoint = this.getCanvasPoint(event);
      return;
    }

    if (event.button === 0) {
      this.handleLeftClick(event);
      return;
    }

    if (event.button === 2) {
      event.preventDefault();
      this.handleRightClick(event);
    }
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button !== 1) {
      return;
    }
    this.isMiddlePanning = false;
    this.lastPanScreenPoint = null;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    const point = this.getCanvasPoint(event);
    if (this.isMiddlePanning && this.lastPanScreenPoint) {
      const dx = point.x - this.lastPanScreenPoint.x;
      const dy = point.y - this.lastPanScreenPoint.y;
      this.lastPanScreenPoint = point;
      this.panBy(dx, dy);
      return;
    }

    const pointer = this.resolvePointer(point);
    if (pointer) {
      this.store.setPointer(pointer.drawPoint, pointer.snapPoint);
    } else {
      this.store.setPointer(null, null);
    }
    this.requestRender();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.shouldCaptureSpaceKey(event)) {
      event.preventDefault();
      this.onResetView();
      return;
    }

    if (!this.shouldCaptureArrowKey(event)) {
      return;
    }
    event.preventDefault();
    this.pressedArrowKeys.add(event.key);
    this.startKeyboardPanLoop();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!this.isArrowKey(event.key)) {
      return;
    }
    this.pressedArrowKeys.delete(event.key);
    if (this.pressedArrowKeys.size === 0) {
      this.stopKeyboardPanLoop();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.pressedArrowKeys.clear();
    this.stopKeyboardPanLoop();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    const activeMap = this.getActiveMap();
    if (!activeMap) {
      return;
    }
    event.preventDefault();

    const state = this.store.getState();
    const view = state.view;
    const cursor = this.getCanvasPoint(event);
    const worldAtCursor = screenToWorld(cursor, view);

    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const maxZoom = view.minZoom * MAX_ZOOM_MULTIPLIER_FROM_MIN;
    const nextZoom = clamp(view.zoom * zoomFactor, view.minZoom, maxZoom);
    if (nextZoom === view.zoom) {
      return;
    }

    let panX = cursor.x - worldAtCursor.x * nextZoom;
    let panY = cursor.y - worldAtCursor.y * nextZoom;
    ({ panX, panY } = this.clampPan(activeMap, nextZoom, panX, panY));

    this.store.setView({
      zoom: nextZoom,
      minZoom: view.minZoom,
      panX,
      panY,
    });
    this.requestRender();
  };

  private handleLeftClick(event: MouseEvent): void {
    const activeMap = this.getActiveMap();
    if (!activeMap) {
      return;
    }
    const state = this.store.getState();
    const point = this.getCanvasPoint(event);

    const canEditByLabel =
      state.inProgress.segmentStart === null && state.inProgress.polylinePoints.length === 0;
    if (canEditByLabel && this.tryEditLabelAtPoint(point, activeMap)) {
      return;
    }

    const resolved = this.resolvePointer(point);
    if (!resolved) {
      return;
    }
    const drawPoint = resolved.drawPoint;

    if (state.mode === "segment") {
      if (state.inProgress.segmentStart) {
        this.store.commitSegment(drawPoint);
      } else {
        this.store.startSegment(drawPoint);
      }
      this.requestRender();
      return;
    }

    this.store.addPolylinePoint(drawPoint);
    this.requestRender();
  }

  private handleRightClick(event: MouseEvent): void {
    const state = this.store.getState();
    if (state.mode === "polyline" && state.inProgress.polylinePoints.length > 0) {
      if (state.inProgress.polylinePoints.length >= 2) {
        this.store.finalizePolyline();
      } else {
        this.store.cancelPolyline();
      }
      this.requestRender();
      return;
    }

    const activeMap = this.getActiveMap();
    if (!activeMap) {
      return;
    }

    const point = this.getCanvasPoint(event);
    const hit = this.findDeleteHit(point, state.view);
    if (!hit) {
      return;
    }
    if (hit.kind === "segment") {
      this.store.deleteSegmentById(hit.segmentId);
    } else {
      this.store.deletePolylineById(hit.polylineId);
    }
    this.requestRender();
  }

  private panBy(dx: number, dy: number): void {
    const activeMap = this.getActiveMap();
    const view = this.store.getState().view;
    let panX = view.panX + dx;
    let panY = view.panY + dy;

    if (activeMap) {
      ({ panX, panY } = this.clampPan(activeMap, view.zoom, panX, panY));
    }

    this.store.patchView({ panX, panY });
    this.requestRender();
  }

  private resolvePointer(
    screenPoint: PointPx,
  ): { world: PointPx; snapPoint: PointPx | null; drawPoint: PointPx } | null {
    const activeMap = this.getActiveMap();
    if (!activeMap) {
      return null;
    }
    const state = this.store.getState();
    const world = screenToWorld(screenPoint, state.view);

    const candidates: PointPx[] = [];
    for (const segment of this.store.getCurrentSegments()) {
      candidates.push(segment.a, segment.b);
    }
    for (const polyline of this.store.getCurrentPolylines()) {
      candidates.push(...polyline.points);
    }
    candidates.push(...state.inProgress.polylinePoints);

    const snap = findNearestSnapPoint(world, candidates, state.view.zoom, SNAP_RADIUS_SCREEN_PX);
    const basePoint = snap ? snap.point : world;
    const drawPoint = this.applyDrawingConstraints(basePoint, state, activeMap);
    return {
      world,
      snapPoint: snap ? snap.point : null,
      drawPoint,
    };
  }

  private getCanvasPoint(event: MouseEvent | WheelEvent): PointPx {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private clampPan(
    map: LoadedMap,
    zoom: number,
    panX: number,
    panY: number,
  ): { panX: number; panY: number } {
    const viewport = this.getViewportSize();
    const scaledWidth = map.spec.imgWidthPx * zoom;
    const scaledHeight = map.spec.imgHeightPx * zoom;

    const minPanX = PAN_VISIBLE_MARGIN_PX - scaledWidth;
    const maxPanX = viewport.width - PAN_VISIBLE_MARGIN_PX;
    const minPanY = PAN_VISIBLE_MARGIN_PX - scaledHeight;
    const maxPanY = viewport.height - PAN_VISIBLE_MARGIN_PX;

    const clampedX =
      minPanX > maxPanX ? (viewport.width - scaledWidth) * 0.5 : clamp(panX, minPanX, maxPanX);
    const clampedY =
      minPanY > maxPanY ? (viewport.height - scaledHeight) * 0.5 : clamp(panY, minPanY, maxPanY);

    return { panX: clampedX, panY: clampedY };
  }

  private applyDrawingConstraints(
    basePoint: PointPx,
    state: ReturnType<AppStore["getState"]>,
    activeMap: LoadedMap,
  ): PointPx {
    const anchor =
      state.mode === "segment"
        ? state.inProgress.segmentStart
        : state.inProgress.polylinePoints[state.inProgress.polylinePoints.length - 1] ?? null;
    if (!anchor) {
      return { x: basePoint.x, y: basePoint.y };
    }

    let constrained: PointPx = { x: basePoint.x, y: basePoint.y };
    if (state.orthoEnabled) {
      constrained = this.applyOrtho(anchor, constrained);
    }
    if (state.roundTo10Enabled) {
      constrained = this.applyRoundTo10(anchor, constrained, activeMap);
    }
    return constrained;
  }

  private applyOrtho(anchor: PointPx, point: PointPx): PointPx {
    const dx = point.x - anchor.x;
    const dy = point.y - anchor.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: point.x, y: anchor.y };
    }
    return { x: anchor.x, y: point.y };
  }

  private applyRoundTo10(anchor: PointPx, point: PointPx, activeMap: LoadedMap): PointPx {
    const map = activeMap.spec;
    const mppX = mmPerPxX(map);
    const mppY = mmPerPxY(map);
    if (!Number.isFinite(mppX) || !Number.isFinite(mppY) || mppX <= 0 || mppY <= 0) {
      return point;
    }

    const dxPx = point.x - anchor.x;
    const dyPx = point.y - anchor.y;
    const dxMm = dxPx * mppX;
    const dyMm = dyPx * mppY;
    const lengthMm = Math.hypot(dxMm, dyMm);
    if (lengthMm <= 0) {
      return point;
    }

    const roundedLengthMm = Math.round(lengthMm / 10) * 10;
    const scale = roundedLengthMm / lengthMm;
    const nextDxMm = dxMm * scale;
    const nextDyMm = dyMm * scale;

    return {
      x: anchor.x + nextDxMm / mppX,
      y: anchor.y + nextDyMm / mppY,
    };
  }

  private tryEditLabelAtPoint(screenPoint: PointPx, activeMap: LoadedMap): boolean {
    const hit = this.findLabelHit(screenPoint, activeMap);
    if (!hit) {
      return false;
    }

    const defaultValue = Math.max(1, Math.round(hit.currentLengthMm));
    const response = window.prompt("Set distance (mm)", String(defaultValue));
    if (response === null) {
      return true;
    }
    const targetLengthMm = Number.parseInt(response.trim(), 10);
    if (!Number.isFinite(targetLengthMm) || targetLengthMm <= 0) {
      return true;
    }

    const newEndpoint = this.projectEndpointByLengthMm(
      hit.anchor,
      hit.endpoint,
      targetLengthMm,
      activeMap,
    );
    if (!newEndpoint) {
      return true;
    }

    if (hit.kind === "segment") {
      this.store.updateSegmentEndpoint(hit.segmentId, newEndpoint);
    } else {
      this.store.updatePolylinePoint(hit.polylineId, hit.pointIndex, newEndpoint);
    }
    this.requestRender();
    return true;
  }

  private findLabelHit(screenPoint: PointPx, activeMap: LoadedMap): LabelHit | null {
    const state = this.store.getState();
    const view = state.view;

    if (this.measureCtx) {
      this.measureCtx.font = "12px 'Segoe UI', sans-serif";
    }

    let bestHit: LabelHit | null = null;
    let bestDistSq = Number.POSITIVE_INFINITY;

    const consider = (hit: LabelHit, text: string): void => {
      const midWorld = {
        x: (hit.anchor.x + hit.endpoint.x) * 0.5,
        y: (hit.anchor.y + hit.endpoint.y) * 0.5,
      };
      const mid = worldToScreen(midWorld, view);
      const width = this.measureCtx ? Math.ceil(this.measureCtx.measureText(text).width) + 12 : 56;
      const height = 18;
      const halfW = width * 0.5;
      const halfH = height * 0.5;

      const inside =
        screenPoint.x >= mid.x - halfW &&
        screenPoint.x <= mid.x + halfW &&
        screenPoint.y >= mid.y - halfH &&
        screenPoint.y <= mid.y + halfH;
      if (!inside) {
        return;
      }

      const dx = screenPoint.x - mid.x;
      const dy = screenPoint.y - mid.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestHit = hit;
      }
    };

    for (const segment of this.store.getCurrentSegments()) {
      const mm = roundedDistanceMm(segment.a, segment.b, activeMap.spec);
      consider(
        {
          kind: "segment",
          segmentId: segment.id,
          anchor: segment.a,
          endpoint: segment.b,
          currentLengthMm: mm,
        },
        `${mm} mm`,
      );
    }

    for (const polyline of this.store.getCurrentPolylines()) {
      for (let i = 0; i < polyline.points.length - 1; i += 1) {
        const a = polyline.points[i];
        const b = polyline.points[i + 1];
        const mm = roundedDistanceMm(a, b, activeMap.spec);
        consider(
          {
            kind: "polyline",
            polylineId: polyline.id,
            pointIndex: i + 1,
            anchor: a,
            endpoint: b,
            currentLengthMm: mm,
          },
          `${mm} mm`,
        );
      }
    }

    return bestHit;
  }

  private projectEndpointByLengthMm(
    anchor: PointPx,
    endpoint: PointPx,
    targetLengthMm: number,
    activeMap: LoadedMap,
  ): PointPx | null {
    const mppX = mmPerPxX(activeMap.spec);
    const mppY = mmPerPxY(activeMap.spec);
    if (!Number.isFinite(mppX) || !Number.isFinite(mppY) || mppX <= 0 || mppY <= 0) {
      return null;
    }

    const dxMm = (endpoint.x - anchor.x) * mppX;
    const dyMm = (endpoint.y - anchor.y) * mppY;
    const currentLengthMm = Math.hypot(dxMm, dyMm);
    if (currentLengthMm <= 0) {
      return null;
    }

    const scale = targetLengthMm / currentLengthMm;
    return {
      x: anchor.x + (dxMm * scale) / mppX,
      y: anchor.y + (dyMm * scale) / mppY,
    };
  }

  private findDeleteHit(screenPoint: PointPx, view: ViewState): DeleteHit | null {
    let bestHit: DeleteHit | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const considerSegment = (segmentId: string, a: PointPx, b: PointPx): void => {
      const screenA = worldToScreen(a, view);
      const screenB = worldToScreen(b, view);
      const distancePx = this.distancePointToSegment(screenPoint, screenA, screenB);
      if (distancePx > DELETE_HIT_TOLERANCE_PX || distancePx >= bestDistance) {
        return;
      }
      bestDistance = distancePx;
      bestHit = {
        kind: "segment",
        segmentId,
        distancePx,
      };
    };

    const considerPolyline = (polylineId: string, a: PointPx, b: PointPx): void => {
      const screenA = worldToScreen(a, view);
      const screenB = worldToScreen(b, view);
      const distancePx = this.distancePointToSegment(screenPoint, screenA, screenB);
      if (distancePx > DELETE_HIT_TOLERANCE_PX || distancePx >= bestDistance) {
        return;
      }
      bestDistance = distancePx;
      bestHit = {
        kind: "polyline",
        polylineId,
        distancePx,
      };
    };

    for (const segment of this.store.getCurrentSegments()) {
      considerSegment(segment.id, segment.a, segment.b);
    }

    for (const polyline of this.store.getCurrentPolylines()) {
      for (let i = 0; i < polyline.points.length - 1; i += 1) {
        considerPolyline(polyline.id, polyline.points[i], polyline.points[i + 1]);
      }
    }

    return bestHit;
  }

  private distancePointToSegment(point: PointPx, a: PointPx, b: PointPx): number {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abLenSq = abX * abX + abY * abY;
    if (abLenSq <= 0) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }
    const apX = point.x - a.x;
    const apY = point.y - a.y;
    const t = clamp((apX * abX + apY * abY) / abLenSq, 0, 1);
    const nearestX = a.x + abX * t;
    const nearestY = a.y + abY * t;
    return Math.hypot(point.x - nearestX, point.y - nearestY);
  }

  private isArrowKey(key: string): boolean {
    return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
  }

  private shouldCaptureArrowKey(event: KeyboardEvent): boolean {
    if (!this.isArrowKey(event.key)) {
      return false;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }

    return !this.isEditableEventTarget(event.target);
  }

  private shouldCaptureSpaceKey(event: KeyboardEvent): boolean {
    if (event.code !== "Space" && event.key !== " " && event.key !== "Spacebar") {
      return false;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    return !this.isEditableEventTarget(event.target);
  }

  private isEditableEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName;
    return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  private startKeyboardPanLoop(): void {
    if (this.keyboardPanHandle !== null) {
      return;
    }
    this.lastKeyboardPanTimeMs = performance.now();
    this.keyboardPanHandle = window.requestAnimationFrame(this.keyboardPanTick);
  }

  private stopKeyboardPanLoop(): void {
    if (this.keyboardPanHandle === null) {
      return;
    }
    window.cancelAnimationFrame(this.keyboardPanHandle);
    this.keyboardPanHandle = null;
    this.lastKeyboardPanTimeMs = 0;
  }

  private readonly keyboardPanTick = (timestampMs: number): void => {
    if (this.pressedArrowKeys.size === 0) {
      this.stopKeyboardPanLoop();
      return;
    }

    const dtSec = Math.max(0, (timestampMs - this.lastKeyboardPanTimeMs) / 1000);
    this.lastKeyboardPanTimeMs = timestampMs;

    const horizontal =
      (this.pressedArrowKeys.has("ArrowRight") ? 1 : 0) -
      (this.pressedArrowKeys.has("ArrowLeft") ? 1 : 0);
    const vertical =
      (this.pressedArrowKeys.has("ArrowDown") ? 1 : 0) - (this.pressedArrowKeys.has("ArrowUp") ? 1 : 0);

    if (horizontal !== 0 || vertical !== 0) {
      const length = Math.hypot(horizontal, vertical);
      const speed = (ARROW_PAN_SPEED_PX_PER_SEC * dtSec) / length;
      this.panBy(-horizontal * speed, -vertical * speed);
    }

    this.keyboardPanHandle = window.requestAnimationFrame(this.keyboardPanTick);
  };
}
