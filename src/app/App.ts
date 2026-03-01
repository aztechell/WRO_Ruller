import { screenToWorld } from "../geometry/measure";
import { InputController } from "../input/controller";
import {
  loadMapByEntry,
  loadMapManifest,
  type LoadedMap,
  type MapManifestEntry,
} from "../io/mapConfig";
import { parseSession, serializeSession } from "../io/session";
import { CanvasRenderer } from "../render/canvasRenderer";
import { AppStore } from "../state/store";
import type { DrawMode, ViewState } from "../state/types";
import { ToolbarView } from "../ui/toolbar";

const INITIAL_FIT_FACTOR = 0.9;
const MIN_FIT_FACTOR = 0.5;

export class App {
  private readonly root: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly loadingOverlay: HTMLDivElement;
  private readonly loadingText: HTMLDivElement;
  private readonly helpDock: HTMLDivElement;
  private readonly toolbar: ToolbarView;
  private readonly renderer: CanvasRenderer;
  private readonly store = new AppStore();
  private readonly resizeObserver: ResizeObserver;

  private readonly mapManifestById = new Map<string, MapManifestEntry>();
  private mapManifestOrder: MapManifestEntry[] = [];
  private activeLoadedMap: LoadedMap | null = null;
  private readonly configUrl: string;

  private inputController: InputController | null = null;
  private renderHandle: number | null = null;
  private mapLoadRequestId = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = "app-root";
    this.configUrl = `${import.meta.env.BASE_URL}maps_scaled/config.txt`;

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

    this.helpDock = document.createElement("div");
    this.helpDock.className = "quick-help-dock";
    this.helpDock.innerHTML = [
      "<div class=\"quick-help-trigger\" aria-label=\"Show instructions\" title=\"Show instructions\">?</div>",
      "<div class=\"quick-help-panel\">",
      "<div class=\"quick-help-title\">Quick Controls</div>",
      "<div>Left click: draw / edit label</div>",
      "<div>Arc mode: click start, click heading, move mouse, click to commit</div>",
      "<div>Right click: finalize polyline, cancel arc setup, or delete hit</div>",
      "<div>Middle drag or Arrows: pan view</div>",
      "<div>Wheel: zoom</div>",
      "<div>Space: reset view</div>",
      "<div>Robot assist: cursor rectangle (size in mm)</div>",
      "</div>",
    ].join("");
    this.stage.appendChild(this.helpDock);

    this.root.append(toolbarHost, this.stage);

    this.renderer = new CanvasRenderer(this.canvas);
    this.toolbar = new ToolbarView(toolbarHost, {
      onMapChange: (mapId) => this.handleMapChange(mapId),
      onModeChange: (mode) => this.handleModeChange(mode),
      onOrthoToggle: (enabled) => this.handleOrthoToggle(enabled),
      onRoundTo10Toggle: (enabled) => this.handleRoundTo10Toggle(enabled),
      onRobotToggle: (enabled) => this.handleRobotToggle(enabled),
      onRobotSizeChange: (widthMm, heightMm) => this.handleRobotSizeChange(widthMm, heightMm),
      onClearAll: () => this.handleClearAll(),
      onExportPng: () => this.handleExportPng(),
      onSaveSession: () => this.handleSaveSession(),
      onLoadSession: (text) => this.handleLoadSession(text),
    });

