import { interiorAngleDeg } from "../src/geometry/measure";

describe("interiorAngleDeg", () => {
  it("returns 90 for orthogonal corner", () => {
    const angle = interiorAngleDeg({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 });
    expect(angle).not.toBeNull();
    expect(angle ?? 0).toBeCloseTo(90, 6);
  });

  it("returns 180 for straight line", () => {
    const angle = interiorAngleDeg({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 });
    expect(angle).not.toBeNull();
    expect(angle ?? 0).toBeCloseTo(180, 6);
  });

  it("returns null for zero-length edge", () => {
    const angle = interiorAngleDeg({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 });
    expect(angle).toBeNull();
  });
});
