import { parseMapConfig } from "../src/io/mapConfig";

describe("parseMapConfig", () => {
  it("parses valid lines", () => {
    const text = [
      "WRO_2025_Junior.png 2362 1143",
      "WRO_2026_Senior.png 2362 1143",
    ].join("\n");

    const result = parseMapConfig(text);
    expect(result.warnings).toHaveLength(0);
    expect(result.entries).toEqual([
      {
        filename: "WRO_2025_Junior.png",
        realWidthMm: 2362,
        realHeightMm: 1143,
      },
      {
        filename: "WRO_2026_Senior.png",
        realWidthMm: 2362,
        realHeightMm: 1143,
      },
    ]);
  });

  it("ignores invalid and empty lines", () => {
    const text = [
      "",
      "# comment",
      "bad_line",
      "WRO_2025_Junior.png -1 1143",
      "WRO_2026_Junior.png 2362 nope",
      "WRO_2026_Elementary.png 2362 1143",
    ].join("\n");

    const result = parseMapConfig(text);
    expect(result.entries).toEqual([
      {
        filename: "WRO_2026_Elementary.png",
        realWidthMm: 2362,
        realHeightMm: 1143,
      },
    ]);
    expect(result.warnings.length).toBe(3);
  });
});
