# MatterLab

Interactive 3D scientific physics and chemistry laboratory focused on scientific honesty, explicit models and units, and responsive real-time visualization.

See [MatterLab_Project_Specification.md](./MatterLab_Project_Specification.md) for the full project specification, scientific rules, and release milestones.

## Current Milestone Status

This workspace implements **Milestones 0–5** (3D molecule editor, typed domain/client contracts, RDKit cheminformatics, OpenMM CUDA/CPU classical molecular dynamics, and PySCF quantum chemistry via the root `uv`-managed Python service):

- **Web Application (`apps/web`)**: React 19 + TypeScript + Vite + Three.js (WebGL2 instanced rendering) + Zustand.
  - Interactive 3D viewport with camera orbit, pan, zoom, reset, and fit-to-scene.
  - Explicit visual disclosures: `"Static Structure Mode · No Active Simulation"`, `"Trajectory Playback · Frame ..."`, `"HOMO Wavefunction Amplitude & Phase"`, `"Total Electron Density"`, and `"Visual representation — not to scale"`.
  - Ball-and-stick and Space-filling (Bondi/Mantina van der Waals) representations, CPK and Colorblind-safe palettes.
  - Element palette for the approved MVP chemistry baseline (`H, C, N, O, F, P, S, Cl, Br, I`).
  - Atom placement, 3D drag or keyboard coordinate editing (Å), explicit single/double/triple/aromatic bond creation, undo/redo, and local `.matterlab.json` project save/open.
  - Curated reference examples: Water (`H₂O`), Carbon Dioxide (`CO₂`), Methane (`CH₄`), Benzene (`C₆H₆`), and Water Cluster (`8 H₂O`) for OpenMM dynamics.
  - RDKit validation & molecular descriptors, ETKDGv3 conformer generation (explicitly labeled as generated and not energy-minimized), and single-structure MOL/SDF import/export when `science-api` is running.
  - **Experiment Workspace (OpenMM)**: Versioned `tip3p-water-nvt` (Langevin NVT) and `tip3p-water-nve` (Verlet NVE) presets preferring CUDA GPU acceleration when available, background job execution with cancellation & reconnect, 10/30/60 FPS trajectory playback controls separated from engine computation, live SVG energy/temperature chart + accessible data table, and JSON/CSV reproducibility export.
  - **Quantum Workspace (PySCF)**: Closed-shell `RHF` (`sto-3g`, `6-31g`) and `RKS-B3LYP` (`6-31g`, `def2-svp`) single-point calculations, SCF convergence & iteration reporting, orbital energies, dipole moment, and distinct 3D HOMO orbital amplitude/phase vs total electron density visualizations.
  - **Atom (`Wave Lab`)**: Analytical 3D hydrogenic standing-wave visualizer (`1s`, `2s`, `2p_z`, `2p_x`, `3d_z²`, `3d_x²−y²`) with separate **Amplitude & Phase ($\psi$)** vs **Probability Density ($|\psi|^2$)** views, `z ≤ 0` cross-section slicing, magnetic dipole field loops, and hydrogen spectral line calculator.
  - **Nuclear Sandbox (`Toy`)**: Exploratory classical N-body playground at femtometer (`fm`) / `MeV` scale with a `numpy` Velocity-Verlet solver, interactive **Custom Builder** (protons, neutrons, α-clusters), live force-vector arrows, energy breakdown chart, and curated AME2020/NNDC nuclear benchmarks (see [Nuclear_Cluster_Sandbox_Plan.md](./Nuclear_Cluster_Sandbox_Plan.md)).
- **Domain & Client Packages (`packages/domain`, `packages/simulation-client`)**: Typed `Quantity` units and conversions, IUPAC/NIST/Cordero/Bondi/AME2020/CODATA reference data, explicit-atom formula calculation, structural integrity checks, provisional valence validation, MD/QC/Nuclear preset/job/result models, versioned JSON project persistence (`matterlab.project.v1`), and typed `snake_case` <-> `camelCase` API boundary mapping.
- **Science API Service (`services/science-api`)**: Python FastAPI service managed via the root `uv` workspace ([pyproject.toml](./pyproject.toml) + [uv.lock](./uv.lock) + root `.venv`) with **RDKit**, **OpenMM** (`openmm[cuda12]`), **PySCF** (`pyscf`), and the exploratory **Nuclear Toy** adapter, exposing `/api/v1/molecules/*`, `/api/v1/experiments/*`, `/api/v1/quantum/*`, and `/api/v1/sandbox/nuclear/*`.

## Quick Guide: How to Use MatterLab

1. **Start both servers** (after `npm install` and `uv sync`):
   ```bash
   npm run dev:all
   ```
   Then open `http://localhost:5173` in a WebGL2-capable browser.
