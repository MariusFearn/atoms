# MatterLab

Interactive 3D scientific physics and chemistry laboratory focused on scientific honesty, explicit models and units, and responsive real-time visualization.

See [MatterLab_Project_Specification.md](./MatterLab_Project_Specification.md) for the full project specification, scientific rules, and release milestones.

## Current Milestone Status

This workspace implements the **Milestone 0–2 Prototype Foundation** (plus the `uv`-managed `services/science-api` scaffold ahead of Milestone 3 RDKit integration):

- **Web Application (`apps/web`)**: React 19 + TypeScript + Vite + Three.js (WebGL2 instanced rendering) + Zustand.
  - Interactive 3D viewport with camera orbit, pan, zoom, reset, and fit-to-scene.
  - Explicit visual disclosures: `"Static Structure Mode · No Active Simulation"` and `"Visual representation — not to scale"`.
  - Ball-and-stick and Space-filling (Bondi/Mantina van der Waals) representations, CPK and Colorblind-safe palettes.
  - Element palette for the approved MVP chemistry baseline (`H, C, N, O, F, P, S, Cl, Br, I`).
  - Atom placement, 3D drag or keyboard coordinate editing (Å), explicit single/double/triple/aromatic bond creation, undo/redo, and local `.matterlab.json` project save/open.
  - Curated reference examples: Water (`H₂O`), Carbon Dioxide (`CO₂`), Methane (`CH₄`), and Benzene (`C₆H₆`).
  - Provisional client-side structure validation (explicitly labeled as prototype-only until Milestone 3 RDKit integration).
- **Domain Package (`packages/domain`)**: Typed `Quantity` units and conversions, IUPAC/NIST/Cordero/Bondi reference element data, explicit-atom formula calculation, structural integrity checks, provisional valence validation, and versioned JSON project persistence (`matterlab.project.v1`).
- **Science API Scaffold (`services/science-api`)**: Python FastAPI service managed with `uv` (`pyproject.toml` + `uv.lock`), providing `/api/v1/health`, `/api/v1/capabilities`, and `/api/v1/elements` with honest reporting of deferred RDKit/OpenMM adapters.

## Prerequisites

- **Node.js** >= 22 (with `npm`)
- **uv** (Astral Python package manager) + **Python** >= 3.11 (for `services/science-api`)

## Setup & Run Instructions

### 1. Web Application & Domain Package

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a WebGL2-capable browser.

### 2. Optional Science API Service (`uv`)

```bash
cd services/science-api
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

The Vite dev server proxies `/api/*` requests to `http://127.0.0.1:8000`. If `science-api` is not running, the web editor remains fully usable in local editing mode and disables service-dependent RDKit buttons with an explanation.

## Testing, Typechecking, Linting & Building

```bash
# Run TypeScript typechecks, ESLint, unit/component tests, and production build
npm run typecheck
npm run lint
npm test
npm run build

# Run science-api Python tests with uv
cd services/science-api && uv run pytest -v
```
