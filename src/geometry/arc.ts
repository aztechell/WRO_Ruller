import { mmPerPxX, mmPerPxY } from "./measure";
import type { ArcMeasurement, MapSpec, PointPx } from "../state/types";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

interface PointMm {
  x: number;
  y: number;
}

function toMmCartesian(pointPx: PointPx, map: MapSpec): PointMm {
  return {
    x: pointPx.x * mmPerPxX(map),
    y: -pointPx.y * mmPerPxY(map),
  };
}

function toPxFromMmCartesian(pointMm: PointMm, map: MapSpec): PointPx {
  return {
    x: pointMm.x / mmPerPxX(map),
    y: -pointMm.y / mmPerPxY(map),
  };
}

function signedAngleDelta(from: PointMm, to: PointMm): number {
  const cross = from.x * to.y - from.y * to.x;
  const dot = from.x * to.x + from.y * to.y;
  return Math.atan2(cross, dot);
}

export function computeHeadingDeg(start: PointPx, headingPoint: PointPx, map: MapSpec): number | null {
  const startMm = toMmCartesian(start, map);
  const headingMm = toMmCartesian(headingPoint, map);
  const dx = headingMm.x - startMm.x;
  const dy = headingMm.y - startMm.y;
  if (Math.hypot(dx, dy) <= 0) {
    return null;
  }
  return Math.atan2(dy, dx) * RAD_TO_DEG;
}

export function arcLengthMm(radiusMm: number, angleDeg: number): number {
  return Math.abs(radiusMm * (angleDeg * DEG_TO_RAD));
}

export function computeArcFromStartHeadingAndPoint(
  start: PointPx,
  headingDeg: number,
  throughPoint: PointPx,
  map: MapSpec,
): { radiusMm: number; angleDeg: number } | null {
  const startMm = toMmCartesian(start, map);
  const throughMm = toMmCartesian(throughPoint, map);

  const ux = throughMm.x - startMm.x;
  const uy = throughMm.y - startMm.y;
  const uLenSq = ux * ux + uy * uy;
  if (uLenSq <= 0) {
    return null;
  }

  const headingRad = headingDeg * DEG_TO_RAD;
  const rightNormal = {
    x: Math.sin(headingRad),
    y: -Math.cos(headingRad),
  };
  const denom = 2 * (ux * rightNormal.x + uy * rightNormal.y);
  if (Math.abs(denom) < 1e-6) {
    return null;
  }

  const radiusMm = uLenSq / denom;
  if (!Number.isFinite(radiusMm) || Math.abs(radiusMm) < 1e-6) {
    return null;
  }

  const center = {
    x: startMm.x + rightNormal.x * radiusMm,
    y: startMm.y + rightNormal.y * radiusMm,
  };

  const radialStart = {
    x: startMm.x - center.x,
    y: startMm.y - center.y,
  };
  const radialEnd = {
    x: throughMm.x - center.x,
    y: throughMm.y - center.y,
  };

  const deltaTheta = signedAngleDelta(radialStart, radialEnd);
  if (!Number.isFinite(deltaTheta) || Math.abs(deltaTheta) < 1e-6) {
    return null;
  }

  const angleDeg = -Math.sign(radiusMm) * deltaTheta * RAD_TO_DEG;
  if (!Number.isFinite(angleDeg) || Math.abs(angleDeg) < 1e-6) {
    return null;
  }

  return {
    radiusMm,
    angleDeg,
  };
}

export function sampleArcPoints(
  arc: ArcMeasurement,
  map: MapSpec,
  maxStepDeg = 5,
): PointPx[] {
  if (!Number.isFinite(arc.radiusMm) || !Number.isFinite(arc.angleDeg)) {
    return [arc.start];
  }
  if (arc.radiusMm === 0 || arc.angleDeg === 0) {
    return [arc.start];
  }

  const startMm = toMmCartesian(arc.start, map);
  const headingRad = arc.headingDeg * DEG_TO_RAD;
  const rightNormal = {
    x: Math.sin(headingRad),
    y: -Math.cos(headingRad),
  };
  const center = {
    x: startMm.x + rightNormal.x * arc.radiusMm,
    y: startMm.y + rightNormal.y * arc.radiusMm,
  };

  const radial0 = {
    x: startMm.x - center.x,
    y: startMm.y - center.y,
  };
  const theta0 = Math.atan2(radial0.y, radial0.x);
  const radiusAbs = Math.abs(arc.radiusMm);
  const deltaTheta = -Math.sign(arc.radiusMm) * arc.angleDeg * DEG_TO_RAD;

  const stepRad = Math.max(1, maxStepDeg) * DEG_TO_RAD;
  const steps = Math.max(8, Math.ceil(Math.abs(deltaTheta) / stepRad));
  const points: PointPx[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const theta = theta0 + deltaTheta * t;
    const pointMm = {
      x: center.x + Math.cos(theta) * radiusAbs,
      y: center.y + Math.sin(theta) * radiusAbs,
    };
    points.push(toPxFromMmCartesian(pointMm, map));
  }

  return points;
}
