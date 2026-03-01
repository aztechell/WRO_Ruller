import type { MapSpec, ScalePercent } from "../state/types";

export interface MapConfigEntry {
  filename: string;
  realWidthMm: number;
  realHeightMm: number;
}

export interface ParseMapConfigResult {
  entries: MapConfigEntry[];
  defaultFilename: string | null;
  warnings: string[];
}

export interface LoadedMap {
  spec: MapSpec;
  image: HTMLImageElement;
  url: string;
}

export interface LoadMapsResult {
  maps: LoadedMap[];
  defaultMapId: string | null;
  warnings: string[];
}

export interface LoadMapsOptions {
  scalePercent: ScalePercent;
}

export function parseMapConfig(text: string): ParseMapConfigResult {
  const entries: MapConfigEntry[] = [];
  let defaultFilename: string | null = null;
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts[0].toLowerCase() === "default") {
      if (parts.length !== 2) {
        warnings.push(`config.txt:${lineIndex + 1} ignored (default expects filename)`);
        continue;
      }
      defaultFilename = parts[1];
      continue;
    }

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

  return { entries, defaultFilename, warnings };
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

export async function loadMapsFromConfig(
  configUrl = "/maps/config.txt",
  options: LoadMapsOptions = { scalePercent: 25 },
): Promise<LoadMapsResult> {
  const { scalePercent } = options;
  const warnings: string[] = [];
  let configText = "";
  try {
    const response = await fetch(configUrl, { cache: "no-cache" });
    if (!response.ok) {
      return {
        maps: [],
        defaultMapId: null,
        warnings: [`Failed to load ${configUrl} (HTTP ${response.status})`],
      };
    }
    configText = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      maps: [],
      defaultMapId: null,
      warnings: [`Failed to load ${configUrl}: ${message}`],
    };
  }

  const parsed = parseMapConfig(configText);
  warnings.push(...parsed.warnings);

  const maps: LoadedMap[] = [];
  const idCounts = new Map<string, number>();
  const baseUrl = new URL(configUrl, window.location.href);
  const normalizedScale = String(scalePercent);

  for (const entry of parsed.entries) {
    const originalUrl = new URL(entry.filename, baseUrl).toString();
    const scaledUrl = new URL(`scaled/${normalizedScale}/${entry.filename}`, baseUrl).toString();
    let imageUrl = scaledUrl;
    try {
      let image: HTMLImageElement;
      try {
        image = await loadImage(scaledUrl);
      } catch {
        image = await loadImage(originalUrl);
        warnings.push(`${entry.filename} scaled ${scalePercent}% missing, fallback to original`);
        imageUrl = originalUrl;
      }
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        warnings.push(`${entry.filename} ignored (invalid image dimensions)`);
        continue;
      }
      const rawId = normalizeMapId(entry.filename);
      const seenCount = idCounts.get(rawId) ?? 0;
      idCounts.set(rawId, seenCount + 1);
      const baseId = seenCount === 0 ? rawId : `${rawId}_${seenCount + 1}`;
      const id = `${baseId}@${scalePercent}`;

      maps.push({
        spec: {
          id,
          filename: entry.filename,
          scalePercent,
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

  let defaultMapId: string | null = null;
  if (parsed.defaultFilename) {
    const normalize = (value: string): string => value.replace(/\\/g, "/").toLowerCase();
    const target = normalize(parsed.defaultFilename);
    const matched = maps.find((map) => normalize(map.spec.filename) === target);
    if (matched) {
      defaultMapId = matched.spec.id;
    } else {
      warnings.push(`default map "${parsed.defaultFilename}" not found among loaded maps`);
    }
  }

  return { maps, defaultMapId, warnings };
}
