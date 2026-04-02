# POLY FORGE V5 · Low-Poly Asset Designer

> A unified React component for designing low-poly spaceships and mecha in the style of Star Fox 64 / Lylat Wars — with an integrated socket editor, animation state system, and multi-format export.

![Version](https://img.shields.io/badge/version-5.0.0-cyan?style=flat-square)
![React](https://img.shields.io/badge/React-18%2B-blue?style=flat-square)
![Three.js](https://img.shields.io/badge/Three.js-r128%2B-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## Overview

**LowPolyShipDesignerV5** is a self-contained React component that lets you build, paint, socket, and animate low-poly 3D assets entirely in the browser — no server, no build pipeline, no external dependencies beyond Three.js.

It combines three tools that previously lived as separate editors into a single unified interface:

- **Mesh Editor** — assemble and paint low-poly ships and mecha from a library of parametric parts
- **Socket Editor** — place named attachment points for particle emitters, weapons, engine exhaust, and other in-game effects
- **Animation State System** — define named keyframe poses and export interpolation targets for runtime animation

The companion `demoV5.html` is a fully standalone implementation requiring only a CDN link to Three.js — no React, no build step, ready to open in any browser.

---

## Features

### 🚀 Mesh Editor

- **Ship parts**: Fuselage, Wing, Engine, Cockpit, Fin, Weapon
- **Mecha parts**: Head, Torso, Arm, Leg, Booster, Shoulder
- Up to **32 parts** per asset with X-axis mirroring
- Per-face **vertex colour painting** with a 16-colour palette
- Full **transform controls**: position, rotation, uniform scale, per-axis stretch (XYZ)
- Part visibility toggle and inline rename
- **Undo** history and **Clear All**

### 🔌 Socket Editor

Sockets define attachment points for particle systems, weapons, exhaust trails, and any runtime effect emitter. Each socket carries:

| Property | Description |
|---|---|
| `name` | Human-readable identifier |
| `type` | `weapon` · `engine` · `thruster` · `shield` · `fx` · `custom` |
| `position` | XYZ world-space coordinates |
| `mirror` | Auto-generates a mirrored counterpart on the X axis |

Sockets are visualised as colour-coded spheres with axis crosshairs directly in the 3D viewport. The exported `socket-config.json` is compatible with existing socket-config consumers:

```json
{
  "version": "1.0",
  "mesh": "my-ship",
  "sockets": [
    {
      "id": "dbg1faa",
      "name": "weapon",
      "type": "weapon",
      "position": { "x": 0, "y": -0.31, "z": 1.76 },
      "mirror": false,
      "mirroredPosition": null
    }
  ]
}
```

### 🎬 Animation State System

The animation system works on a **DEFAULT → STATE** interpolation model designed for low-poly assets that need simple transformations — wing folds, leg extensions, landing gear deployment, booster articulation.

**Workflow:**

1. Pose your parts in the mesh editor
2. Switch to the **ANIMATE** tab and create a named state — e.g. `wings-folded`
3. The state captures the current transforms of all parts as a keyframe snapshot
4. Use the **scrubber** to preview the interpolation live in the viewport
5. Click **▷** to watch a 1.2-second animated playback
6. Export individual state JSONs, or bake everything together

Each animation state exports as:

```json
{
  "version": "1.0",
  "mesh": "my-ship",
  "stateName": "wings-folded",
  "transforms": {
    "partId_abc": {
      "position": [0, -0.5, 0],
      "rotation": [0, 0, 45],
      "scale": 1,
      "scaleXYZ": [1, 1, 1]
    }
  }
}
```

In your game or application, interpolate between the default pose and any named state using these transform targets.

Up to **8 animation states** per asset. States can be recaptured at any time from the current editor pose.

### 📦 Export Formats

| Format | Description |
|---|---|
| **Blueprint JSON** | Full V5 format — parts, sockets, and animation states in one file. Re-importable. |
| **Socket Config JSON** | Standalone `socket-config.json` compatible with the original GLB Socket Editor format |
| **OBJ** | Wavefront `.obj` with embedded vertex colours |
| **GLTF** | Web-ready `.gltf` with embedded binary buffer (base64) |
| **BAKE** | Single text bundle containing all of the above, ready for splitting into a game import pipeline |

### 📥 Import

The importer accepts three JSON formats automatically:

- `lowpoly-v5-blueprint` — full V5 blueprint
- `lowpoly-ship` — V1/V2 ship JSON (legacy forward-compat)
- `socket-config.json` — socket-only import (merges sockets, leaves parts untouched)

---

## The Demo: `demoV5.html`

`demoV5.html` is a **fully standalone implementation** of the V5 component — no React, no npm, no build step.

Open it in any modern browser. It loads Three.js from cdnjs and runs entirely client-side.

**What the demo includes:**

- Animated boot splash with loading sequence
- Full mesh editor with ship and mecha palettes
- Integrated socket editor with live 3D viewport markers
- Animation state panel with scrubber and playback
- All export formats (Blueprint, Socket Config, OBJ, GLTF, BAKE bundle)
- Drag-and-drop import
- Asset naming, palette painting, transform controls

The demo is the fastest way to evaluate the component before integrating the JSX version into a project.

---

## Installation & Usage

### As a React Component

```bash
npm install three
```

Copy `LowPolyShipDesignerV5.jsx` into your project. It has no peer dependencies beyond React 18+ and Three.js r128+.

```jsx
import LowPolyShipDesignerV5 from './LowPolyShipDesignerV5';

// Standalone designer
<LowPolyShipDesignerV5 />

// With callbacks
<LowPolyShipDesignerV5
  initialDesign={savedParts}
  onSave={({ parts, sockets, animStates }) => handleSave({ parts, sockets, animStates })}
  onCancel={() => setEditorOpen(false)}
  onChange={(parts) => setLivePreview(parts)}
  title="SHIP DESIGNER"
/>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `initialDesign` | `Part[]` | `[]` | Pre-loaded parts array |
| `onSave` | `function` | `null` | Called with `{ parts, sockets, animStates }` |
| `onCancel` | `function` | `null` | Called when cancel is clicked |
| `onChange` | `function` | `null` | Called on every parts change |
| `title` | `string` | `'POLY FORGE V5'` | Header title text |
| `showHeader` | `boolean` | `true` | Show/hide the top header bar |
| `showFooter` | `boolean` | `true` | Show/hide the save/cancel footer |

### Standalone HTML Demo

```bash
# No installation required — just open in a browser
open demoV5.html
```

---

## Architecture

```
LowPolyShipDesignerV5.jsx
├── useDesignerState()        — Unified state hook (parts, sockets, animStates, preview)
├── Scene                     — Three.js renderer (meshes + socket markers + orbit camera)
├── SocketPanel               — Socket CRUD, inspector, position sliders
├── AnimPanel                 — Animation state list, scrubber, playback, capture
├── FileModal                 — Export/import modal with all format options
└── LowPolyShipDesignerV5     — Root component, tab routing, transform bar
```

**Export utilities** (also exported individually for advanced use):

```js
import {
  exportBlueprintJSON,
  exportSocketConfig,
  exportToGLTF,
  importFromBlueprint,
  createGeometry,
  useDesignerState,
} from './LowPolyShipDesignerV5';
```

---

## Geometry Reference

All geometry is built from non-indexed `BufferGeometry` with per-vertex colour attributes, enabling flat-shaded face painting.

| Part | Base Polygons | Notes |
|---|---|---|
| Fuselage | 12 | ConeGeometry, 6-sided |
| Wing | 12 | BoxGeometry, wide flat |
| Engine | 24 | CylinderGeometry, 6-sided |
| Cockpit | 16 | Hemisphere |
| Fin | 12 | Thin BoxGeometry |
| Weapon | 16 | Thin cylinder, 4-sided |
| Head | 20 | BoxGeometry |
| Torso | 18 | BoxGeometry, wider |
| Arm | 16 | CylinderGeometry, 6-sided |
| Leg | 16 | CylinderGeometry, 6-sided |
| Booster | 20 | CylinderGeometry, 8-sided |
| Shoulder | 14 | SphereGeometry |

Mirrored parts double the polygon count. Maximum theoretical polygon count: 32 parts × 24 polys × 2 (mirror) = **1,536 polygons** — well within N64-era aesthetics.

---

## Integration Notes

**Baked bundles** contain all data needed to import an asset into a game engine:

1. Load the `.gltf` mesh into your renderer
2. Parse `socket-config.json` to attach effect emitters at named positions
3. Store the default part transforms as your `pose_default`
4. Load each `anim-state-*.json` as interpolation targets
5. At runtime, lerp `pose_default → pose_target` using `t ∈ [0, 1]`

The interpolation model is intentionally simple — linear lerp on position, rotation (Euler), and scale — matching the aesthetic of low-poly retro games where snappy, readable motion matters more than physical accuracy.

---

## Browser Compatibility

Requires a browser with WebGL support. Tested on Chrome 120+, Firefox 121+, Safari 17+.

The standalone `demoV5.html` uses `String.fromCharCode.apply` for base64 encoding — for assets with very large meshes (10,000+ vertices), consider chunking or replacing with a `TextDecoder`-based approach.

---

## 📚 Citation

### Academic Citation

If you use this codebase in your research or project, please cite:

```bibtex
@software{lowpoly_ship_designer_v5,
  title  = {POLY FORGE V5: Unified Low-Poly Asset Designer with Socket Editor and Animation State System},
  author = {Drift Johnson},
  year   = {2025},
  url    = {https://github.com/MushroomFleet/LowPolyShipDesignerV5-JSX},
  version = {5.0.0}
}
```

### Donate

[![Ko-Fi](https://cdn.ko-fi.com/cdn/kofi3.png?v=3)](https://ko-fi.com/driftjohnson)