    this.store.subscribe((state) => {
      this.toolbar.setMode(state.mode);
      this.toolbar.setOrthoEnabled(state.orthoEnabled);
      this.toolbar.setRoundTo10Enabled(state.roundTo10Enabled);
      this.toolbar.setRobotEnabled(state.robotEnabled);
      this.toolbar.setRobotSize(state.robotWidthMm, state.robotHeightMm);
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

    this.inputController = new InputController({
      canvas: this.canvas,
      store: this.store,
      getActiveMap: () => this.getActiveMap(),
      getViewportSize: () => this.renderer.getViewportSize(),
      requestRender: () => this.scheduleRender(),
      onResetView: () => this.resetViewToActiveMap(),
    });

    await this.loadManifestAndActivateMap();
    this.scheduleRender();
  }

  private async loadManifestAndActivateMap(preferredMapId: string | null = null): Promise<void> {
    const requestId = this.mapLoadRequestId + 1;
    this.mapLoadRequestId = requestId;
    this.setLoadingState(true, "Loading maps...");

    try {
      const manifest = await loadMapManifest(this.configUrl);
      if (requestId !== this.mapLoadRequestId) {
        return;
      }

      this.mapManifestById.clear();
      this.mapManifestOrder = manifest.maps;
      for (const entry of manifest.maps) {
        this.mapManifestById.set(entry.id, entry);
      }
      this.toolbar.setMaps(this.mapManifestOrder, null);

      for (const warning of manifest.warnings) {
        console.warn(`[WRO Ruler] ${warning}`);
      }

      const targetMapId = this.pickStartupMapId(preferredMapId, manifest.defaultMapId);
      if (!targetMapId) {
        this.activeLoadedMap = null;
        this.store.setActiveMap(null);
        this.toolbar.setStatus("No valid maps loaded", "warn");
        return;
      }

      const loaded = await this.loadActiveMapById(targetMapId, requestId);
      if (requestId !== this.mapLoadRequestId) {
        return;
      }

      const warningCount = manifest.warnings.length + loaded.warnings.length;
      for (const warning of loaded.warnings) {
        console.warn(`[WRO Ruler] ${warning}`);
      }

      if (!loaded.map) {
        this.toolbar.setStatus(`Failed to load "${targetMapId}"`, "error");
        return;
      }

      if (warningCount > 0) {
        this.toolbar.setStatus(
          `Loaded ${this.mapManifestOrder.length} map(s), ${warningCount} warning(s)`,
          "warn",
        );
      } else {
        this.toolbar.setStatus(`Loaded ${this.mapManifestOrder.length} map(s)`, "info");
      }
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

  private async activateSingleMap(mapId: string, statusPrefix: string): Promise<void> {
    const entry = this.mapManifestById.get(mapId);
    if (!entry) {
      this.toolbar.setStatus(`Unknown map "${mapId}"`, "error");
      return;
    }

    const requestId = this.mapLoadRequestId + 1;
    this.mapLoadRequestId = requestId;
    this.setLoadingState(true, `Loading ${entry.filename}...`);

    try {
      const loaded = await this.loadActiveMapById(mapId, requestId);
      if (requestId !== this.mapLoadRequestId) {
        return;
      }

      for (const warning of loaded.warnings) {
        console.warn(`[WRO Ruler] ${warning}`);
      }

      if (!loaded.map) {
        this.toolbar.setStatus(`Failed to load ${entry.filename}`, "error");
        return;
      }

      if (loaded.warnings.length > 0) {
        this.toolbar.setStatus(`${statusPrefix} with ${loaded.warnings.length} warning(s)`, "warn");
      } else {
        this.toolbar.setStatus(statusPrefix, "info");
      }
    } finally {
      if (requestId === this.mapLoadRequestId) {
        this.setLoadingState(false);
      }
    }
  }

  private async loadActiveMapById(
    mapId: string,
    requestId: number,
  ): Promise<{ map: LoadedMap | null; warnings: string[] }> {
    const entry = this.mapManifestById.get(mapId);
    if (!entry) {
      return {
        map: null,
        warnings: [`unknown map id "${mapId}"`],
      };
    }

    const loaded = await loadMapByEntry(entry, this.configUrl);
    if (requestId !== this.mapLoadRequestId) {
      return {
        map: null,
        warnings: loaded.warnings,
      };
    }

    this.activeLoadedMap = loaded.map;
    this.store.setActiveMap(mapId);

    if (loaded.map) {
      this.ensureRendererViewportSize();
      this.fitViewToMap(loaded.map);
      this.toolbar.setMaps(this.mapManifestOrder, mapId);
      this.canvas.focus();
    }

    return loaded;
  }

  private pickStartupMapId(preferredMapId: string | null, defaultMapId: string | null): string | null {
    if (preferredMapId && this.mapManifestById.has(preferredMapId)) {
      return preferredMapId;
    }
    if (defaultMapId && this.mapManifestById.has(defaultMapId)) {
      return defaultMapId;
    }
    return this.mapManifestOrder[0]?.id ?? null;
  }

  private getActiveMap(): LoadedMap | null {
    return this.activeLoadedMap;
  }

  private handleModeChange(mode: DrawMode): void {
    this.store.setMode(mode);
    this.canvas.focus();
  }

  private handleOrthoToggle(enabled: boolean): void {
    this.store.setOrthoEnabled(enabled);
    this.toolbar.setStatus(`Ortho mode ${enabled ? "enabled" : "disabled"}`, "info");
    this.canvas.focus();
  }

  private handleRoundTo10Toggle(enabled: boolean): void {
    this.store.setRoundTo10Enabled(enabled);
    this.toolbar.setStatus(`Round-to-10 mode ${enabled ? "enabled" : "disabled"}`, "info");
    this.canvas.focus();
  }

  private handleRobotToggle(enabled: boolean): void {
    this.store.setRobotEnabled(enabled);
    this.toolbar.setStatus(`Robot assist ${enabled ? "enabled" : "disabled"}`, "info");
    this.canvas.focus();
  }

  private handleRobotSizeChange(widthMm: number, heightMm: number): void {
    this.store.setRobotSize(widthMm, heightMm);
    this.toolbar.setStatus(`Robot size ${Math.round(widthMm)} x ${Math.round(heightMm)} mm`, "info");
    this.canvas.focus();
  }

  private setLoadingState(isLoading: boolean, message = "Loading maps..."): void {
    this.loadingText.textContent = message;
    this.loadingOverlay.classList.toggle("visible", isLoading);
    this.loadingOverlay.setAttribute("aria-hidden", String(!isLoading));
  }

  private handleMapChange(mapId: string): void {
    void this.activateSingleMap(mapId, `Switched to ${this.mapManifestById.get(mapId)?.filename ?? mapId}`);
  }

  private resetViewToActiveMap(): void {
    const activeMap = this.getActiveMap();
    if (!activeMap) {
      return;
    }
    this.fitViewToMap(activeMap);
    this.toolbar.setStatus("View reset", "info");
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
    if (!this.store.getState().activeMapId || !this.activeLoadedMap) {
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
    const availableIds = new Set(this.mapManifestOrder.map((map) => map.id));
    const { session, warnings } = parseSession(jsonText, availableIds);
    if (!session) {
      const message = warnings[0] ?? "Session load failed";
      this.toolbar.setStatus(message, "error");
      return;
    }

    for (const warning of warnings) {
      console.warn(`[WRO Ruler] ${warning}`);
    }

    const fallbackMapId = this.store.getState().activeMapId ?? this.mapManifestOrder[0]?.id ?? null;
    this.store.applySession(session, fallbackMapId);
    const activeMapId = this.store.getState().activeMapId;
    if (activeMapId) {
      void this.activateSingleMap(activeMapId, "Session loaded");
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

  private ensureRendererViewportSize(): void {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    if (width <= 0 || height <= 0) {
      return;
    }

    const viewport = this.renderer.getViewportSize();
    const widthDiff = Math.abs(viewport.width - width);
    const heightDiff = Math.abs(viewport.height - height);
    if (widthDiff < 1 && heightDiff < 1) {
      return;
    }

    this.renderer.resize(width, height, window.devicePixelRatio || 1);
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
      arcs: this.store.getCurrentArcs(),
      robotEnabled: this.store.getState().robotEnabled,
      robotWidthMm: this.store.getState().robotWidthMm,
      robotHeightMm: this.store.getState().robotHeightMm,
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
