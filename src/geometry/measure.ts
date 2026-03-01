import type { MapSpec, PointPx, ViewState } from "../state/types";

export function mmPerPxX(map: MapSpec): number {
  return map.realWidthMm / map.imgWidthPx;
}

export function mmPerPxY(map: MapSpec): number {
  return map.realHeightMm / map.imgHeightPx;
}

export function distanceMm(a: PointPx, b: PointPx, map: MapSpec): number {
  const dxPx = b.x - a.x;
  const dyPx = b.y - a.y;
  const dxMm = dxPx * mmPerPxX(map);
  const dyMm = dyPx * mmPerPxY(map);
  return Math.hypot(dxMm, dyMm);
}

export function roundedDistanceMm(a: PointPx, b: PointPx, map: MapSpec): number {
  return Math.round(distanceMm(a, b, map));
}

export function worldToScreen(point: PointPx, view: ViewState): PointPx {
  return {
    x: point.x * view.zoom + view.panX,
    y: point.y * view.zoom + view.panY,
  };
}

export function screenToWorld(point: PointPx, view: ViewState): PointPx {
  return {
    x: (point.x - view.panX) / view.zoom,
    y: (point.y - view.panY) / view.zoom,
  };
}

export function midpoint(a: PointPx, b: PointPx): PointPx {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
