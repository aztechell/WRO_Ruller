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
  private readonly mapSelect: HTMLSelectElement;
  private readonly scaleSelect: HTMLSelectElement;
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
  private callbacks: ToolbarCallbacks;

  constructor(host: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "toolbar";
    host.appendChild(this.root);

    const mapGroup = this.createGroup("toolbar-group toolbar-group--map");
    const mapLabel = document.createElement("label");
    mapLabel.textContent = "Map";
    this.mapSelect = document.createElement("select");
    this.mapSelect.addEventListener("change", () => {
      this.callbacks.onMapChange(this.mapSelect.value);
    });
    mapGroup.append(mapLabel, this.mapSelect);

    const scaleGroup = this.createGroup("toolbar-group toolbar-group--scale");
    const scaleLabel = document.createElement("label");
    scaleLabel.textContent = "Scale";
    this.scaleSelect = document.createElement("select");
    for (const scale of [25, 50, 75, 100] as const) {
      const option = document.createElement("option");
      option.value = String(scale);
      option.textContent = `${scale}%`;
      this.scaleSelect.append(option);
    }
    this.scaleSelect.value = "25";
    this.scaleSelect.addEventListener("change", () => {
      this.callbacks.onScaleChange(Number(this.scaleSelect.value) as ScalePercent);
    });
    scaleGroup.append(scaleLabel, this.scaleSelect);

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
    this.setMapControlsEnabled(false);
  }

  setMaps(maps: MapSelectorOption[], activeMapId: string | null): void {
    this.mapSelect.innerHTML = "";
    for (const map of maps) {
      const option = document.createElement("option");
      option.value = map.id;
      option.textContent = map.filename;
      this.mapSelect.append(option);
    }

    if (activeMapId && maps.some((map) => map.id === activeMapId)) {
      this.mapSelect.value = activeMapId;
    } else if (maps.length > 0) {
      this.mapSelect.selectedIndex = 0;
    }

    this.setMapControlsEnabled(maps.length > 0);
  }

  setActiveMap(activeMapId: string | null): void {
    if (!activeMapId) {
      return;
    }
    this.mapSelect.value = activeMapId;
  }

  setScale(scalePercent: ScalePercent): void {
    this.scaleSelect.value = String(scalePercent);
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
    this.mapSelect.disabled = !enabled;
    this.scaleSelect.disabled = !enabled;
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
}
