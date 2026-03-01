# WRO Ruler Web MVP

Static browser version of the WRO map ruler tool, designed for GitHub Pages.

## Features

- Loads map list from `public/maps/config.txt`
- Segment and polyline measurement modes
- Distance labels in millimeters
- Vertex snapping
- Wheel zoom (around cursor) and middle-mouse pan
- Clear drawings for current map
- Export current viewport as PNG
- Save/Load drawing session as JSON

## Project layout

```text
public/maps/         # map PNGs + config.txt
src/                 # app code
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

By default, Vite base path is:

```text
/WRO_Ruller/
```

Override base path if needed:

```bash
VITE_BASE=/your-repo-name/ npm run build
```
