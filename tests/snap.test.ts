import { findNearestSnapPoint } from "../src/geometry/snap";

describe("findNearestSnapPoint", () => {
  it("returns nearest point inside radius", () => {
    const pointer = { x: 100, y: 100 };
    const candidates = [
      { x: 90, y: 90 },
      { x: 98, y: 99 },
      { x: 200, y: 200 },
    ];
    const result = findNearestSnapPoint(pointer, candidates, 1, 12);
    expect(result?.point).toEqual({ x: 98, y: 99 });
  });

  it("returns null when outside radius", () => {
    const pointer = { x: 0, y: 0 };
    const candidates = [{ x: 20, y: 20 }];
    const result = findNearestSnapPoint(pointer, candidates, 1, 12);
    expect(result).toBeNull();
  });

  it("keeps first candidate on equal distance tie", () => {
    const pointer = { x: 0, y: 0 };
    const candidates = [
      { x: 3, y: 4 },
      { x: -3, y: -4 },
    ];
    const result = findNearestSnapPoint(pointer, candidates, 1, 10);
    expect(result?.index).toBe(0);
  });
});
