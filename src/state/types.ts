export interface MapSpec {
  id: string;
  filename: string;
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

export type DrawMode = "segment" | "polyline";

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  minZoom: number;
}

export interface InProgressState {
  segmentStart: PointPx | null;
  polylinePoints: PointPx[];
  pointerWorld: PointPx | null;
  snapPoint: PointPx | null;
}

export interface AppState {
  activeMapId: string | null;
  mode: DrawMode;
  segmentsByMap: Record<string, Segment[]>;
  polylinesByMap: Record<string, Polyline[]>;
  inProgress: InProgressState;
  view: ViewState;
}

export interface SessionMapData {
  mapId: string;
  segments: Segment[];
  polylines: Polyline[];
}

export interface SessionV1 {
  version: 1;
  activeMapId: string | null;
  maps: SessionMapData[];
  ui: {
    mode: DrawMode;
  };
}
