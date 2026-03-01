export type ScalePercent = 25 | 50 | 75 | 100;

export interface MapSpec {
  id: string;
  filename: string;
  scalePercent: ScalePercent;
  realWidthMm: number;
  realHeightMm: number;
  imgWidthPx: number;
  imgHeightPx: number;
}

export interface PointPx {
  x: number;
  y: number;
}

export interface Segment {
  id: string;
  a: PointPx;
  b: PointPx;
}

export interface Polyline {
  id: string;
  points: PointPx[];
}

export interface ArcMeasurement {
  id: string;
  start: PointPx;
  headingDeg: number;
  radiusMm: number;
  angleDeg: number;
}

export type DrawMode = "segment" | "polyline" | "arc";

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  minZoom: number;
}

export interface InProgressState {
  segmentStart: PointPx | null;
  polylinePoints: PointPx[];
  arcStart: PointPx | null;
  arcHeadingDeg: number | null;
  pointerWorld: PointPx | null;
  snapPoint: PointPx | null;
}

export interface AppState {
  activeMapId: string | null;
  mode: DrawMode;
  orthoEnabled: boolean;
  roundTo10Enabled: boolean;
  robotEnabled: boolean;
  robotWidthMm: number;
  robotHeightMm: number;
  segmentsByMap: Record<string, Segment[]>;
  polylinesByMap: Record<string, Polyline[]>;
  arcsByMap: Record<string, ArcMeasurement[]>;
  inProgress: InProgressState;
  view: ViewState;
}

export interface SessionMapData {
  mapId: string;
  segments: Segment[];
  polylines: Polyline[];
  arcs: ArcMeasurement[];
}

export interface SessionV1 {
  version: 1;
  activeMapId: string | null;
  maps: SessionMapData[];
  ui: {
    mode: DrawMode;
    orthoEnabled?: boolean;
    roundTo10Enabled?: boolean;
    robotEnabled?: boolean;
    robotWidthMm?: number;
    robotHeightMm?: number;
  };
}
