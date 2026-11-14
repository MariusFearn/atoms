# MatterLab

Interactive 3D scientific physics and chemistry laboratory focused on scientific honesty, explicit models and units, and responsive real-time visualization.

See [MatterLab_Project_Specification.md](./MatterLab_Project_Specification.md) for the full project specification, scientific rules, and release milestones.

## Current Milestone Status

This workspace implements **Milestones 0–4** (3D molecule editor, typed domain/client contracts, RDKit cheminformatics, and OpenMM classical molecular dynamics via the root `uv`-managed Python service):

- **Web Application (`apps/web`)**: React 19 + TypeScript + Vite + Three.js (WebGL2 instanced rendering) + Zustand.
  - Interactive 3D viewport with camera orbit, pan, zoom, reset, and fit-to-scene.
  - Explicit visual disclosures: `"Static Structure Mode · No Active Simulation"`, `"Trajectory Playback · Frame ..."`, and `"Visual representation — not to scale"`.
  - Ball-and-stick and Space-filling (Bondi/Mantina van der Waals) representations, CPK and Colorblind-safe palettes.
  - Element palette for the approved MVP chemistry baseline (`H, C, N, O, F, P, S, Cl, Br, I`).
  - Atom placement, 3D drag or keyboard coordinate editing (Å), explicit single/double/triple/aromatic bond creation, undo/redo, and local `.matterlab.json` project save/open.
  - Curated reference examples: Water (`H₂O`), Carbon Dioxide (`CO₂`), Methane (`CH₄`), Benzene (`C₆H₆`), and Water Cluster (`8 H₂O`) for OpenMM dynamics.
  - RDKit validation & molecular descriptors, ETKDGv3 conformer generation (explicitly labeled as generated and not energy-minimized), and single-structure MOL/SDF import/export when `science-api` is running.
  - **Experiment Workspace (OpenMM)**: Versioned `tip3p-water-nvt` (Langevin NVT) and `tip3p-water-nve` (Verlet NVE) presets, background job execution with cancellation & reconnect, trajectory playback controls separated from engine computation, live SVG energy/temperature chart + accessible data table, and JSON/CSV reproducibility export.
- **Domain & Client Packages (`packages/domain`, `packages/simulation-client`)**: Typed `Quantity` units and conversions, IUPAC/NIST/Cordero/Bondi reference element data, explicit-atom formula calculation, structural integrity checks, provisional valence validation, MD preset/job/trajectory models, versioned JSON project persistence (`matterlab.project.v1`), and typed `snake_case` <-> `camelCase` API boundary mapping.
- **Science API Service (`services/science-api`)**: Python FastAPI service managed via the root `uv` workspace ([pyproject.toml](./pyproject.toml) + [uv.lock](./uv.lock) + root `.venv`) with **RDKit** (`rdkit`) and **OpenMM** (`openmm`), exposing validation/conformer/MOL routes plus persistent SQLite-backed OpenMM experiment endpoints (`/api/v1/experiments/*`).

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
# Creates and syncs the root .venv from pyproject.toml + uv.lock
uv sync
cd services/science-api && uv run uvicorn app.main:app --reload --port 8000
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
