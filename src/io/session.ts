import type {
  ArcMeasurement,
  AppState,
  DrawMode,
  PointPx,
  Polyline,
  Segment,
  SessionMapData,
  SessionV1,
} from "../state/types";

export interface ParseSessionResult {
  session: SessionV1 | null;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDrawMode(value: unknown): value is DrawMode {
  return value === "segment" || value === "polyline" || value === "arc";
}

function readPoint(value: unknown): PointPx | null {
  if (!isRecord(value)) {
    return null;
  }
  const x = value.x;
  const y = value.y;
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

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

function cloneArc(arc: ArcMeasurement): ArcMeasurement {
  return {
    id: arc.id,
    start: clonePoint(arc.start),
    headingDeg: arc.headingDeg,
    radiusMm: arc.radiusMm,
    angleDeg: arc.angleDeg,
  };
}

function createFallbackId(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

function parseSegments(value: unknown, warnings: string[], mapId: string): Segment[] {
  if (!Array.isArray(value)) {
    warnings.push(`Session map "${mapId}" has invalid segments payload`);
    return [];
  }
  const segments: Segment[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const raw = value[i];
    if (!isRecord(raw)) {
      warnings.push(`Session map "${mapId}" segment[${i}] skipped (not an object)`);
      continue;
    }
    const a = readPoint(raw.a);
    const b = readPoint(raw.b);
    if (!a || !b) {
      warnings.push(`Session map "${mapId}" segment[${i}] skipped (invalid points)`);
      continue;
    }
    const id = typeof raw.id === "string" && raw.id ? raw.id : createFallbackId("seg", i);
    segments.push({ id, a, b });
  }
  return segments;
}

function parsePolylines(value: unknown, warnings: string[], mapId: string): Polyline[] {
  if (!Array.isArray(value)) {
    warnings.push(`Session map "${mapId}" has invalid polylines payload`);
    return [];
  }
  const polylines: Polyline[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const raw = value[i];
    if (!isRecord(raw)) {
      warnings.push(`Session map "${mapId}" polyline[${i}] skipped (not an object)`);
      continue;
    }
    const pointsRaw = raw.points;
    if (!Array.isArray(pointsRaw)) {
      warnings.push(`Session map "${mapId}" polyline[${i}] skipped (points missing)`);
      continue;
    }
    const points = pointsRaw.map(readPoint).filter((point): point is PointPx => point !== null);
    if (points.length < 2) {
      warnings.push(`Session map "${mapId}" polyline[${i}] skipped (<2 valid points)`);
      continue;
    }
    const id = typeof raw.id === "string" && raw.id ? raw.id : createFallbackId("poly", i);
    polylines.push({ id, points });
  }
  return polylines;
}

function parseArcs(value: unknown, warnings: string[], mapId: string): ArcMeasurement[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const arcs: ArcMeasurement[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const raw = value[i];
    if (!isRecord(raw)) {
      warnings.push(`Session map "${mapId}" arc[${i}] skipped (not an object)`);
      continue;
    }
    const start = readPoint(raw.start);
    const headingDeg = raw.headingDeg;
    const radiusMm = raw.radiusMm;
    const angleDeg = raw.angleDeg;
    const valid =
      start &&
      typeof headingDeg === "number" &&
      typeof radiusMm === "number" &&
      typeof angleDeg === "number" &&
      Number.isFinite(headingDeg) &&
      Number.isFinite(radiusMm) &&
      Number.isFinite(angleDeg) &&
      radiusMm !== 0 &&
      angleDeg !== 0;
    if (!valid) {
      warnings.push(`Session map "${mapId}" arc[${i}] skipped (invalid parameters)`);
      continue;
    }
    const id = typeof raw.id === "string" && raw.id ? raw.id : createFallbackId("arc", i);
    arcs.push({
      id,
      start,
      headingDeg,
      radiusMm,
      angleDeg,
    });
  }
  return arcs;
}

function gatherMapIds(state: AppState): string[] {
  const mapIds = new Set<string>();
  if (state.activeMapId) {
    mapIds.add(state.activeMapId);
  }
  for (const mapId of Object.keys(state.segmentsByMap)) {
    mapIds.add(mapId);
  }
  for (const mapId of Object.keys(state.polylinesByMap)) {
    mapIds.add(mapId);
  }
  for (const mapId of Object.keys(state.arcsByMap)) {
    mapIds.add(mapId);
  }
  return Array.from(mapIds).sort();
}

export function serializeSession(state: AppState): SessionV1 {
  const maps: SessionMapData[] = gatherMapIds(state).map((mapId) => ({
    mapId,
    segments: (state.segmentsByMap[mapId] ?? []).map(cloneSegment),
    polylines: (state.polylinesByMap[mapId] ?? []).map(clonePolyline),
    arcs: (state.arcsByMap[mapId] ?? []).map(cloneArc),
  }));

  return {
    version: 1,
    activeMapId: state.activeMapId,
    maps,
    ui: {
      mode: state.mode,
      orthoEnabled: state.orthoEnabled,
      roundTo10Enabled: state.roundTo10Enabled,
      robotEnabled: state.robotEnabled,
      robotWidthMm: state.robotWidthMm,
      robotHeightMm: state.robotHeightMm,
    },
  };
}

export function parseSession(text: string, availableMapIds: Set<string>): ParseSessionResult {
  const warnings: string[] = [];
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return {
      session: null,
      warnings: ["Session JSON is invalid"],
    };
  }

  if (!isRecord(payload)) {
    return {
      session: null,
      warnings: ["Session root must be an object"],
    };
  }

  if (payload.version !== 1) {
    return {
      session: null,
      warnings: ["Unsupported session version"],
    };
  }

  const uiValue = payload.ui;
  const mode = isRecord(uiValue) && isDrawMode(uiValue.mode) ? uiValue.mode : "segment";
  if (mode === "segment" && (!isRecord(uiValue) || uiValue.mode !== "segment")) {
    warnings.push("Invalid or missing ui.mode; defaulted to segment");
  }
  const orthoEnabled = isRecord(uiValue) && typeof uiValue.orthoEnabled === "boolean"
    ? uiValue.orthoEnabled
    : false;
  const roundTo10Enabled = isRecord(uiValue) && typeof uiValue.roundTo10Enabled === "boolean"
    ? uiValue.roundTo10Enabled
    : false;
  const robotEnabled = isRecord(uiValue) && typeof uiValue.robotEnabled === "boolean"
    ? uiValue.robotEnabled
    : false;
  const robotWidthMm = isRecord(uiValue) && typeof uiValue.robotWidthMm === "number" && uiValue.robotWidthMm > 0
    ? uiValue.robotWidthMm
    : 250;
  const robotHeightMm = isRecord(uiValue) && typeof uiValue.robotHeightMm === "number" && uiValue.robotHeightMm > 0
    ? uiValue.robotHeightMm
    : 250;

  const mapsValue = payload.maps;
  if (!Array.isArray(mapsValue)) {
    return {
      session: null,
      warnings: ["Session maps must be an array"],
    };
  }

  const maps: SessionMapData[] = [];
  for (let i = 0; i < mapsValue.length; i += 1) {
    const rawMap = mapsValue[i];
    if (!isRecord(rawMap)) {
      warnings.push(`maps[${i}] skipped (not an object)`);
      continue;
    }
    const mapId = rawMap.mapId;
    if (typeof mapId !== "string" || !mapId) {
      warnings.push(`maps[${i}] skipped (invalid mapId)`);
      continue;
    }
    if (!availableMapIds.has(mapId)) {
      warnings.push(`maps[${i}] skipped (unknown mapId "${mapId}")`);
      continue;
    }
    const segments = parseSegments(rawMap.segments, warnings, mapId);
    const polylines = parsePolylines(rawMap.polylines, warnings, mapId);
    const arcs = parseArcs(rawMap.arcs, warnings, mapId);
    maps.push({
      mapId,
      segments,
      polylines,
      arcs,
    });
  }

  let activeMapId: string | null = null;
  if (typeof payload.activeMapId === "string" && payload.activeMapId) {
    if (availableMapIds.has(payload.activeMapId)) {
      activeMapId = payload.activeMapId;
    } else {
      warnings.push(`Unknown activeMapId "${payload.activeMapId}" ignored`);
    }
  }

  if (!activeMapId && maps.length > 0) {
    activeMapId = maps[0].mapId;
  }

  return {
    session: {
      version: 1,
      activeMapId,
      maps,
      ui: {
        mode,
        orthoEnabled,
        roundTo10Enabled,
        robotEnabled,
        robotWidthMm,
        robotHeightMm,
      },
    },
    warnings,
  };
}
