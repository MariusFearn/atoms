# MatterLab — Option 1: Exploratory Nuclear Cluster & Force Sandbox Plan

**Document status:** Proposed design plan  
**Purpose:** Build an interactive, visually expressive 3D **"Nuclear Lego & Force Sandbox"** inside MatterLab so learners can concretely test geometric alpha-cluster ideas (e.g., $\text{Be-8}$ breakup, $\text{C-12}$ three-alpha lock, Hoyle state, $\text{O-16}$ tetrahedron) and compare custom/speculative force laws (including gravity vs. electromagnetism vs. short-range nuclear attraction) directly against real experimental nuclear data.

---

## 1. Scientific Honesty & Guardrails

Per `MatterLab_Project_Specification.md` (Section 12), this feature is **not** a validated ab-initio nuclear physics engine (like lattice EFT or Geant4) and **must never** be presented alongside RDKit or OpenMM as validated science.

Mandatory UI and data rules for every screen, export, and response in this mode:

1. **Persistent Disclosure Banner:**  
   `"Exploratory Toy Model · Femtometer (fm) Scale — Classical N-Body Illustration (Not Quantum Nuclear Physics)"`
2. **Scale Disclosure:**  
   `"Visual representation — nucleon/alpha spheres and force vectors are not drawn to physical quantum scale."`
3. **Explicit Provenance Split:**  
   - **Simulated values** (kinetic energy, Coulomb repulsion, toy nuclear/gravity potential, stability outcome) are tagged `sourceKind: "toy-simulation"`.
   - **Reference benchmarks** (real binding energies, mass defects, half-lives, excitation energies from AME2020 / NNDC) are tagged `sourceKind: "curated-experimental-reference"` with citations.
4. **Isolation from Chemistry & OpenMM:**  
   Molecular editing (`Molecule Editor`) and validated TIP3P water dynamics (`Experiment · OpenMM`) remain completely separate and unaffected.

---

## 2. What You Can Play With & Learn (Core Concepts)

This sandbox zooms into the **nucleus** at **femtometer ($1\text{ fm} = 10^{-15}\text{ m}$) scale**, five orders of magnitude smaller than the Ångström ($10^{-10}\text{ m}$) molecules in the main editor.