2. **Switch workspaces from the top bar:**
   - **Molecule Editor:** Build molecules by hand or load curated examples (`Water`, `Benzene`, `Water Cluster (8 H₂O)`), run **RDKit Validate** / **Generate Conformer**, and save/open `.matterlab.json` or `.mol` files.
   - **Atom (`Wave Lab`):** Inspect 3D hydrogenic standing waves (`1s` through `3d`), toggle **Amplitude & Phase ($\psi$)** vs **Probability ($|\psi|^2$)**, slice open nested shells (`Cross-Section Slice`), overlay **Magnetic Dipole Field Loops**, and compute hydrogen spectral wavelengths (`656.3 nm` H-α, etc.).
   - **Experiment (`OpenMM`):** Load `Water Cluster (8 H₂O)` and run real classical NVT/NVE molecular dynamics trajectories with live energy & temperature plots.
   - **Quantum (`PySCF`):** Run single-point Hartree-Fock / DFT quantum chemistry on small molecules and inspect HOMO/LUMO orbitals and 3D electron density.
   - **Nuclear Sandbox (`Toy`):** Explore alpha-cluster nuclear geometry and test competing force laws (Electric Push, Short-Range Nuclear Velcro + Core, and Real/Amplified $1/r^2$ Gravity) at femtometer scale.

## Testing the YouTube Video's Atomic & Gravity Theory

