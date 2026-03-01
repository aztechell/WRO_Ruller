# WRO Ruler Web MVP

Static browser version of the WRO map ruler tool, designed for GitHub Pages.

## Features

- Loads map list from `public/maps/config.txt`
- Fixed map scale: `25%`
- Segment and polyline measurement modes
- Distance labels in millimeters
- Polyline interior angle labels
- Vertex snapping
- Wheel zoom (around cursor), middle-mouse pan, and arrow-key continuous pan
- Ortho (V/H) drawing mode
- Round-to-10 mm drawing mode
- Clear drawings for current map
- Export current viewport as PNG
- Save/Load drawing session as JSON

`public/maps/config.txt` supports an optional startup directive:

```text
default WRO_2026_Junior.png
```

Map lines remain:

```text
<image_filename> <real_width_mm> <real_height_mm>
```

## Project layout

```text
maps_scaled/         # source 25% PNG maps (project root)
public/maps/         # map config.txt
public/maps_scaled/  # served 25% PNG maps (synced from maps_scaled/)
src/                 # app code
scripts/             # utility scripts
tests/               # vitest unit tests
.github/workflows/   # GitHub Pages deployment workflow
```

## Local development

Requirements:

- Node.js 20+ (22 recommended)

Commands:

```bash
npm install
npm run dev
```

Build and test:

```bash
npm run test
npm run build
```

## GitHub Pages deployment

1. Push to `main`.
2. In repository settings, set Pages source to GitHub Actions.
3. Workflow `.github/workflows/deploy-pages.yml` builds and deploys `dist/`.

Default Vite base path is relative (`./`) so it works for GitHub project pages without extra config.

Override base path if you want:

```bash
VITE_BASE=/your-repo-name/ npm run build
```
