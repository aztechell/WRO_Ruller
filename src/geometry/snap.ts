import type { PointPx } from "../state/types";

export interface SnapResult {
  point: PointPx;
  index: number;
  distanceScreenPx: number;
}

export function findNearestSnapPoint(
  pointerWorld: PointPx,
  candidates: PointPx[],
  zoom: number,
  radiusScreenPx: number,
): SnapResult | null {
  if (candidates.length === 0) {
    return null;
  }

  const safeZoom = Math.max(zoom, 1e-9);
  const worldRadius = radiusScreenPx / safeZoom;
  const worldRadiusSq = worldRadius * worldRadius;

  let bestIndex = -1;
  let bestDistSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const dx = pointerWorld.x - candidate.x;
    const dy = pointerWorld.y - candidate.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > worldRadiusSq) {
      continue;
    }
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }

  if (bestIndex < 0) {
    return null;
  }

  const point = candidates[bestIndex];
  return {
    point: { x: point.x, y: point.y },
    index: bestIndex,
    distanceScreenPx: Math.sqrt(bestDistSq) * safeZoom,
  };
}
