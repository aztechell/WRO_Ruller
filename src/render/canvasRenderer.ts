import { arcLengthMm, sampleArcPoints } from "../geometry/arc";
import { interiorAngleDeg, midpoint, roundedDistanceMm, worldToScreen } from "../geometry/measure";
import type { LoadedMap } from "../io/mapConfig";
import type {
  ArcMeasurement,
  DrawMode,
  InProgressState,
  MapSpec,
  PointPx,
  Polyline,
  Segment,
  ViewState,
} from "../state/types";

export interface RenderScene {
  map: LoadedMap | null;
  view: ViewState;
  mode: DrawMode;
  segments: Segment[];
  polylines: Polyline[];
  arcs: ArcMeasurement[];
  inProgress: InProgressState;
}

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D canvas context is unavailable");
    }
    this.ctx = context;
  }

  resize(width: number, height: number, dpr: number): void {
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    this.dpr = Math.max(1, dpr);

    this.canvas.width = Math.round(this.cssWidth * this.dpr);
    this.canvas.height = Math.round(this.cssHeight * this.dpr);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
  }

  getViewportSize(): { width: number; height: number } {
    return {
      width: this.cssWidth,
      height: this.cssHeight,
    };
  }

  render(scene: RenderScene): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.drawBackground();

    if (!scene.map) {
      this.drawCenteredMessage("No valid maps loaded");
      return;
    }

    const pointer = scene.inProgress.snapPoint ?? scene.inProgress.pointerWorld;
    const { map, view } = scene;

    ctx.save();
    ctx.translate(view.panX, view.panY);
    ctx.scale(view.zoom, view.zoom);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map.image, 0, 0, map.spec.imgWidthPx, map.spec.imgHeightPx);
    this.drawMapBorder(view.zoom, map.spec.imgWidthPx, map.spec.imgHeightPx);
    this.drawCommittedGeometry(scene.segments, scene.polylines, scene.arcs, map.spec, view.zoom);
    this.drawInProgressGeometry(scene.mode, scene.inProgress, pointer, view.zoom);
    ctx.restore();

    this.drawCommittedLabels(map, view, scene.segments, scene.polylines, scene.arcs);
    this.drawPreviewLabel(map, view, scene.mode, scene.inProgress, pointer);
    this.drawSnapIndicator(view, scene.inProgress.snapPoint);
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, this.cssWidth, this.cssHeight);
    gradient.addColorStop(0, "#e2e8f0");
    gradient.addColorStop(1, "#cbd5e1");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
  }

  private drawMapBorder(zoom: number, width: number, height: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    ctx.lineWidth = 1.25 / zoom;
    ctx.strokeRect(0, 0, width, height);
  }

  private drawCommittedGeometry(
    segments: Segment[],
    polylines: Polyline[],
    arcs: ArcMeasurement[],
    mapSpec: MapSpec,
    zoom: number,
  ): void {
    const ctx = this.ctx;

    ctx.lineWidth = 2 / zoom;
    ctx.strokeStyle = "#0284c7";
    ctx.fillStyle = "#0369a1";
    for (const segment of segments) {
      this.drawLine(segment.a, segment.b);
      this.drawVertex(segment.a, zoom);
      this.drawVertex(segment.b, zoom);
    }

    ctx.strokeStyle = "#0f766e";
    ctx.fillStyle = "#0f766e";
    for (const polyline of polylines) {
      this.drawPolylinePath(polyline.points);
      for (const point of polyline.points) {
        this.drawVertex(point, zoom);
      }
    }

    ctx.strokeStyle = "#7c3aed";
    ctx.fillStyle = "#6d28d9";
    for (const arc of arcs) {
      const points = sampleArcPoints(arc, mapSpec);
      this.drawPolylinePath(points);
      if (points.length > 0) {
        this.drawVertex(points[0], zoom);
        this.drawVertex(points[points.length - 1], zoom);
      }
    }
  }

  private drawInProgressGeometry(
    mode: DrawMode,
    inProgress: InProgressState,
    pointer: PointPx | null,
    zoom: number,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([8 / zoom, 6 / zoom]);
    ctx.lineWidth = 2 / zoom;
    ctx.strokeStyle = "#dc2626";
    ctx.fillStyle = "#dc2626";

    if (mode === "segment") {
      if (inProgress.segmentStart && pointer) {
        this.drawLine(inProgress.segmentStart, pointer);
      }
      if (inProgress.segmentStart) {
        this.drawVertex(inProgress.segmentStart, zoom);
      }
    } else if (mode === "polyline") {
      this.drawPolylinePath(inProgress.polylinePoints);
      if (inProgress.polylinePoints.length > 0 && pointer) {
        const last = inProgress.polylinePoints[inProgress.polylinePoints.length - 1];
        this.drawLine(last, pointer);
      }
      for (const point of inProgress.polylinePoints) {
        this.drawVertex(point, zoom);
      }
    } else if (mode === "arc" && inProgress.arcStart) {
      if (pointer) {
        this.drawLine(inProgress.arcStart, pointer);
      }
      this.drawVertex(inProgress.arcStart, zoom);
    }

    ctx.restore();
  }

  private drawCommittedLabels(
    map: LoadedMap,
    view: ViewState,
    segments: Segment[],
    polylines: Polyline[],
    arcs: ArcMeasurement[],
  ): void {
    for (const segment of segments) {
      const center = midpoint(segment.a, segment.b);
      const screenCenter = worldToScreen(center, view);
      const value = roundedDistanceMm(segment.a, segment.b, map.spec);
      this.drawLabel(`${value} mm`, screenCenter.x, screenCenter.y);
    }

    for (const polyline of polylines) {
      for (let i = 0; i < polyline.points.length - 1; i += 1) {
        const a = polyline.points[i];
        const b = polyline.points[i + 1];
        const center = midpoint(a, b);
        const screenCenter = worldToScreen(center, view);
        const value = roundedDistanceMm(a, b, map.spec);
        this.drawLabel(`${value} mm`, screenCenter.x, screenCenter.y);
      }
      this.drawPolylineAngleLabels(view, polyline.points);
    }

    for (const arc of arcs) {
      const points = sampleArcPoints(arc, map.spec);
      if (points.length === 0) {
        continue;
      }
      const midPoint = points[Math.floor(points.length / 2)];
      const screenMid = worldToScreen(midPoint, view);
      const radiusText = Math.round(arc.radiusMm);
      const angleText = Math.round(arc.angleDeg);
      const lengthText = Math.round(arcLengthMm(arc.radiusMm, arc.angleDeg));
      this.drawLabel(`R ${radiusText} mm | A ${angleText} deg | L ${lengthText} mm`, screenMid.x, screenMid.y);
    }
  }

  private drawPreviewLabel(
    map: LoadedMap,
    view: ViewState,
    mode: DrawMode,
    inProgress: InProgressState,
    pointer: PointPx | null,
  ): void {
    if (!pointer) {
      if (mode === "arc" && inProgress.arcStart) {
        const startScreen = worldToScreen(inProgress.arcStart, view);
        this.drawLabel("Click heading direction", startScreen.x, startScreen.y - 20, true);
      }
      return;
    }

    if (mode === "segment" && inProgress.segmentStart) {
      const value = roundedDistanceMm(inProgress.segmentStart, pointer, map.spec);
      const center = midpoint(inProgress.segmentStart, pointer);
      const screenCenter = worldToScreen(center, view);
      this.drawLabel(`${value} mm`, screenCenter.x, screenCenter.y, true);
      return;
    }

    if (mode === "polyline" && inProgress.polylinePoints.length > 0) {
      const last = inProgress.polylinePoints[inProgress.polylinePoints.length - 1];
      const value = roundedDistanceMm(last, pointer, map.spec);
      const center = midpoint(last, pointer);
      const screenCenter = worldToScreen(center, view);
      this.drawLabel(`${value} mm`, screenCenter.x, screenCenter.y, true);

      if (inProgress.polylinePoints.length >= 2) {
        const previewPoints = [...inProgress.polylinePoints, pointer];
        this.drawPolylineAngleLabels(view, previewPoints, true);
      }
      return;
    }

    if (mode === "arc" && inProgress.arcStart) {
      const startScreen = worldToScreen(inProgress.arcStart, view);
      this.drawLabel("Click heading direction", startScreen.x, startScreen.y - 20, true);
    }
  }

  private drawSnapIndicator(view: ViewState, snapPoint: PointPx | null): void {
    if (!snapPoint) {
      return;
    }
    const ctx = this.ctx;
    const screen = worldToScreen(snapPoint, view);
    ctx.save();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawLine(a: PointPx, b: PointPx): void {
    const ctx = this.ctx;
    const mainStrokeStyle = ctx.strokeStyle;
    const mainLineWidth = ctx.lineWidth;
    const outlineLineWidth = mainLineWidth * 1.35;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.lineWidth = outlineLineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.strokeStyle = mainStrokeStyle;
    ctx.lineWidth = mainLineWidth;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  private drawPolylinePath(points: PointPx[]): void {
    if (points.length < 2) {
      return;
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      this.drawLine(points[i], points[i + 1]);
    }
  }

  private drawVertex(point: PointPx, zoom: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5 / zoom, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawLabel(text: string, x: number, y: number, preview = false): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const metrics = ctx.measureText(text);
    const width = Math.ceil(metrics.width) + 12;
    const height = 18;
    const left = x - width / 2;
    const top = y - height / 2;

    ctx.fillStyle = preview ? "rgba(254, 242, 242, 0.92)" : "rgba(248, 250, 252, 0.92)";
    ctx.strokeStyle = preview ? "#dc2626" : "#475569";
    ctx.lineWidth = 1;
    this.addRoundedRectPath(left, top, width, height, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawPolylineAngleLabels(view: ViewState, points: PointPx[], preview = false): void {
    if (points.length < 3) {
      return;
    }

    for (let i = 1; i < points.length - 1; i += 1) {
      const prev = points[i - 1];
      const vertex = points[i];
      const next = points[i + 1];
      const angleDeg = interiorAngleDeg(prev, vertex, next);
      if (angleDeg === null) {
        continue;
      }
      const screenPosition = this.computeAngleLabelPosition(prev, vertex, next, view);
      this.drawLabel(`${Math.round(angleDeg)} deg`, screenPosition.x, screenPosition.y, preview);
    }
  }

  private computeAngleLabelPosition(
    prev: PointPx,
    vertex: PointPx,
    next: PointPx,
    view: ViewState,
  ): PointPx {
    const ux1 = prev.x - vertex.x;
    const uy1 = prev.y - vertex.y;
    const ux2 = next.x - vertex.x;
    const uy2 = next.y - vertex.y;

    const len1 = Math.hypot(ux1, uy1);
    const len2 = Math.hypot(ux2, uy2);
    let bx = 0;
    let by = 0;

    if (len1 > 0 && len2 > 0) {
      bx = ux1 / len1 + ux2 / len2;
      by = uy1 / len1 + uy2 / len2;
    }

    const bisectorLength = Math.hypot(bx, by);
    if (bisectorLength < 1e-6) {
      const vx = next.x - prev.x;
      const vy = next.y - prev.y;
      const vLength = Math.hypot(vx, vy);
      if (vLength > 0) {
        bx = -vy / vLength;
        by = vx / vLength;
      } else {
        bx = 0;
        by = -1;
      }
    } else {
      bx /= bisectorLength;
      by /= bisectorLength;
    }

    const worldOffset = 24 / Math.max(view.zoom, 1e-6);
    const worldPoint = {
      x: vertex.x + bx * worldOffset,
      y: vertex.y + by * worldOffset,
    };
    return worldToScreen(worldPoint, view);
  }

  private addRoundedRectPath(x: number, y: number, width: number, height: number, radius: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, radius);
      return;
    }

    const r = Math.max(0, Math.min(radius, Math.min(width, height) * 0.5));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private drawCenteredMessage(text: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#334155";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, this.cssWidth / 2, this.cssHeight / 2);
    ctx.restore();
  }
}
