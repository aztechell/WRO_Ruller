import type { MapSpec } from "../state/types";

export interface MapConfigEntry {
  filename: string;
  realWidthMm: number;
  realHeightMm: number;
}

export interface ParseMapConfigResult {
  entries: MapConfigEntry[];
  warnings: string[];
}

export interface LoadedMap {
  spec: MapSpec;
  image: HTMLImageElement;
  url: string;
}

export interface LoadMapsResult {
  maps: LoadedMap[];
  warnings: string[];
}

export function parseMapConfig(text: string): ParseMapConfigResult {
  const entries: MapConfigEntry[] = [];
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length !== 3) {
      warnings.push(`config.txt:${lineIndex + 1} ignored (expected 3 tokens)`);
      continue;
    }

    const [filename, widthToken, heightToken] = parts;
    const realWidthMm = Number(widthToken);
    const realHeightMm = Number(heightToken);

    const validDims =
      Number.isInteger(realWidthMm) &&
      Number.isInteger(realHeightMm) &&
      realWidthMm > 0 &&
      realHeightMm > 0;

    if (!validDims) {
      warnings.push(`config.txt:${lineIndex + 1} ignored (invalid dimensions)`);
      continue;
    }

    entries.push({
      filename,
      realWidthMm,
      realHeightMm,
    });
  }

  return { entries, warnings };
}

function normalizeMapId(filename: string): string {
  const normalized = filename.replace(/\\/g, "/");
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return basename.replace(/\.[^.]+$/, "");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

export async function loadMapsFromConfig(configUrl = "/maps/config.txt"): Promise<LoadMapsResult> {
  const warnings: string[] = [];
  let configText = "";
  try {
    const response = await fetch(configUrl, { cache: "no-cache" });
    if (!response.ok) {
      return {
        maps: [],
        warnings: [`Failed to load ${configUrl} (HTTP ${response.status})`],
      };
    }
    configText = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      maps: [],
      warnings: [`Failed to load ${configUrl}: ${message}`],
    };
  }

  const parsed = parseMapConfig(configText);
  warnings.push(...parsed.warnings);

  const maps: LoadedMap[] = [];
  const idCounts = new Map<string, number>();
  const baseUrl = new URL(configUrl, window.location.href);

  for (const entry of parsed.entries) {
    const imageUrl = new URL(entry.filename, baseUrl).toString();
    try {
      const image = await loadImage(imageUrl);
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        warnings.push(`${entry.filename} ignored (invalid image dimensions)`);
        continue;
      }
      const rawId = normalizeMapId(entry.filename);
      const seenCount = idCounts.get(rawId) ?? 0;
      idCounts.set(rawId, seenCount + 1);
      const id = seenCount === 0 ? rawId : `${rawId}_${seenCount + 1}`;

      maps.push({
        spec: {
          id,
          filename: entry.filename,
          realWidthMm: entry.realWidthMm,
          realHeightMm: entry.realHeightMm,
          imgWidthPx: image.naturalWidth,
          imgHeightPx: image.naturalHeight,
        },
        image,
        url: imageUrl,
      });
    } catch {
      warnings.push(`${entry.filename} ignored (image load failed)`);
    }
  }

  return { maps, warnings };
}
