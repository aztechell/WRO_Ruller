import { parseSession, serializeSession } from "../src/io/session";
import type { AppState } from "../src/state/types";

const stateFixture: AppState = {
  activeMapId: "map-a",
  mode: "polyline",
  orthoEnabled: true,
  roundTo10Enabled: true,
  segmentsByMap: {
    "map-a": [
      {
        id: "seg-1",
        a: { x: 1, y: 2 },
        b: { x: 3, y: 4 },
      },
    ],
  },
  polylinesByMap: {
    "map-a": [
      {
        id: "poly-1",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
        ],
      },
    ],
  },
  inProgress: {
    segmentStart: null,
    polylinePoints: [],
    pointerWorld: null,
    snapPoint: null,
  },
  view: {
    zoom: 1,
    panX: 0,
    panY: 0,
    minZoom: 1,
  },
};

describe("session serialization", () => {
  it("round-trips session v1", () => {
    const serialized = serializeSession(stateFixture);
    const parsed = parseSession(JSON.stringify(serialized), new Set(["map-a"]));
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.session).not.toBeNull();
    expect(parsed.session?.activeMapId).toBe("map-a");
    expect(parsed.session?.ui.mode).toBe("polyline");
    expect(parsed.session?.ui.orthoEnabled).toBe(true);
    expect(parsed.session?.ui.roundTo10Enabled).toBe(true);
    expect(parsed.session?.maps).toHaveLength(1);
  });

  it("rejects unsupported versions", () => {
    const result = parseSession(JSON.stringify({ version: 2, maps: [] }), new Set(["map-a"]));
    expect(result.session).toBeNull();
    expect(result.warnings[0]).toContain("Unsupported session version");
  });

  it("skips unknown map IDs", () => {
    const payload = {
      version: 1,
      activeMapId: "missing-map",
      maps: [
        {
          mapId: "missing-map",
          segments: [],
          polylines: [],
        },
        {
          mapId: "map-a",
          segments: [],
          polylines: [],
        },
      ],
      ui: {
        mode: "segment",
      },
    };
    const result = parseSession(JSON.stringify(payload), new Set(["map-a"]));
    expect(result.session).not.toBeNull();
    expect(result.session?.maps).toHaveLength(1);
    expect(result.session?.maps[0].mapId).toBe("map-a");
    expect(result.warnings.some((message) => message.includes("unknown mapId"))).toBe(true);
  });
});