Part of the motivation for adding the **Nuclear Sandbox (`Toy`)** and **Atom (`Wave Lab`)** workspaces was to concretely test claims made in the video:
> [50 Crop Circles Decoded: Aliens Showed Us What Gravity Really Is](https://www.youtube.com/watch?v=6IsN-BO5ajc&t=579s)

The video proposes reinterpreting **$\text{Be-8}$ breakup**, the **$\text{C-12}$ "three-alpha lock"** and **Hoyle state**, **$\text{O-16}$**, **$p + {}^{11}\text{B}$ boron fusion**, and **nuclear mass defect** as geometric/electromagnetic **gravity** effects rather than standard nuclear physics and quantum mechanics.

> **Scientific Honesty Note:** The **Nuclear Sandbox (`Toy`)** is explicitly labeled as an **exploratory classical N-body toy model**—not a replacement for ab-initio quantum nuclear physics. It lets you turn force hypotheses into numbers and compare them directly against measured **AME2020 / NNDC** nuclear benchmarks.

### How to Run and Test Those Claims Yourself

1. Start the app with `npm run dev:all` and open `http://localhost:5173`.
2. Click **Nuclear Sandbox (`Toy`)** in the top navigation bar.
3. Run the 4 built-in **Guided Tests** on the left sidebar (click a test, then click **Run Toy Simulation**):
   - **`1. Can Real Gravity Hold Be-8 Together?`** — Disables short-range nuclear attraction on **Beryllium-8 (2α)** and leaves only Electric Repulsion + real Newtonian gravity (`1×`). Observe the **Gravity Term** (`~10⁻³⁶ MeV`) vs. **Electric Push** (`~1.69 MeV`): the two alphas blast apart immediately (`unbound-dissociated`).
   - **`2. Test the Video Idea: Boost Gravity 10³⁶×`** — Removes the short-range core bumper and amplifies $1/r^2$ gravity by **$10^{36}\times$** on **Carbon-12 (3α)**. Because both electric repulsion ($1/r^2$) and $1/r^2$ gravity scale identically with distance, there is no stable lock radius—the triangle collapses inward to the origin (`collapsed-core`).
   - **`3. Why Be-8 Splits While C-12 Locks`** — Turns standard short-range nuclear attraction + repulsive core back on. Compare **Be-8 (2α)** (`unbound-dissociated`) against **C-12 (3α Lock)** (`bound-oscillating`, equilateral triangle) and toggle **Force Arrows** and **Cluster Edges**.
   - **`4. Stretch the Triangle: Hoyle State`** — Runs the stretched **C-12 Hoyle State** chain with light **Energy Damping** to watch it fold into the compact ground-state triangle.
   - **`5. Test Magnetic Dipole Balance (C-12)`** — Tests Chapter 14's magnetic-balance idea by enabling **Magnetic Dipole Force (`1/r⁴`)** without short-range nuclear Velcro or a core bumper.
4. **Test Mass-Defect Gravity vs. Drop Experiments (`Equivalence Principle Check`):**
   - Compare **¹H** (`0.00%` mass defect) vs. **⁵⁶Fe** (`0.94%` mass defect) or **⁴He** vs. **¹²C** in the sidebar to see how a mass-defect gravity model violates MICROSCOPE / Eöt-Wash free-fall measurements (`< 1.5 × 10⁻¹⁵`).
5. **Test Additional Clusters & Custom Geometry:**
   - Switch **Cluster Preset** to **Oxygen-16 (4α Tetrahedron)**, **Helium-4 (2p + 2n)**, or **Boron-11 + Proton (`p + ¹¹B`)**, or use **Custom Builder** to add/move protons, neutrons, and alphas and give them custom velocities.
6. **Check Standing Waves & Isotope Spectral Shifts in `Atom (Wave Lab)`:**
   - Switch to the **Atom (`Wave Lab`)** tab in the top bar to see why electrons are *already* modeled as **3D standing waves** in Schrödinger's equation (not classical planet orbits), slice open the `2s` nodal shell, toggle **Magnetic Dipole Field Loops**, and switch isotopes (**¹H** vs **²H** vs **³H**) to see how neutron mass shifts hydrogen spectral lines (`−0.1786 nm` on H-α).

## Prerequisites & Hardware (No GPU Required)

- **GPU is NOT required:**
  - **3D Graphics:** Runs in any modern desktop browser with **WebGL2** (works on integrated graphics; use the **Low-FX** toggle in the top bar for lighter rendering).
  - **Scientific Compute:** **RDKit**, **PySCF**, **Atom (`Wave Lab`)**, and **Nuclear Sandbox (`Toy`)** all run on CPU.
  - **Optional NVIDIA CUDA Acceleration (OpenMM):** `Experiment (OpenMM)` declares `openmm[cuda12]` and automatically selects `CUDA` if a compatible NVIDIA GPU + driver is present, otherwise falling back transparently to `CPU` / `Reference`.
- **Software:**
  - **Node.js** >= 22 (with `npm`)
  - **uv** (Astral Python package manager) + **Python** >= 3.11 (for `services/science-api`)
  - Linux / macOS / WSL2 bash shell for `./scripts/start-dev.sh` (`lsof` or `ss` + `curl`)

## Setup & Run Instructions

### Quick Start (Recommended — Starts Web App + Science API Together)

```bash
git clone https://github.com/MariusFearn/atoms.git
cd atoms
npm install
uv sync
npm run dev:all
```

Then open **`http://localhost:5173`** in your browser. (`npm run dev:all` / `./scripts/start-dev.sh` automatically frees ports `8000` and `5173`, launches `science-api` with `uv`, and starts the Vite web app.)

### Running Services Separately

1. **Web Application only (offline molecule editor & Atom Wave Lab):**
   ```bash
   npm install
   npm run dev
   ```
   Open `http://localhost:5173`. If `science-api` is not running, local editing and `.matterlab.json` save/load stay active while RDKit, OpenMM, PySCF, and Nuclear Sandbox run buttons explain that the backend is offline.

2. **Science API Service only (`uv`):**
   ```bash
   uv sync
   cd services/science-api && uv run uvicorn app.main:app --reload --port 8000
   ```
   The Vite dev server proxies `/api/*` requests to `http://127.0.0.1:8000`.

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

## Project Status: What Is Done vs. What Is Left

### Done (Implemented & Verified)
- **Milestones 0–3:** 3D Molecule Editor (`H, C, N, O, F, P, S, Cl, Br, I`), keyboard/3D editing, undo/redo, `.matterlab.json` persistence, RDKit validation, ETKDGv3 conformer generation, and MOL V2000 import/export.
- **Milestone 4:** OpenMM `tip3p-water-nvt` & `tip3p-water-nve` molecular dynamics (CUDA GPU with automatic CPU fallback), SQLite-persisted job queue, cancellation/reconnect, trajectory playback (`10/30/60 FPS`), and energy/temperature charts.
- **Milestone 5:** PySCF single-point quantum chemistry (`RHF`, `RKS-B3LYP`), orbital energies, dipole moment, and 3D HOMO amplitude/phase vs. total electron density overlays.
- **Exploratory Additions (Beyond Initial MVP):**
  - **Atom (`Wave Lab`):** Analytical 3D hydrogenic standing-wave visualizer (`1s`–`3d`), `z ≤ 0` cross-section slice, magnetic dipole field loops, and hydrogen spectral line calculator.
  - **Nuclear Sandbox (`Toy`):** `numpy` Velocity-Verlet N-body playground (`He-4`, `Be-8`, `C-12`, `C-12 Hoyle`, `O-16`, `p + ¹¹B`), 4 guided experiments, Custom Particle Builder, 3D force arrows, energy breakdown chart, and AME2020/NNDC benchmarks.
  - **Combined Dev Launcher & Licensing:** `./scripts/start-dev.sh` (`npm run dev:all`), MIT `LICENSE`, and updated `THIRD_PARTY_NOTICES.md`.

### What Is Left (Future Roadmap — Milestone 6 & Beyond)
See [MatterLab_Project_Specification.md](./MatterLab_Project_Specification.md) for the full long-term roadmap:
- **OpenMM Force-Field Expansion:** Broader molecule support beyond pure TIP3P water clusters (e.g., solvated organic molecules, AMBER/GAFF/OpenFF parameterization, and trajectory streaming for larger systems).
- **Quantum Chemistry Extensions:** Geometry optimization, vibrational frequencies, and multi-electron orbital/ESP isosurfaces in PySCF (or Psi4).
- **Milestone 6 (Advanced Engines):** Evaluate **LAMMPS** for materials science and reactive MD (ReaxFF), and **Geant4** for particle-transport / radiation-physics workflows.
- **Broader Interchange & Tooling:** `PDB`, `mmCIF`, and `XYZ` import/export, Playwright end-to-end browser test suite + rendering benchmark harness, and optional 3D drag-to-reposition / angular-dipole force terms in the Nuclear Sandbox.

