import type { DrawMode, ScalePercent } from "../state/types";

export interface MapSelectorOption {
  id: string;
  filename: string;
}

export type StatusKind = "info" | "warn" | "error";

export interface ToolbarCallbacks {
  onMapChange: (mapId: string) => void;
  onScaleChange: (scalePercent: ScalePercent) => void;
  onModeChange: (mode: DrawMode) => void;
  onOrthoToggle: (enabled: boolean) => void;
  onRoundTo10Toggle: (enabled: boolean) => void;
  onRobotToggle: (enabled: boolean) => void;
  onRobotSizeChange: (widthMm: number, heightMm: number) => void;
  onClearAll: () => void;
  onExportPng: () => void;
  onSaveSession: () => void;
  onLoadSession: (jsonText: string) => void;
}

export class ToolbarView {
  private readonly root: HTMLDivElement;
  private readonly mapPicker: HTMLDivElement;
  private readonly mapButton: HTMLButtonElement;
  private readonly mapMenu: HTMLDivElement;
  private readonly scalePicker: HTMLDivElement;
  private readonly scaleButton: HTMLButtonElement;
  private readonly scaleMenu: HTMLDivElement;
  private readonly segmentButton: HTMLButtonElement;
  private readonly polylineButton: HTMLButtonElement;
  private readonly arcButton: HTMLButtonElement;
  private readonly orthoButton: HTMLButtonElement;
  private readonly roundButton: HTMLButtonElement;
  private readonly robotButton: HTMLButtonElement;
  private readonly robotWidthInput: HTMLInputElement;
  private readonly robotHeightInput: HTMLInputElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly loadButton: HTMLButtonElement;
  private readonly loadInput: HTMLInputElement;
  private mapOptions: MapSelectorOption[] = [];
  private activeMapId: string | null = null;
  private activeScale: ScalePercent = 25;
  private callbacks: ToolbarCallbacks;

