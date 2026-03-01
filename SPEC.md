# Ruller Rewrite Specification (From Scratch)

## 1. Goal
Rebuild the application from scratch as a clean, maintainable desktop tool for measuring distances on map images in millimeters.

This rewrite should keep the useful behavior of the current app, remove current bugs, and make future changes easier.

## 2. Product Summary
The app shows a map image and lets the user:

- draw measured segments
- draw measured polylines
- snap new points to existing vertices
- constrain drawing to horizontal/vertical
- optionally round lengths to nearest 10 mm while drawing
- edit segment length by clicking the measurement label
- delete measurements by right-click near them
- place a robot footprint overlay at mouse position (with rotation)
- switch map presets
- save screenshot of the current window

## 3. Platform and Stack

- OS: Windows (primary target)
- Language: Python 3.12+
- GUI: PyQt5
- Packaging target (later): PyInstaller one-file executable

## 4. Runtime File Layout
The rewritten app must run with this minimal layout:

```text
source/
  main.py
  robots.txt
  maps/
    config.txt
    *.png
```

Optional:

- `.venv/`
- `requirements.txt`
- additional modules under `app/`

## 5. External Data Formats

### 5.1 `maps/config.txt`
Each non-empty line:

```text
<image_filename> <real_width_mm> <real_height_mm>
```

Example:

```text
WRO_2025_Junior.png 2362 1143
WRO_2025_Senior.png 2362 1143
WRO_2025_Elementary.png 2362 1143
```

Rules:

- `image_filename` is relative to `maps/`.
- Width/height are positive integers in millimeters.
- Invalid lines are ignored with warning (not crash).

### 5.2 `robots.txt`
Each non-empty line:

```text
<name> <width_mm> <height_mm>
```

Example:

```text
robot 200 150
```

Rules:

- Width/height are positive integers in millimeters.
- Invalid lines are ignored with warning (not crash).

## 6. Functional Requirements

### FR-01 Map Loading

- On startup, load maps from `maps/config.txt`.
- If no maps are valid, app still opens and shows a neutral empty canvas state.
- If a map image file is missing, app must not crash. Show status warning.

### FR-02 Viewport (Zoom/Pan/Fit)

- Initial view fits map to window while preserving aspect ratio.
- Mouse wheel zooms in/out around cursor position.
- Minimum zoom equals "fit to window" zoom.
- Panning:
  - middle mouse drag pans
  - arrow keys pan continuously while held
- Panning is clamped so map cannot be dragged infinitely away.

### FR-03 Segment Mode

- First left click sets start point.
- Second left click sets end point and commits segment.
- Segment is rendered with endpoints and distance label in mm.
- Preview line and preview label shown while hovering before second click.

### FR-04 Polyline Mode

- Each left click adds a vertex.
- Right click finalizes current polyline if it has at least 2 points.
- Show measured length label per segment.
- Show interior angle labels for polyline corners.
- Escape-like behavior: right click with <2 points cancels current in-progress polyline.

### FR-05 Snapping

- Candidate points:
  - all segment endpoints
  - all committed polyline points
  - current in-progress polyline points
- Snap radius defined in screen pixels and adjusted by zoom.
- If nearest candidate is in radius, use snapped point.
- Show visual snap indicator.

### FR-06 Ortho Mode

- Toggleable mode: enforce horizontal or vertical direction relative to last point.
- Applies to segment preview and final committed point.
- Applies to polyline preview and final committed point.

### FR-07 Round-to-10-mm Mode

- Toggleable mode.
- While drawing from a previous point, projected length is rounded to nearest 10 mm.
- The direction remains toward cursor; only magnitude changes.

### FR-08 Edit Distance

- Clicking a measurement label opens integer input dialog for target length (mm).
- If accepted, corresponding segment endpoint is moved to match requested length.
- Works for:
  - single segment mode lines
  - individual segments inside polylines
- Invalid operations (zero-length segment, missing map scale) should be ignored safely.

### FR-09 Delete by Right Click

- Right click near a segment deletes nearest item under tolerance.
- For polyline, delete the entire polyline if any of its segments is hit.
- Finalize/cancel behavior and delete behavior must not conflict.

### FR-10 Robot Overlay Mode

- Toggleable mode.
- Show robot rectangle centered on cursor on map.
- Robot size comes from selected robot in `robots.txt` (mm -> px conversion by map scale).
- Press `R` rotates robot by +90 degrees.
- Draw robot name text in the rectangle.

### FR-11 Menus

- `File`:
  - `Screenshot` (save PNG)
  - `Clear All` (remove all lines and polylines on current map)
- `Map`:
  - one checkable action per map from config
  - switching map updates mm scaling and current image
- `Mode`:
  - `Segment` and `Polyline` as exclusive options
  - `Ortho (V/H) Mode` toggle
  - `Round length to 10 mm` toggle
  - `Robot` toggle

### FR-12 Screenshot

- Save current window to PNG via save dialog.
- If canceled, no action.

### FR-13 Reset / Clear

- `Clear All` clears committed and in-progress geometry.
- Map switch should clear drawings by default (explicit requirement for rewrite).