### 2.1 Building Blocks (Particle Types)
Users can simulate at two levels of detail:
- **Alpha-Cluster Level (fastest & matches the video's main claims):**
  - `alpha` ($^4\text{He}$ core: $2p + 2n$, charge $+2e$, mass $3727.379\text{ MeV}/c^2$)
- **Nucleon Level (optional detail / smaller systems):**
  - `proton` (charge $+1e$, mass $938.272\text{ MeV}/c^2$)
  - `neutron` (charge $0e$, mass $939.565\text{ MeV}/c^2$)

### 2.2 Curated Starting Presets & Real-World Benchmarks

| Preset | Composition | Starting 3D Geometry | Real Experimental Benchmark (AME2020 / NNDC) | What It Tests |
| :--- | :--- | :--- | :--- | :--- |
| **He-4 (Alpha)** | $2p + 2n$ | Tight tetrahedron ($\sim 1.7\text{ fm}$) | Binding energy: **$28.296\text{ MeV}$** (stable) | Baseline nucleon binding & mass defect ($\Delta m c^2$) |
| **Be-8** | $2\alpha$ | 2 alpha spheres ($\sim 3.5\text{ fm}$ apart) | Unbound by **$+0.0918\text{ MeV}$** above $2\alpha$; decays in $\sim 8.19 \times 10^{-17}\text{ s}$ | Video claim: why 2 alphas split apart instead of locking |
| **C-12 (Ground)** | $3\alpha$ | Equilateral triangle ($\sim 3.0\text{ fm}$ side) | Binding energy: **$92.162\text{ MeV}$** (**$-7.275\text{ MeV}$** below $3\alpha$) | Video claim: "three-alpha lock" stability |
| **C-12 (Hoyle State)** | $3\alpha$ | Extended obtuse triangle / bent chain | **$+7.654\text{ MeV}$** above ground (**$+0.379\text{ MeV}$** above $3\alpha$) | Triple-alpha resonance in stars |
| **O-16** | $4\alpha$ | Regular tetrahedron (3D pyramid) | Binding energy: **$127.619\text{ MeV}$** (**$-14.437\text{ MeV}$** below $4\alpha$) | 3D tetrahedral alpha clustering |
| **p + B-11 (Optional)** | $p + {}^{11}\text{B}$ (or cluster proxy) | Approach trajectory | $Q$-value: **$+8.590\text{ MeV}$** (3$\alpha$ exit channel) | Aneutronic boron fusion reference |

---

## 3. Physics Toy Engine Design (Python `numpy`)

Instead of OpenMM (which is built for Ångström molecules), the Python backend runs a lightweight, deterministic **Velocity-Verlet $N$-body integrator** in natural nuclear units:

- **Distance:** femtometer ($\text{fm}$)
- **Energy:** mega-electronvolt ($\text{MeV}$)
- **Time:** $\text{fm}/c$ ($1\text{ fm}/c \approx 3.336 \times 10^{-24}\text{ s}$)
- **Exact Coulomb constant:** $k_e e^2 = \alpha \hbar c \approx 1.4399645\text{ MeV}\cdot\text{fm}$

### 3.1 Controllable Force Terms (User Sliders)

The total pairwise potential $V(r)$ is decomposed into clear, toggleable terms so the user can turn each piece on/off and watch its exact effect:

1. **Electrostatic Repulsion (Coulomb):**
   $$V_C(r) = \text{scale}_C \cdot \frac{1.440 \cdot q_1 q_2}{r}$$
   - Standard physics: $\text{scale}_C = 1.0$.

2. **Short-Range Nuclear Attraction + Core Repulsion (Phenomenological Ali–Bodmer / Double-Gaussian / Yukawa):**
   $$V_N(r) = V_{\text{core}} \, e^{-(r / r_{\text{core}})^2} - V_{\text{attr}} \, e^{-(r / r_{\text{attr}})^2}$$
   - Gives an intuitive "repulsive bumper + short-range Velcro" curve: particles cannot collapse to $r = 0$, and only attract strongly within $\sim 2\text{–}4\text{ fm}$.
   - Can be calibrated as a toy preset where $2\alpha$ ($\text{Be-8}$) sits right at the unbound edge while $3\alpha$ ($\text{C-12}$) and $4\alpha$ ($\text{O-16}$) stay bound.

3. **Newtonian / Amplified Gravity-Like $1/r^2$ Term (To Test the Video's Hypothesis):**
   $$V_G(r) = -\text{gravityMultiplier} \cdot \frac{G m_1 m_2}{r}$$
   - At `gravityMultiplier = 1`: real gravity ($G m_\alpha^2 \approx 7.6 \times 10^{-37}\text{ MeV}\cdot\text{fm}$), proving visually why ordinary gravity does essentially zero at nuclear scale.
   - At `gravityMultiplier` up to $\sim 10^{38}$: lets the user directly test *"What happens if gravity really IS strong enough to compete with electric charge?"*
   - **Key learning moment:** Because both $1/r$ Coulomb repulsion and $1/r$ amplified gravity scale identically with distance, their sum is purely attractive or purely repulsive at *all* distances—showing immediately why a pure $1/r^2$ force cannot create a stable equilibrium radius or explain why $2\alpha$ unbinds while $3\alpha$ binds without adding a short-range core!

4. **Optional Angular / Dipole Lock Term (Exploratory):**
   - A toggleable orientation/three-body spring or dipole term to play with geometric "lock" ideas.

5. **Optional Damping (Energy Relaxation Mode):**
   - Toggle between **NVE (Energy-Conserving)** to watch real oscillations/breakup, and **Damped Relaxation** to let a cluster settle into its minimum-energy shape (triangle, tetrahedron, or chain).

---

## 4. Architecture & Integration into Existing Repo

The implementation follows the existing 5-layer MatterLab structure without modifying RDKit or OpenMM contracts.

### 4.1 Domain Package (`packages/domain`)
- **New file:** `packages/domain/src/nuclear.ts` (exported via `packages/domain/src/index.ts`)
  - Typed units (`fm`, `MeV`, `fm/c`, `MeV/c^2`, `e`)—never reusing `angstrom` or `kJ/mol` types.
  - `NuclearParticleKind = 'proton' | 'neutron' | 'alpha'`
  - `NuclearParticle`, `NuclearClusterPreset`, `NuclearForceConfig`, `NuclearTrajectoryFrame` (including per-frame force-term energy breakdown and net pairwise force vectors), `NuclearReferenceBenchmark`, `NuclearSimulationResult`.
  - Curated `NUCLEAR_PRESETS` and `NUCLEAR_BENCHMARKS` (`He-4`, `Be-8`, `C-12`, `C-12 Hoyle`, `O-16`).

### 4.2 Python Science Service (`services/science-api`)
- **New adapter:** `services/science-api/app/adapters/nuclear_toy/adapter.py`
  - Pure `numpy` Velocity-Verlet solver (typical run: $3\text{–}4$ particles for $500\text{–}2{,}000$ steps executes in $< 20\text{ ms}$).
  - Returns full trajectory frames (`positions_fm`, `velocities_c`, `force_vectors_mev_fm`), energy decomposition (`kinetic_mev`, `coulomb_mev`, `nuclear_mev`, `gravity_mev`, `total_mev`), and **Stability Verdict** (`bound-oscillating`, `unbound-dissociated`, `collapsed-core`).
  - Computes **Effective Mass Defect** $\Delta m c^2 = -E_{\text{potential+internal}}$ vs. the real AME2020 benchmark.
- **New Pydantic contracts:** Append to `services/science-api/app/models/contracts.py` (or `app/models/nuclear_contracts.py`).
- **New API routes:** In `services/science-api/app/main.py` (isolated under `/api/v1/sandbox/nuclear/...` so `/api/v1/experiments` stays strictly OpenMM):
  - `GET /api/v1/sandbox/nuclear/presets`
  - `POST /api/v1/sandbox/nuclear/simulate` (fast synchronous run with strict step/particle bounds, e.g., max 64 particles, max 5,000 steps; or optionally hooked into `JobManager` if longer sweeps are added later).

### 4.3 Client Package (`packages/simulation-client`)
- **New client functions & boundary mappers:** `packages/simulation-client/src/nuclearClient.ts` (or in `contracts.ts` / `client.ts`) mapping `snake_case` Python DTOs to `camelCase` domain types.

### 4.4 Web Application (`apps/web`)
- **Top Navigation (`apps/web/src/components/TopBar.tsx` & `useLabStore.ts`):**
  - Add a clearly tagged workspace tab: **`Nuclear Sandbox`** with a **`Toy Model`** badge (distinct from `Molecule Editor` and `Experiment · OpenMM`).
- **New Workspace (`apps/web/src/workspaces/nuclear/NuclearSandboxWorkspace.tsx`):**
  - **Left Panel:**
    - Preset selector (`Be-8`, `C-12 Ground`, `C-12 Hoyle`, `O-16`, `He-4`, Custom),
    - Quick scenario buttons (*"Standard Nuclear Physics"*, *"Real Gravity Only"*, *"Amplified 1/r² Gravity Test"*, *"Relax to Equilibrium"*),
    - Force sliders (Coulomb scale, Short-range Nuclear attraction & core bumper, Gravity multiplier exponent $10^x$, Damping).
  - **Center 3D Viewport (`apps/web/src/workspaces/nuclear/NuclearSceneViewport.tsx`):**
    - Three.js WebGL2 scene styled to match MatterLab (`#090d16` dark lab background, **1-fm grid** with explicit `fm` scale indicator).
    - Color-coded glowing spheres: **Alpha (`#f59e0b` gold)**, **Proton (`#ef4444` red)**, **Neutron (`#64748b` slate)**.
    - Optional **Geometry Overlay**: translucent triangle/tetrahedron edge lines connecting clusters so the 3-alpha triangle and 4-alpha tetrahedron are unmistakable.
    - Optional **Force Arrows** (`THREE.ArrowHelper` / instanced cones) showing **Electric Push** vs. **Attraction Pull** on each particle in real time!
  - **Right Panel & Bottom Playback:**
    - Play / Pause / Step / Scrub timeline slider.
    - **Energy Breakdown Chart (SVG):** Kinetic, Electric (Coulomb), Nuclear/Velcro, Gravity, and Total Energy over time ($\text{MeV}$).
    - **Reality Check Card:** Side-by-side comparison of *Toy Model Output* vs. *Real Experimental Value (AME2020)* + plain-English explanation of why the cluster stayed locked or flew apart.
    - **Guided Learning Cards:** 3–4 clickable "Experiments to Try" with plain-language explanations for learners.

---

## 5. Implementation Phases & Verification

### Phase 1 — Domain Contracts & Reference Benchmarks
- Create `packages/domain/src/nuclear.ts` with typed `fm`/`MeV` structures and verified AME2020/NNDC reference numbers for `He-4`, `Be-8`, `C-12`, `C-12 (Hoyle)`, and `O-16`.
- **Verify:** Unit tests in `packages/domain/tests/nuclear.test.ts` validating finite coordinates, unit conversions ($\text{MeV} \leftrightarrow u$), and benchmark data integrity.

### Phase 2 — Python Velocity-Verlet Solver & API Endpoints
- Implement `services/science-api/app/adapters/nuclear_toy/adapter.py` and `/api/v1/sandbox/nuclear/*` routes.
- **Verify (`pytest`):**
  - NVE energy conservation check ($\max |\Delta E| / |E_0| < 10^{-3}$ for bounded oscillations).
  - Sanity checks: `Real Gravity Only` on `Be-8` dissociates immediately (`coulomb_mev >> |gravity_mev|` by $\sim 10^{36}$); `Standard Nuclear Toy` keeps `C-12` triangle and `O-16` tetrahedron bound; `Amplified 1/r² Gravity (no core)` either dissociates or collapses to core limit.
  - Validation rejects non-finite numbers, invalid particle counts, or out-of-range parameters with typed `ApiErrorDetail`.

### Phase 3 — 3D Nuclear Viewport & Sandbox UI
- Build `NuclearSceneViewport.tsx`, `NuclearSandboxWorkspace.tsx`, Zustand slice/actions, and `TopBar.tsx` tab integration.
- **Verify (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build` + browser check):**
  - Persistent `"Exploratory Toy Model · Femtometer (fm) Scale"` disclosure banner is always visible.
  - Switching presets (`Be-8`, `C-12`, `O-16`), adjusting sliders, running a simulation, scrubbing frames, and toggling force arrows work smoothly at interactive FPS without console errors.
  - Existing `Molecule Editor` and `Experiment (OpenMM)` workflows remain completely intact.

### Phase 4 — Guided "Experiments to Try" & Educational Polish
- Add 4 beginner-friendly interactive experiments right inside the sidebar:
  1. *"Can real gravity hold two alphas ($\text{Be-8}$) together?"*
  2. *"What happens if you boost gravity $10^{36}\times$?"* (discovering why $1/r^2$ forces alone don't lock at a fixed radius)
  3. *"Why does $\text{Be-8}$ split while $\text{C-12}$ locks in a triangle?"*
  4. *"Stretch the triangle: the Hoyle state ($7.654\text{ MeV}$) that makes carbon in stars"*
- Add JSON/CSV export of sandbox runs with full parameter + disclosure metadata.

---

## 6. Out of Scope (Explicitly Deferred)
- Exact quantum many-body wavefunctions (ab-initio nuclear lattice EFT / Greens Function Monte Carlo).
- Relativistic QCD / quark-gluon dynamics inside individual protons/neutrons.
- Nuclear reaction cross-sections or radiation transport (reserved for future `Geant4` evaluation in Milestone 6).
