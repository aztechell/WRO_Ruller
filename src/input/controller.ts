import { clamp, screenToWorld } from "../geometry/measure";
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
}

interface ViewportBounds {
  width: number;
  height: number;
}

const SNAP_RADIUS_SCREEN_PX = 12;
const PAN_VISIBLE_MARGIN_PX = 64;

export class InputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly store: AppStore;
  private readonly getActiveMap: () => LoadedMap | null;
  private readonly getViewportSize: () => ViewportBounds;
  private readonly requestRender: () => void;

  private isMiddlePanning = false;
  private lastPanScreenPoint: PointPx | null = null;

  constructor(options: InputControllerOptions) {
    this.canvas = options.canvas;
    this.store = options.store;
    this.getActiveMap = options.getActiveMap;
    this.getViewportSize = options.getViewportSize;
    this.requestRender = options.requestRender;

    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    this.canvas.addEventListener("mouseleave", this.onMouseLeave);
  }

  dispose(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.removeEventListener("mouseleave", this.onMouseLeave);
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
      this.handleRightClick();
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
      this.store.setPointer(pointer.world, pointer.snapPoint);
    } else {
      this.store.setPointer(null, null);
    }
    this.requestRender();
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
    const maxZoom = view.minZoom * 8;
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
    const point = this.getCanvasPoint(event);
    const resolved = this.resolvePointer(point);
    if (!resolved) {
      return;
    }
    const drawPoint = resolved.snapPoint ?? resolved.world;
    const state = this.store.getState();

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

  private handleRightClick(): void {
    const state = this.store.getState();
    if (state.mode !== "polyline") {
      return;
    }
    if (state.inProgress.polylinePoints.length >= 2) {
      this.store.finalizePolyline();
    } else {
      this.store.cancelPolyline();
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
  ): { world: PointPx; snapPoint: PointPx | null } | null {
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
    return {
      world,
      snapPoint: snap ? snap.point : null,
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
}
