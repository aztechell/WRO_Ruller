import { distanceMm, mmPerPxX, mmPerPxY, roundedDistanceMm } from "../src/geometry/measure";
import type { MapSpec } from "../src/state/types";

const map: MapSpec = {
  id: "test",
  filename: "test.png",
  scalePercent: 100,
  realWidthMm: 2000,
  realHeightMm: 2000,
  imgWidthPx: 1000,
  imgHeightPx: 500,
};

describe("measure math", () => {
  it("computes anisotropic mm-per-px", () => {
    expect(mmPerPxX(map)).toBe(2);
    expect(mmPerPxY(map)).toBe(4);
  });

  it("computes distance in mm", () => {
    const dist = distanceMm({ x: 0, y: 0 }, { x: 300, y: 400 }, map);
    expect(dist).toBeCloseTo(1708.8, 1);
    expect(roundedDistanceMm({ x: 0, y: 0 }, { x: 300, y: 400 }, map)).toBe(1709);
  });

  it("handles zero-length distance", () => {
    expect(distanceMm({ x: 42, y: 42 }, { x: 42, y: 42 }, map)).toBe(0);
  });
});