### FR-14 Focus and Input

- Main drawing widget should keep keyboard focus after map switch and after mode changes.

## 7. Geometry and Measurement Rules

- Let map real dimensions be `(REAL_WIDTH_MM, REAL_HEIGHT_MM)`.
- Let map image pixel dimensions be `(IMG_W_PX, IMG_H_PX)`.
- Conversion:
  - `mm_per_px_x = REAL_WIDTH_MM / IMG_W_PX`
  - `mm_per_px_y = REAL_HEIGHT_MM / IMG_H_PX`
- Distance between two image points `(dx_px, dy_px)`:
  - `dx_mm = dx_px * mm_per_px_x`
  - `dy_mm = dy_px * mm_per_px_y`
  - `dist_mm = hypot(dx_mm, dy_mm)`
- For display, distance text is rounded to nearest integer mm.

## 8. UI/UX Requirements

- Main window title: `Distance in mm`.
- Default window size: `1280x720`.
- Minimum size: `800x600`.
- Visual style can stay simple; prioritize precision and readability.
- Angle labels and distance labels must remain readable at common zoom levels.

## 9. Required Bug Fixes (Observed in Current Reconstructed Code)

The rewrite must explicitly fix these issues.

### BF-01 Broken Middle-Mouse Panning

- Current evidence:
  - `is_panning` initialized false and set false on middle release, but never set true in mouse press.
  - references: `main.py:103`, `main.py:243`, `main.py:375-377`.

### BF-02 Round Mode State Mismatch

- Current evidence:
  - drawing widget defaults `round_mode = True` (`main.py:80`)
  - menu toggle default is unchecked (`main.py:795`)
  - on map switch new widget is created, but only constrained mode is copied (`main.py:824-826`).
- Effect: rounding can be active while UI says disabled.

### BF-03 Map Switch Loses Mode State

- Current evidence:
  - map switch replaces drawing widget (`main.py:824`)
  - not all mode states are transferred.
- Rewrite requirement:
  - keep mode state coherent after map change.

### BF-04 Right-Click Conflict in Polyline

- Current evidence:
  - right click finalizes polyline and immediately calls delete under cursor (`main.py:366-372`).
- Effect: can delete just-finished geometry unintentionally.

### BF-05 Missing/Invalid Resources Must Never Crash

- Previous crash fixed ad-hoc around minimum scale logic.
- Rewrite must centrally guard all image-size dependent logic.

## 10. Architecture Requirements (Rewrite)

Use modular design. Suggested structure:

```text
source/
  main.py
  app/
    models.py
    config_io.py
    geometry.py
    canvas.py
    main_window.py
```

### Design Rules

- No global mutable measurement state (`REAL_WIDTH_MM`, etc. must be model state).
- Keep rendering, interaction logic, and file parsing separated.
- Add type hints for public methods.
- Use dataclasses for domain entities:
  - `MapSpec`
  - `RobotSpec`
  - `Segment`
  - `Polyline`
  - `ViewportState`
  - `ModeState`

## 11. Error Handling Requirements

- On parse errors in config files: skip bad lines, continue startup.
- On missing image file: show warning, still allow app usage.
- On invalid geometry operation (divide by zero, null pixmap): fail gracefully and log.
- App should never exit unexpectedly from user input sequences.

## 12. Logging and Diagnostics

- Add basic logging to file `ruller.log` (or console) for:
  - startup summary
  - loaded maps/robots count
  - skipped config lines
  - missing resource warnings
  - unhandled exceptions

## 13. Test Requirements

### 13.1 Unit Tests (minimum)

- config parser for `maps/config.txt` and `robots.txt`
- distance conversion math
- angle computation math
- snapping nearest-point selection

### 13.2 Manual QA Checklist

- Start with all files present.
- Start with missing `maps/config.txt`.
- Start with valid config but missing PNG file.
- Draw segment and verify distance changes with map scale.
- Draw polyline and verify segment labels and angle labels.
- Toggle ortho and round modes independently.
- Edit distance on segment label.
- Right-click delete without deleting freshly finalized polyline by mistake.
- Middle-mouse pan works.
- Arrow key pan works.
- Robot overlay and `R` rotation work.
- Map switch preserves UI mode states or intentionally resets with explicit policy.

## 14. Acceptance Criteria

Rewrite is considered complete when:

- all functional requirements FR-01..FR-14 are implemented
- all bug fixes BF-01..BF-05 are verified
- app runs from clean environment with documented install steps
- no crashes in manual QA checklist
- code is modular and typed enough for further development

## 15. Build and Run Instructions (Target)

```powershell
cd source
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

`requirements.txt` should include at least:

```text
PyQt5>=5.15,<6
```

## 16. Implementation Brief for Coding Agent

Implement a new clean codebase (do not patch old reconstructed logic), with behavior parity plus bug fixes from this spec.

Deliverables:

- runnable `main.py`
- modular `app/` package
- `requirements.txt`
- tests for parser/math/snap logic
- short `README.md` with run instructions

Do not remove support for existing `maps/config.txt` and `robots.txt` formats.
