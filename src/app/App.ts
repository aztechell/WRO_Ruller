import { screenToWorld } from "../geometry/measure";
import { InputController } from "../input/controller";
import { loadMapsFromConfig, type LoadedMap } from "../io/mapConfig";
import { parseSession, serializeSession } from "../io/session";
import { CanvasRenderer } from "../render/canvasRenderer";
import { AppStore } from "../state/store";
import type { DrawMode, MapSpec, ViewState } from "../state/types";
import { ToolbarView } from "../ui/toolbar";

export class App {
  private readonly root: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly toolbar: ToolbarView;
  private readonly renderer: CanvasRenderer;
  private readonly store = new AppStore();
  private readonly mapsById = new Map<string, LoadedMap>();
  private readonly resizeObserver: ResizeObserver;

  private inputController: InputController | null = null;
  private renderHandle: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = "app-root";

    const toolbarHost = document.createElement("div");
    this.stage = document.createElement("div");
    this.stage.className = "stage";
    this.canvas = document.createElement("canvas");
    this.canvas.tabIndex = 0;
    this.stage.appendChild(this.canvas);
    this.root.append(toolbarHost, this.stage);

    this.renderer = new CanvasRenderer(this.canvas);
    this.toolbar = new ToolbarView(toolbarHost, {
      onMapChange: (mapId) => this.handleMapChange(mapId),
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

  private async loadMaps(): Promise<void> {
    const configUrl = `${import.meta.env.BASE_URL}maps/config.txt`;
    const { maps, warnings } = await loadMapsFromConfig(configUrl);
    this.mapsById.clear();
    for (const map of maps) {
      this.mapsById.set(map.spec.id, map);
    }

    const mapSpecs = this.getMapSpecs();
    const firstMap = maps[0] ?? null;
    this.toolbar.setMaps(mapSpecs, firstMap?.spec.id ?? null);

    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.warn(`[WRO Ruler] ${warning}`);
      }
    }

    if (!firstMap) {
      this.toolbar.setStatus("No valid maps loaded", "warn");
      return;
    }

    this.store.setActiveMap(firstMap.spec.id);
    this.fitViewToMap(firstMap);
    this.canvas.focus();

    if (warnings.length > 0) {
      this.toolbar.setStatus(`Loaded ${maps.length} map(s), ${warnings.length} warning(s)`, "warn");
      return;
    }

    this.toolbar.setStatus(`Loaded ${maps.length} map(s)`, "info");
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
    const fitZoom = this.computeFitZoom(activeMap);
    const view = this.store.getState().view;
    if (!Number.isFinite(fitZoom) || fitZoom <= 0) {
      return;
    }
    if (view.minZoom === fitZoom && view.zoom >= fitZoom) {
      return;
    }

    const viewport = this.renderer.getViewportSize();
    const centerScreen = {
      x: viewport.width * 0.5,
      y: viewport.height * 0.5,
    };
    const centerWorld = screenToWorld(centerScreen, view);
    const nextZoom = Math.max(view.zoom, fitZoom);
    const nextView: ViewState = {
      zoom: nextZoom,
      minZoom: fitZoom,
      panX: centerScreen.x - centerWorld.x * nextZoom,
      panY: centerScreen.y - centerWorld.y * nextZoom,
    };
    this.store.setView(nextView);
  }

  private fitViewToMap(map: LoadedMap): void {
    const zoom = this.computeFitZoom(map);
    const viewport = this.renderer.getViewportSize();
    const view: ViewState = {
      zoom,
      minZoom: zoom,
      panX: (viewport.width - map.spec.imgWidthPx * zoom) * 0.5,
      panY: (viewport.height - map.spec.imgHeightPx * zoom) * 0.5,
    };
    this.store.setView(view);
  }

  private computeFitZoom(map: LoadedMap): number {
    const viewport = this.renderer.getViewportSize();
    const zoom = Math.min(viewport.width / map.spec.imgWidthPx, viewport.height / map.spec.imgHeightPx);
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
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
