import type {
  AppState,
  DrawMode,
  PointPx,
  Polyline,
  Segment,
  SessionV1,
  ViewState,
} from "./types";

type StateListener = (state: AppState) => void;

const DEFAULT_VIEW: ViewState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  minZoom: 1,
};

function clonePoint(point: PointPx): PointPx {
  return { x: point.x, y: point.y };
}

function cloneSegment(segment: Segment): Segment {
  return {
    id: segment.id,
    a: clonePoint(segment.a),
    b: clonePoint(segment.b),
  };
}

function clonePolyline(polyline: Polyline): Polyline {
  return {
    id: polyline.id,
    points: polyline.points.map(clonePoint),
  };
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class AppStore {
  private state: AppState = {
    activeMapId: null,
    mode: "segment",
    orthoEnabled: false,
    roundTo10Enabled: false,
    segmentsByMap: {},
    polylinesByMap: {},
    inProgress: {
      segmentStart: null,
      polylinePoints: [],
      pointerWorld: null,
      snapPoint: null,
    },
    view: { ...DEFAULT_VIEW },
  };

  private listeners = new Set<StateListener>();

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): AppState {
    return this.state;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private ensureMapBuckets(mapId: string): void {
    if (!this.state.segmentsByMap[mapId]) {
      this.state.segmentsByMap[mapId] = [];
    }
    if (!this.state.polylinesByMap[mapId]) {
      this.state.polylinesByMap[mapId] = [];
    }
  }

  setMode(mode: DrawMode): void {
    if (this.state.mode === mode) {
      return;
    }
    this.state.mode = mode;
    this.clearInProgress(false);
    this.emit();
  }

  setOrthoEnabled(enabled: boolean): void {
    if (this.state.orthoEnabled === enabled) {
      return;
    }
    this.state.orthoEnabled = enabled;
    this.emit();
  }

  setRoundTo10Enabled(enabled: boolean): void {
    if (this.state.roundTo10Enabled === enabled) {
      return;
    }
    this.state.roundTo10Enabled = enabled;
    this.emit();
  }

  setActiveMap(mapId: string | null): void {
    if (this.state.activeMapId === mapId) {
      return;
    }
    this.state.activeMapId = mapId;
    if (mapId) {
      this.ensureMapBuckets(mapId);
    }
    this.clearInProgress(false);
    this.emit();
  }

  setView(view: ViewState): void {
    this.state.view = { ...view };
    this.emit();
  }

  patchView(viewPatch: Partial<ViewState>): void {
    this.state.view = {
      ...this.state.view,
      ...viewPatch,
    };
    this.emit();
  }

  setPointer(pointerWorld: PointPx | null, snapPoint: PointPx | null): void {
    this.state.inProgress.pointerWorld = pointerWorld ? clonePoint(pointerWorld) : null;
    this.state.inProgress.snapPoint = snapPoint ? clonePoint(snapPoint) : null;
    this.emit();
  }

  startSegment(point: PointPx): void {
    this.state.inProgress.segmentStart = clonePoint(point);
    this.emit();
  }

  commitSegment(endpoint: PointPx): void {
    const mapId = this.state.activeMapId;
    const start = this.state.inProgress.segmentStart;
    if (!mapId || !start) {
      return;
    }
    const samePoint = start.x === endpoint.x && start.y === endpoint.y;
    this.state.inProgress.segmentStart = null;
    if (samePoint) {
      this.emit();
      return;
    }
    this.ensureMapBuckets(mapId);
    this.state.segmentsByMap[mapId].push({
      id: createId("seg"),
      a: clonePoint(start),
      b: clonePoint(endpoint),
    });
    this.emit();
  }

  addPolylinePoint(point: PointPx): void {
    this.state.inProgress.polylinePoints.push(clonePoint(point));
    this.emit();
  }

  finalizePolyline(): void {
    const mapId = this.state.activeMapId;
    const points = this.state.inProgress.polylinePoints;
    if (!mapId) {
      return;
    }
    if (points.length >= 2) {
      this.ensureMapBuckets(mapId);
      this.state.polylinesByMap[mapId].push({
        id: createId("poly"),
        points: points.map(clonePoint),
      });
    }
    this.state.inProgress.polylinePoints = [];
    this.emit();
  }

  cancelPolyline(): void {
    this.state.inProgress.polylinePoints = [];
    this.emit();
  }

  clearMap(mapId: string): void {
    this.state.segmentsByMap[mapId] = [];
    this.state.polylinesByMap[mapId] = [];
    this.clearInProgress(false);
    this.emit();
  }

  clearInProgress(emit = true): void {
    this.state.inProgress.segmentStart = null;
    this.state.inProgress.polylinePoints = [];
    this.state.inProgress.pointerWorld = null;
    this.state.inProgress.snapPoint = null;
    if (emit) {
      this.emit();
    }
  }

  getCurrentSegments(): Segment[] {
    const mapId = this.state.activeMapId;
    if (!mapId) {
      return [];
    }
    this.ensureMapBuckets(mapId);
    return this.state.segmentsByMap[mapId];
  }

  getCurrentPolylines(): Polyline[] {
    const mapId = this.state.activeMapId;
    if (!mapId) {
      return [];
    }
    this.ensureMapBuckets(mapId);
    return this.state.polylinesByMap[mapId];
  }

  applySession(session: SessionV1, fallbackMapId: string | null): void {
    const nextSegments: Record<string, Segment[]> = {};
    const nextPolylines: Record<string, Polyline[]> = {};

    for (const mapEntry of session.maps) {
      nextSegments[mapEntry.mapId] = mapEntry.segments.map(cloneSegment);
      nextPolylines[mapEntry.mapId] = mapEntry.polylines.map(clonePolyline);
    }

    this.state.segmentsByMap = nextSegments;
    this.state.polylinesByMap = nextPolylines;
    this.state.mode = session.ui.mode;
    this.state.orthoEnabled = Boolean(session.ui.orthoEnabled);
    this.state.roundTo10Enabled = Boolean(session.ui.roundTo10Enabled);
    this.state.activeMapId = session.activeMapId ?? fallbackMapId;
    if (this.state.activeMapId) {
      this.ensureMapBuckets(this.state.activeMapId);
    }
    this.clearInProgress(false);
    this.emit();
  }
}