  constructor(host: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "toolbar";
    host.appendChild(this.root);

    const mapGroup = this.createGroup("toolbar-group toolbar-group--map");
    this.mapPicker = document.createElement("div");
    this.mapPicker.className = "map-picker";
    this.mapButton = document.createElement("button");
    this.mapButton.type = "button";
    this.mapButton.className = "btn-map-picker";
    this.mapButton.textContent = "Map";
    this.mapButton.setAttribute("aria-label", "Select map");
    this.mapButton.addEventListener("click", () => this.toggleMapMenu());
    this.mapMenu = document.createElement("div");
    this.mapMenu.className = "map-menu";
    this.mapMenu.setAttribute("role", "listbox");
    this.mapPicker.append(this.mapButton, this.mapMenu);
    mapGroup.append(this.mapPicker);

    const scaleGroup = this.createGroup("toolbar-group toolbar-group--scale");
    this.scalePicker = document.createElement("div");
    this.scalePicker.className = "scale-picker";
    this.scaleButton = document.createElement("button");
    this.scaleButton.type = "button";
    this.scaleButton.className = "btn-scale-picker";
    this.scaleButton.textContent = "Scale";
    this.scaleButton.setAttribute("aria-label", "Select scale");
    this.scaleButton.addEventListener("click", () => this.toggleScaleMenu());
    this.scaleMenu = document.createElement("div");
    this.scaleMenu.className = "scale-menu";
    this.scaleMenu.setAttribute("role", "listbox");
    this.scalePicker.append(this.scaleButton, this.scaleMenu);
    scaleGroup.append(this.scalePicker);

    const drawGroup = this.createGroup("toolbar-group toolbar-group--draw");
    const drawLabel = document.createElement("label");
    drawLabel.textContent = "Draw";
    this.segmentButton = document.createElement("button");
    this.segmentButton.className = "btn-mode";
    this.segmentButton.textContent = "Segment";
    this.segmentButton.type = "button";
    this.segmentButton.addEventListener("click", () => this.callbacks.onModeChange("segment"));
    this.polylineButton = document.createElement("button");
    this.polylineButton.className = "btn-mode";
    this.polylineButton.textContent = "Polyline";
    this.polylineButton.type = "button";
    this.polylineButton.addEventListener("click", () => this.callbacks.onModeChange("polyline"));
    this.arcButton = document.createElement("button");
    this.arcButton.className = "btn-mode";
    this.arcButton.textContent = "Arc";
    this.arcButton.type = "button";
    this.arcButton.addEventListener("click", () => this.callbacks.onModeChange("arc"));
    drawGroup.append(drawLabel, this.segmentButton, this.polylineButton, this.arcButton);

    const assistGroup = this.createGroup("toolbar-group toolbar-group--assist");
    const assistLabel = document.createElement("label");
    assistLabel.textContent = "Assist";
    this.orthoButton = document.createElement("button");
    this.orthoButton.className = "btn-toggle";
    this.orthoButton.textContent = "Ortho (V/H)";
    this.orthoButton.type = "button";
    this.orthoButton.addEventListener("click", () => {
      const next = !this.orthoButton.classList.contains("active");
      this.callbacks.onOrthoToggle(next);
    });
    this.roundButton = document.createElement("button");
    this.roundButton.className = "btn-toggle";
    this.roundButton.textContent = "Round 10 mm";
    this.roundButton.type = "button";
    this.roundButton.addEventListener("click", () => {
      const next = !this.roundButton.classList.contains("active");
      this.callbacks.onRoundTo10Toggle(next);
    });
    this.robotButton = document.createElement("button");
    this.robotButton.className = "btn-toggle";
    this.robotButton.textContent = "Robot";
    this.robotButton.type = "button";
    this.robotButton.addEventListener("click", () => {
      const next = !this.robotButton.classList.contains("active");
      this.callbacks.onRobotToggle(next);
    });
    this.robotWidthInput = document.createElement("input");
    this.robotWidthInput.type = "number";
    this.robotWidthInput.min = "1";
    this.robotWidthInput.step = "1";
    this.robotWidthInput.value = "250";
    this.robotWidthInput.className = "robot-size-input";
    this.robotWidthInput.title = "Robot width (mm)";
    this.robotWidthInput.setAttribute("aria-label", "Robot width (mm)");
    this.robotHeightInput = document.createElement("input");
    this.robotHeightInput.type = "number";
    this.robotHeightInput.min = "1";
    this.robotHeightInput.step = "1";
    this.robotHeightInput.value = "250";
    this.robotHeightInput.className = "robot-size-input";
    this.robotHeightInput.title = "Robot height (mm)";
    this.robotHeightInput.setAttribute("aria-label", "Robot height (mm)");
    const robotSizeLabel = document.createElement("span");
    robotSizeLabel.textContent = "mm";
    robotSizeLabel.className = "robot-size-label";
    const emitRobotSize = () => {
      const parsedWidth = Number.parseFloat(this.robotWidthInput.value);
      const parsedHeight = Number.parseFloat(this.robotHeightInput.value);
      const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 250;
      const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 250;
      this.robotWidthInput.value = String(Math.round(width));
      this.robotHeightInput.value = String(Math.round(height));
      this.callbacks.onRobotSizeChange(width, height);
    };
    this.robotWidthInput.addEventListener("change", emitRobotSize);
    this.robotHeightInput.addEventListener("change", emitRobotSize);
    assistGroup.append(
      assistLabel,
      this.orthoButton,
      this.roundButton,
      this.robotButton,
      this.robotWidthInput,
      this.robotHeightInput,
      robotSizeLabel,
    );

    const actionGroup = this.createGroup("toolbar-group toolbar-group--actions");
    const actionLabel = document.createElement("label");
    actionLabel.textContent = "Actions";
    this.clearButton = this.createButton("Clear All", () => this.callbacks.onClearAll(), "btn-action btn-danger");
    this.exportButton = this.createButton(
      "Export PNG",
      () => this.callbacks.onExportPng(),
      "btn-action btn-neutral",
    );
    this.saveButton = this.createButton(
      "Save JSON",
      () => this.callbacks.onSaveSession(),
      "btn-action btn-neutral",
    );
    this.loadButton = this.createButton("Load JSON", () => this.loadInput.click(), "btn-action btn-neutral");
    actionGroup.append(actionLabel);
    actionGroup.append(this.clearButton, this.exportButton, this.saveButton, this.loadButton);

    this.loadInput = document.createElement("input");
    this.loadInput.type = "file";
    this.loadInput.accept = ".json,application/json";
    this.loadInput.style.display = "none";
    this.loadInput.addEventListener("change", async () => {
      const file = this.loadInput.files?.[0];
      this.loadInput.value = "";
      if (!file) {
        return;
      }
      const content = await file.text();
      this.callbacks.onLoadSession(content);
    });

    this.root.append(this.loadInput);
    this.setMode("segment");
    this.setRobotEnabled(false);
    this.setRobotSize(250, 250);
    this.renderScaleMenu();
    this.updateScaleButton();
    this.setMapControlsEnabled(false);

    window.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!this.mapPicker.contains(target)) {
        this.closeMapMenu();
      }
      if (!this.scalePicker.contains(target)) {
        this.closeScaleMenu();
      }
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeMapMenu();
        this.closeScaleMenu();
      }
    });
  }

  setMaps(maps: MapSelectorOption[], activeMapId: string | null): void {
    this.mapOptions = maps.slice();
    if (activeMapId && maps.some((map) => map.id === activeMapId)) {
      this.activeMapId = activeMapId;
    } else {
      this.activeMapId = maps[0]?.id ?? null;
    }
    this.renderMapMenu();
    this.updateMapButton();
    this.setMapControlsEnabled(maps.length > 0);
  }

  setActiveMap(activeMapId: string | null): void {
    if (!activeMapId || !this.mapOptions.some((map) => map.id === activeMapId)) {
      return;
    }
    this.activeMapId = activeMapId;
    this.renderMapMenu();
    this.updateMapButton();
  }

  setScale(scalePercent: ScalePercent): void {
    this.activeScale = scalePercent;
    this.renderScaleMenu();
    this.updateScaleButton();
  }

  setMode(mode: DrawMode): void {
    this.segmentButton.classList.toggle("active", mode === "segment");
    this.polylineButton.classList.toggle("active", mode === "polyline");
    this.arcButton.classList.toggle("active", mode === "arc");
  }

  setOrthoEnabled(enabled: boolean): void {
    this.orthoButton.classList.toggle("active", enabled);
  }

  setRoundTo10Enabled(enabled: boolean): void {
    this.roundButton.classList.toggle("active", enabled);
  }

  setRobotEnabled(enabled: boolean): void {
    this.robotButton.classList.toggle("active", enabled);
  }

  setRobotSize(widthMm: number, heightMm: number): void {
    const clampedWidth = Number.isFinite(widthMm) && widthMm > 0 ? Math.round(widthMm) : 250;
    const clampedHeight = Number.isFinite(heightMm) && heightMm > 0 ? Math.round(heightMm) : 250;
    this.robotWidthInput.value = String(clampedWidth);
    this.robotHeightInput.value = String(clampedHeight);
  }

  setStatus(message: string, kind: StatusKind = "info"): void {
    if (kind === "error") {
      console.error(`[WRO Ruler] ${message}`);
      return;
    }
    if (kind === "warn") {
      console.warn(`[WRO Ruler] ${message}`);
      return;
    }
    console.info(`[WRO Ruler] ${message}`);
  }

  private setMapControlsEnabled(enabled: boolean): void {
    this.mapButton.disabled = !enabled;
    this.scaleButton.disabled = !enabled;
    this.segmentButton.disabled = !enabled;
    this.polylineButton.disabled = !enabled;
    this.arcButton.disabled = !enabled;
    this.orthoButton.disabled = !enabled;
    this.roundButton.disabled = !enabled;
    this.robotButton.disabled = !enabled;
    this.robotWidthInput.disabled = !enabled;
    this.robotHeightInput.disabled = !enabled;
    this.clearButton.disabled = !enabled;
    this.exportButton.disabled = !enabled;
    this.saveButton.disabled = !enabled;
    this.loadButton.disabled = !enabled;
    if (!enabled) {
      this.closeMapMenu();
      this.closeScaleMenu();
    }
  }

  private createGroup(className = "toolbar-group"): HTMLDivElement {
    const group = document.createElement("div");
    group.className = className;
    this.root.appendChild(group);
    return group;
  }

  private createButton(text: string, onClick: () => void, className = ""): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    if (className) {
      button.className = className;
    }
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  private toggleMapMenu(): void {
    if (this.mapMenu.classList.contains("open")) {
      this.closeMapMenu();
      return;
    }
    this.openMapMenu();
  }

  private openMapMenu(): void {
    if (this.mapButton.disabled || this.mapOptions.length === 0) {
      return;
    }
    this.closeScaleMenu();
    this.mapMenu.classList.add("open");
    this.mapButton.classList.add("active");
  }

  private closeMapMenu(): void {
    this.mapMenu.classList.remove("open");
    this.mapButton.classList.remove("active");
  }

  private renderMapMenu(): void {
    this.mapMenu.innerHTML = "";
    for (const map of this.mapOptions) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "map-menu-item";
      item.textContent = map.filename;
      item.title = map.filename;
      item.setAttribute("role", "option");
      item.classList.toggle("active", map.id === this.activeMapId);
      item.addEventListener("click", () => {
        this.closeMapMenu();
        if (map.id !== this.activeMapId) {
          this.callbacks.onMapChange(map.id);
        }
      });
      this.mapMenu.appendChild(item);
    }
  }

  private updateMapButton(): void {
    const active = this.mapOptions.find((map) => map.id === this.activeMapId) ?? null;
    this.mapButton.textContent = "Map";
    this.mapButton.title = active ? `Map: ${active.filename}` : "Map";
  }

  private toggleScaleMenu(): void {
    if (this.scaleMenu.classList.contains("open")) {
      this.closeScaleMenu();
      return;
    }
    this.openScaleMenu();
  }

  private openScaleMenu(): void {
    if (this.scaleButton.disabled) {
      return;
    }
    this.closeMapMenu();
    this.scaleMenu.classList.add("open");
    this.scaleButton.classList.add("active");
  }

  private closeScaleMenu(): void {
    this.scaleMenu.classList.remove("open");
    this.scaleButton.classList.remove("active");
  }

  private renderScaleMenu(): void {
    this.scaleMenu.innerHTML = "";
    for (const scale of [25, 50, 75, 100] as const) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "scale-menu-item";
      item.textContent = `${scale}%`;
      item.title = `${scale}%`;
      item.setAttribute("role", "option");
      item.classList.toggle("active", scale === this.activeScale);
      item.addEventListener("click", () => {
        this.closeScaleMenu();
        if (scale !== this.activeScale) {
          this.callbacks.onScaleChange(scale);
        }
      });
      this.scaleMenu.appendChild(item);
    }
  }

  private updateScaleButton(): void {
    this.scaleButton.textContent = "Scale";
    this.scaleButton.title = `Scale: ${this.activeScale}%`;
  }
}
