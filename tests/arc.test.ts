import { computeArcFromStartHeadingAndPoint } from "../src/geometry/arc";
import type { MapSpec } from "../src/state/types";

const map: MapSpec = {
  id: "arc-map",
  filename: "arc.png",
  scalePercent: 100,
  realWidthMm: 1000,
  realHeightMm: 1000,
  imgWidthPx: 1000,
  imgHeightPx: 1000,
};

describe("computeArcFromStartHeadingAndPoint", () => {
  it("returns positive right radius and positive angle for quarter turn", () => {
    const result = computeArcFromStartHeadingAndPoint(
      { x: 100, y: 100 },
      0,
      { x: 200, y: 200 },
      map,
    );
    expect(result).not.toBeNull();
    expect(result?.radiusMm ?? 0).toBeCloseTo(100, 6);
    expect(result?.angleDeg ?? 0).toBeCloseTo(90, 6);
  });

  it("returns negative left radius and positive angle for quarter turn", () => {
    const result = computeArcFromStartHeadingAndPoint(
      { x: 100, y: 100 },
      0,
      { x: 200, y: 0 },
      map,
    );
    expect(result).not.toBeNull();
    expect(result?.radiusMm ?? 0).toBeCloseTo(-100, 6);
    expect(result?.angleDeg ?? 0).toBeCloseTo(90, 6);
  });

  it("returns null when through-point is on heading line", () => {
    const result = computeArcFromStartHeadingAndPoint(
      { x: 100, y: 100 },
      0,
      { x: 200, y: 100 },
      map,
    );
    expect(result).toBeNull();
  });
});
