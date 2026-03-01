import type { DrawMode, MapSpec, ScalePercent } from "../state/types";

export type StatusKind = "info" | "warn" | "error";

export interface ToolbarCallbacks {
  onMapChange: (mapId: string) => void;
  onScaleChange: (scalePercent: ScalePercent) => void;
  onModeChange: (mode: DrawMode) => void;
  onOrthoToggle: (enabled: boolean) => void;
  onRoundTo10Toggle: (enabled: boolean) => void;
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
  private readonly orthoButton: HTMLButtonElement;
  private readonly roundButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly loadButton: HTMLButtonElement;
  private readonly loadInput: HTMLInputElement;
  private readonly statusNode: HTMLSpanElement;
  private callbacks: ToolbarCallbacks;

  constructor(host: HTMLElement, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "toolbar";
    host.appendChild(this.root);

    const mapGroup = this.createGroup();
    const mapLabel = document.createElement("label");
    mapLabel.textContent = "Map";
    this.mapSelect = document.createElement("select");
    this.mapSelect.addEventListener("change", () => {
      this.callbacks.onMapChange(this.mapSelect.value);
    });
    mapGroup.append(mapLabel, this.mapSelect);

    const scaleGroup = this.createGroup();
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

    const modeGroup = this.createGroup();
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Mode";
    this.segmentButton = document.createElement("button");
    this.segmentButton.textContent = "Segment";
    this.segmentButton.type = "button";
    this.segmentButton.addEventListener("click", () => this.callbacks.onModeChange("segment"));
    this.polylineButton = document.createElement("button");
    this.polylineButton.textContent = "Polyline";
    this.polylineButton.type = "button";
    this.polylineButton.addEventListener("click", () => this.callbacks.onModeChange("polyline"));
    this.orthoButton = document.createElement("button");
    this.orthoButton.textContent = "Ortho (V/H)";
    this.orthoButton.type = "button";
    this.orthoButton.addEventListener("click", () => {
      const next = !this.orthoButton.classList.contains("active");
      this.callbacks.onOrthoToggle(next);
    });
    this.roundButton = document.createElement("button");
    this.roundButton.textContent = "Round 10 mm";
    this.roundButton.type = "button";
    this.roundButton.addEventListener("click", () => {
      const next = !this.roundButton.classList.contains("active");
      this.callbacks.onRoundTo10Toggle(next);
    });
    modeGroup.append(
      modeLabel,
      this.segmentButton,
      this.polylineButton,
      this.orthoButton,
      this.roundButton,
    );

    const actionGroup = this.createGroup();
    this.clearButton = this.createButton("Clear All", () => this.callbacks.onClearAll());
    this.exportButton = this.createButton("Export PNG", () => this.callbacks.onExportPng());
    this.saveButton = this.createButton("Save JSON", () => this.callbacks.onSaveSession());
    this.loadButton = this.createButton("Load JSON", () => this.loadInput.click());
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

    this.statusNode = document.createElement("span");
    this.statusNode.className = "status";
    this.statusNode.textContent = "Ready";

    this.root.append(this.loadInput, this.statusNode);
    this.setMode("segment");
    this.setMapControlsEnabled(false);
  }

  setMaps(maps: MapSpec[], activeMapId: string | null): void {
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
  }

  setOrthoEnabled(enabled: boolean): void {
    this.orthoButton.classList.toggle("active", enabled);
  }

  setRoundTo10Enabled(enabled: boolean): void {
    this.roundButton.classList.toggle("active", enabled);
  }

  setStatus(message: string, kind: StatusKind = "info"): void {
    this.statusNode.textContent = message;
    this.statusNode.className = `status ${kind}`;
  }

  private setMapControlsEnabled(enabled: boolean): void {
    this.mapSelect.disabled = !enabled;
    this.scaleSelect.disabled = !enabled;
    this.segmentButton.disabled = !enabled;
    this.polylineButton.disabled = !enabled;
    this.orthoButton.disabled = !enabled;
    this.roundButton.disabled = !enabled;
    this.clearButton.disabled = !enabled;
    this.exportButton.disabled = !enabled;
    this.saveButton.disabled = !enabled;
    this.loadButton.disabled = !enabled;
  }

  private createGroup(): HTMLDivElement {
    const group = document.createElement("div");
    group.className = "toolbar-group";
    this.root.appendChild(group);
    return group;
  }

  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }
}
