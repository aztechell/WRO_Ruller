import { screenToWorld } from "../geometry/measure";
import { InputController } from "../input/controller";
import { loadMapsFromConfig, type LoadedMap } from "../io/mapConfig";
import { parseSession, serializeSession } from "../io/session";
import { CanvasRenderer } from "../render/canvasRenderer";
import { AppStore } from "../state/store";
import type { DrawMode, MapSpec, ScalePercent, ViewState } from "../state/types";
import { ToolbarView } from "../ui/toolbar";

const INITIAL_FIT_FACTOR = 0.9;
const MIN_FIT_FACTOR = 0.5;

export class App {
  private readonly root: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly loadingOverlay: HTMLDivElement;
  private readonly loadingText: HTMLDivElement;
  private readonly toolbar: ToolbarView;
  private readonly renderer: CanvasRenderer;
  private readonly store = new AppStore();
  private readonly mapsById = new Map<string, LoadedMap>();
  private readonly resizeObserver: ResizeObserver;

  private inputController: InputController | null = null;
  private renderHandle: number | null = null;
  private currentScalePercent: ScalePercent = 25;
  private mapLoadRequestId = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = "app-root";

    const toolbarHost = document.createElement("div");
    this.stage = document.createElement("div");
    this.stage.className = "stage";
    this.canvas = document.createElement("canvas");
    this.canvas.tabIndex = 0;
    this.stage.appendChild(this.canvas);

    this.loadingOverlay = document.createElement("div");
    this.loadingOverlay.className = "stage-loading-overlay";
    this.loadingOverlay.setAttribute("aria-hidden", "true");
    const spinner = document.createElement("div");
    spinner.className = "stage-loading-spinner";
    this.loadingText = document.createElement("div");
    this.loadingText.className = "stage-loading-text";
    this.loadingText.textContent = "Loading maps...";
    this.loadingOverlay.append(spinner, this.loadingText);
    this.stage.appendChild(this.loadingOverlay);

    this.root.append(toolbarHost, this.stage);

    this.renderer = new CanvasRenderer(this.canvas);
    this.toolbar = new ToolbarView(toolbarHost, {
      onMapChange: (mapId) => this.handleMapChange(mapId),
      onScaleChange: (scalePercent) => this.handleScaleChange(scalePercent),
      onModeChange: (mode) => this.handleModeChange(mode),
      onClearAll: () => this.handleClearAll(),
      onExportPng: () => this.handleExportPng(),
      onSaveSession: () => this.handleSaveSession(),
      onLoadSession: (text) => this.handleLoadSession(text),
    });

