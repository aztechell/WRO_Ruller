import type { MapSpec, ScalePercent } from "../state/types";

export interface MapConfigEntry {
  filename: string;
  realWidthMm: number;
  realHeightMm: number;
}

export interface MapManifestEntry {
  id: string;
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

export interface LoadMapManifestResult {
  maps: MapManifestEntry[];
  defaultMapId: string | null;
  warnings: string[];
}

export interface LoadMapByEntryResult {
  map: LoadedMap | null;
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

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizePathLower(value: string): string {
  return normalizePath(value).toLowerCase();
}

function normalizeMapId(filename: string): string {
  const normalized = normalizePath(filename);
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return basename.replace(/\.[^.]+$/, "");
}

function buildManifest(entries: MapConfigEntry[]): MapManifestEntry[] {
  const idCounts = new Map<string, number>();
  const manifest: MapManifestEntry[] = [];

  for (const entry of entries) {
    const rawId = normalizeMapId(entry.filename);
    const seenCount = idCounts.get(rawId) ?? 0;
    idCounts.set(rawId, seenCount + 1);
    const id = seenCount === 0 ? rawId : `${rawId}_${seenCount + 1}`;
    manifest.push({
      id,
      filename: entry.filename,
      realWidthMm: entry.realWidthMm,
      realHeightMm: entry.realHeightMm,
    });
  }

  return manifest;
}

function resolveDefaultMapId(defaultFilename: string | null, maps: MapManifestEntry[]): string | null {
  if (!defaultFilename) {
    return null;
  }
  const target = normalizePathLower(defaultFilename);
  const matched = maps.find((map) => normalizePathLower(map.filename) === target);
  return matched?.id ?? null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    image.src = url;
  });
}

async function fetchConfigText(configUrl: string): Promise<{ text: string | null; warnings: string[] }> {
  try {
    const response = await fetch(configUrl, { cache: "no-cache" });
    if (!response.ok) {
      return {
        text: null,
        warnings: [`Failed to load ${configUrl} (HTTP ${response.status})`],
      };
    }
    return {
      text: await response.text(),
      warnings: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: null,
      warnings: [`Failed to load ${configUrl}: ${message}`],
    };
  }
}

export async function loadMapManifest(configUrl = "/maps/config.txt"): Promise<LoadMapManifestResult> {
  const fetched = await fetchConfigText(configUrl);
  if (!fetched.text) {
    return {
      maps: [],
      defaultMapId: null,
      warnings: fetched.warnings,
    };
  }

  const parsed = parseMapConfig(fetched.text);
  const maps = buildManifest(parsed.entries);
  const defaultMapId = resolveDefaultMapId(parsed.defaultFilename, maps);
  const warnings = [...fetched.warnings, ...parsed.warnings];

  if (parsed.defaultFilename && !defaultMapId) {
    warnings.push(`default map "${parsed.defaultFilename}" not found among configured maps`);
  }

  return {
    maps,
    defaultMapId,
    warnings,
  };
}

export async function loadMapByEntry(
  entry: MapManifestEntry,
  configUrl: string,
  options: LoadMapsOptions = { scalePercent: 25 },
): Promise<LoadMapByEntryResult> {
  const warnings: string[] = [];
  const baseUrl = new URL(configUrl, window.location.href);
  const scaledUrl = new URL(`scaled/${options.scalePercent}/${entry.filename}`, baseUrl).toString();
  const originalUrl = new URL(entry.filename, baseUrl).toString();

  let image: HTMLImageElement;
  let usedUrl = scaledUrl;
  try {
    try {
      image = await loadImage(scaledUrl);
    } catch {
      image = await loadImage(originalUrl);
      usedUrl = originalUrl;
      warnings.push(`${entry.filename} scaled ${options.scalePercent}% missing, fallback to original`);
    }
  } catch {
    warnings.push(`${entry.filename} ignored (image load failed)`);
    return {
      map: null,
      warnings,
    };
  }

  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    warnings.push(`${entry.filename} ignored (invalid image dimensions)`);
    return {
      map: null,
      warnings,
    };
  }

  return {
    map: {
      spec: {
        id: entry.id,
        filename: entry.filename,
        scalePercent: options.scalePercent,
        realWidthMm: entry.realWidthMm,
        realHeightMm: entry.realHeightMm,
        imgWidthPx: image.naturalWidth,
        imgHeightPx: image.naturalHeight,
      },
      image,
      url: usedUrl,
    },
    warnings,
  };
}

// Legacy helper: loads all map images. Prefer loadMapManifest + loadMapByEntry for better memory behavior.
export async function loadMapsFromConfig(
  configUrl = "/maps/config.txt",
  options: LoadMapsOptions = { scalePercent: 25 },
): Promise<LoadMapsResult> {
  const manifest = await loadMapManifest(configUrl);
  const maps: LoadedMap[] = [];
  const warnings = [...manifest.warnings];

  for (const entry of manifest.maps) {
    const loaded = await loadMapByEntry(entry, configUrl, options);
    warnings.push(...loaded.warnings);
    if (loaded.map) {
      maps.push(loaded.map);
    }
  }

  return {
    maps,
    defaultMapId: manifest.defaultMapId,
    warnings,
  };
}