    this.store.subscribe((state) => {
      this.toolbar.setMode(state.mode);
      this.toolbar.setActiveMap(state.activeMapId);
      this.scheduleRender();
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
  }

  async start(): Promise<void> {
    this.resizeObserver.observe(this.stage);
    this.handleResize();
    this.toolbar.setScale(this.currentScalePercent);

    this.inputController = new InputController({
      canvas: this.canvas,
      store: this.store,
      getActiveMap: () => this.getActiveMap(),
      getViewportSize: () => this.renderer.getViewportSize(),
      requestRender: () => this.scheduleRender(),
    });

    await this.loadMaps();
    this.scheduleRender();
  }

  private async loadMaps(preferredFilename: string | null = null): Promise<void> {
    const requestId = this.mapLoadRequestId + 1;
    this.mapLoadRequestId = requestId;
    this.setLoadingState(true, `Loading maps (${this.currentScalePercent}%)...`);
    const configUrl = `${import.meta.env.BASE_URL}maps/config.txt`;
    try {
      const { maps, defaultMapId, warnings } = await loadMapsFromConfig(configUrl, {
        scalePercent: this.currentScalePercent,
      });
      if (requestId !== this.mapLoadRequestId) {
        return;
      }
      this.mapsById.clear();
      for (const map of maps) {
        this.mapsById.set(map.spec.id, map);
      }

      const mapSpecs = this.getMapSpecs();
      const startupMap = this.pickStartupMap(maps, defaultMapId, preferredFilename);
      this.toolbar.setMaps(mapSpecs, startupMap?.spec.id ?? null);
      this.toolbar.setScale(this.currentScalePercent);

      if (warnings.length > 0) {
        for (const warning of warnings) {
          console.warn(`[WRO Ruler] ${warning}`);
        }
      }

      if (!startupMap) {
        this.toolbar.setStatus("No valid maps loaded", "warn");
        return;
      }

      this.store.setActiveMap(startupMap.spec.id);
      this.fitViewToMap(startupMap);
      this.canvas.focus();

      if (warnings.length > 0) {
        this.toolbar.setStatus(
          `Loaded ${maps.length} map(s) at ${this.currentScalePercent}%, ${warnings.length} warning(s)`,
          "warn",
        );
        return;
      }

      this.toolbar.setStatus(`Loaded ${maps.length} map(s) at ${this.currentScalePercent}%`, "info");
    } catch (error) {
      if (requestId !== this.mapLoadRequestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.toolbar.setStatus(`Map load failed: ${message}`, "error");
    } finally {
      if (requestId === this.mapLoadRequestId) {
        this.setLoadingState(false);
      }
    }
  }

  private pickStartupMap(
    maps: LoadedMap[],
    defaultMapId: string | null,
    preferredFilename: string | null,
  ): LoadedMap | null {
    if (maps.length === 0) {
      return null;
    }
    if (preferredFilename) {
      const preferred = maps.find((map) => map.spec.filename === preferredFilename);
      if (preferred) {
        return preferred;
      }
    }
    if (!defaultMapId) {
      return maps[0];
    }
    return maps.find((map) => map.spec.id === defaultMapId) ?? maps[0];
  }

  private getMapSpecs(): MapSpec[] {
    return Array.from(this.mapsById.values()).map((map) => map.spec);
  }

  private getActiveMap(): LoadedMap | null {
    const activeId = this.store.getState().activeMapId;
    if (!activeId) {
      return null;
    }
    return this.mapsById.get(activeId) ?? null;
  }

  private handleModeChange(mode: DrawMode): void {
    this.store.setMode(mode);
    this.canvas.focus();
  }

  private handleScaleChange(scalePercent: ScalePercent): void {
    if (this.currentScalePercent === scalePercent) {
      return;
    }
    const preferredFilename = this.getActiveMap()?.spec.filename ?? null;
    this.currentScalePercent = scalePercent;
    this.toolbar.setStatus(`Loading ${scalePercent}% maps...`, "info");
    void this.loadMaps(preferredFilename);
    this.canvas.focus();
  }

  private setLoadingState(isLoading: boolean, message = "Loading maps..."): void {
    this.loadingText.textContent = message;
    this.loadingOverlay.classList.toggle("visible", isLoading);
    this.loadingOverlay.setAttribute("aria-hidden", String(!isLoading));
  }

  private handleMapChange(mapId: string): void {
    const map = this.mapsById.get(mapId);
    if (!map) {
      this.toolbar.setStatus(`Unknown map "${mapId}"`, "error");
      return;
    }
    this.store.setActiveMap(mapId);
    this.fitViewToMap(map);
    this.toolbar.setStatus(`Switched to ${map.spec.filename}`, "info");
    this.canvas.focus();
  }

  private handleClearAll(): void {
    const activeMapId = this.store.getState().activeMapId;
    if (!activeMapId) {
      return;
    }
    this.store.clearMap(activeMapId);
    this.toolbar.setStatus("Cleared drawings for current map", "info");
    this.canvas.focus();
  }

  private handleExportPng(): void {
    if (!this.store.getState().activeMapId) {
      this.toolbar.setStatus("No active map to export", "warn");
      return;
    }
    this.canvas.toBlob((blob) => {
      if (!blob) {
        this.toolbar.setStatus("Failed to export PNG", "error");
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      this.downloadBlob(blob, `wro-ruler-${timestamp}.png`);
      this.toolbar.setStatus("PNG exported", "info");
    }, "image/png");
  }

  private handleSaveSession(): void {
    const session = serializeSession(this.store.getState());
    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.downloadBlob(blob, `wro-ruler-session-${timestamp}.json`);
    this.toolbar.setStatus("Session saved", "info");
  }

  private handleLoadSession(jsonText: string): void {
    const { session, warnings } = parseSession(jsonText, new Set(this.mapsById.keys()));
    if (!session) {
      const message = warnings[0] ?? "Session load failed";
      this.toolbar.setStatus(message, "error");
      return;
    }

    for (const warning of warnings) {
      console.warn(`[WRO Ruler] ${warning}`);
    }

    const fallbackMapId = this.store.getState().activeMapId ?? this.getMapSpecs()[0]?.id ?? null;
    this.store.applySession(session, fallbackMapId);
    const active = this.getActiveMap();
    if (active) {
      this.fitViewToMap(active);
    }
    if (warnings.length > 0) {
      this.toolbar.setStatus(`Session loaded with ${warnings.length} warning(s)`, "warn");
    } else {
      this.toolbar.setStatus("Session loaded", "info");
    }
    this.canvas.focus();
  }

  private handleResize(): void {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.renderer.resize(width, height, window.devicePixelRatio || 1);
    this.updateViewAfterResize();
    this.scheduleRender();
  }

  private updateViewAfterResize(): void {
    const activeMap = this.getActiveMap();
    if (!activeMap) {
      return;
    }
    const targets = this.computeZoomTargets(activeMap);
    const view = this.store.getState().view;
    if (!targets) {
      return;
    }
    if (view.minZoom === targets.minZoom && view.zoom >= targets.minZoom) {
      return;
    }

    const viewport = this.renderer.getViewportSize();
    const centerScreen = {
      x: viewport.width * 0.5,
      y: viewport.height * 0.5,
    };
    const centerWorld = screenToWorld(centerScreen, view);
    const nextZoom = Math.max(view.zoom, targets.minZoom);
    const nextView: ViewState = {
      zoom: nextZoom,
      minZoom: targets.minZoom,
      panX: centerScreen.x - centerWorld.x * nextZoom,
      panY: centerScreen.y - centerWorld.y * nextZoom,
    };
    this.store.setView(nextView);
  }

  private fitViewToMap(map: LoadedMap): void {
    const targets = this.computeZoomTargets(map);
    if (!targets) {
      return;
    }
    const viewport = this.renderer.getViewportSize();
    const view: ViewState = {
      zoom: targets.initialZoom,
      minZoom: targets.minZoom,
      panX: (viewport.width - map.spec.imgWidthPx * targets.initialZoom) * 0.5,
      panY: (viewport.height - map.spec.imgHeightPx * targets.initialZoom) * 0.5,
    };
    this.store.setView(view);
  }

  private computeFitZoom(map: LoadedMap): number {
    const viewport = this.renderer.getViewportSize();
    const zoom = Math.min(viewport.width / map.spec.imgWidthPx, viewport.height / map.spec.imgHeightPx);
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  private computeZoomTargets(map: LoadedMap): { initialZoom: number; minZoom: number } | null {
    const fitZoom = this.computeFitZoom(map);
    if (!Number.isFinite(fitZoom) || fitZoom <= 0) {
      return null;
    }

    const initialZoom = fitZoom * INITIAL_FIT_FACTOR;
    const minZoom = fitZoom * MIN_FIT_FACTOR;
    return { initialZoom, minZoom };
  }

  private scheduleRender(): void {
    if (this.renderHandle !== null) {
      return;
    }
    this.renderHandle = window.requestAnimationFrame(() => {
      this.renderHandle = null;
      this.render();
    });
  }

  private render(): void {
    this.renderer.render({
      map: this.getActiveMap(),
      view: this.store.getState().view,
      mode: this.store.getState().mode,
      segments: this.store.getCurrentSegments(),
      polylines: this.store.getCurrentPolylines(),
      inProgress: this.store.getState().inProgress,
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
