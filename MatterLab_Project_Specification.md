# MatterLab --- Project Specification

**Working title:** MatterLab\
**Project type:** Interactive scientific physics and chemistry sandbox\
**Document status:** Revised draft; proposed release boundaries and budgets
require approval\
**Target:** Web-first application, designed so a desktop build can be
added later\
**Primary goals:** Scientific honesty, excellent real-time 3D graphics,
and hands-on experimentation

------------------------------------------------------------------------

## 1. Product vision

MatterLab is an interactive 3D laboratory for exploring how matter
behaves at different scales. Users should be able to inspect atoms,
assemble molecules, change environmental conditions, run simulations,
and understand the physical quantities behind what they see.

The experience should feel like a high-quality scientific instrument
rather than an arcade game. Visuals should be polished and expressive,
but never imply that a simplified model is exact physics.

The central product principle is:

> Every displayed result must be associated with a clearly identified
> physical model, its assumptions, and its limitations.

MatterLab will not attempt to use one universal simulation algorithm for
everything from quarks to chemical reactions. Different physical scales
require different theories and numerical methods.

## 2. Product goals

1.  Provide an excellent interactive 3D environment for inspecting and
    manipulating scientific objects.
2.  Let users build and inspect atoms and molecules.
3.  Run scientifically grounded simulations using established
    open-source engines where practical.
4.  Display measurable quantities such as energy, temperature, charge,
    forces, distances, and simulation time.
5.  Make the selected model and its limitations visible to the user.
6.  Keep rendering independent from scientific computation so either can
    evolve without rewriting the other.
7.  Make the first release achievable by an individual developer, with a
    clear path to more advanced physics.

### Non-goals for the first release

-   A universal, real-time first-principles simulation of all known
    matter.
-   Exact quantum simulation of arbitrary many-electron systems in real
    time.
-   A complete quantum chromodynamics or quark-gluon plasma simulator.
-   A replacement for professional computational chemistry packages.
-   Guaranteed chemically correct reactions from arbitrary user-created
    arrangements.
-   A large multiplayer or social platform.

## 3. Target users and primary workflows

### User types

-   Curious learners exploring atoms and molecules.
-   Students who want to connect visual intuition with measurable
    quantities.
-   Developers and technically minded users who want to experiment with
    simulation parameters.
-   Advanced users who understand that different models have different
    domains of validity.

### Core workflows

**Explore an atom** 1. Open the atom workspace. 2. Choose an element. 3.
Inspect its nucleus, electron configuration, and electron probability
visualization. 4. Toggle labels and scientific overlays. 5. Read the
model description and limitations.

**Build a molecule** 1. Open the molecule workspace. 2. Add atoms from
an element palette. 3. Connect atoms or load a known molecular
structure. 4. Inspect bond lengths, angles, formula, and molecular
geometry. 5. Run an appropriate geometry optimization or molecular
simulation. 6. Inspect calculated results and their method.

**Run an experiment** 1. Choose a supported simulation model. 2. Set
initial conditions and environment. 3. Run, pause, step, or reset. 4.
Observe the simulation and live measurements. 5. Compare runs or export
results.

## 4. Scientific scope and model boundaries

The application must use explicit simulation modes. A mode defines what
is simulated, which engine is used, what input is valid, and what
conclusions can safely be drawn.

### 4.1 Atomic structure mode

Purpose: teach and visualize atomic structure.

Initial capabilities: - Element selection and periodic-table data. -
Proton and neutron counts. - Electron count and electron
configuration. - Isotope selection. - Nuclear and electronic labels. -
Electron probability-density or orbital visualizations sourced from
calculated or curated data.

Important scientific rules: - Do not depict electrons as tiny planets on
fixed classical orbits. - If a Bohr-style diagram is offered for
teaching, label it as a simplified historical model. - Orbital surfaces
may encode wavefunction amplitude and phase; probability clouds encode
probability density. Label the represented quantity explicitly; neither
is a solid material shell. - A nucleus is not drawn to scale
relative to the electron cloud. State when dimensions are visually
exaggerated. - Atomic radii and orbital scales depend on definitions and
context; identify the data convention used.

For the first release, atomic structure can be an educational
visualization backed by validated element and orbital datasets. It does
not need to calculate full atomic wavefunctions interactively.

### 4.2 Molecular structure mode

Purpose: construct, inspect, and prepare molecules.

Recommended tools: - **RDKit** for molecular representations, chemical
parsing, descriptors, conformers, and cheminformatics workflows. -
**3Dmol.js** or **Mol\*** as references or optional components for
established molecular visualization capabilities. - A custom Three.js
scene for the primary MatterLab visual identity.

Capabilities: - Add and remove atoms. - Create and remove bonds. - Set
bond order where chemically appropriate. - Import/export common
molecular formats where supported. - Display formula, atom labels, bond
lengths, bond angles, and molecular geometry. - Validate basic valence
and flag suspicious structures. - Generate an initial 3D conformer where
supported. - Distinguish a user-drawn structure from an energy-minimized
or experimentally determined structure.

A drawn bond is a chemical representation, not a literal rigid rod
between two hard spheres. The interface should make that distinction
clear.

#### Supported chemistry and validation states

Proposed MVP chemistry baseline: H, C, N, O, F, P, S, Cl, Br, and I;
explicit hydrogen atoms; single, double, triple, and aromatic bonds.
Neutral and charged closed-shell molecules are eligible for validation,
subject to RDKit support. Radicals, stereochemistry editing, coordination
chemistry, and disconnected multi-component systems are deferred.
This baseline must be approved before implementing the editor contract.

- Formula calculation counts explicit atoms; do not silently add implicit
  hydrogens or change protonation.
- Aromaticity is a chemical property, not just a bond rendering style.
  Preserve atom and bond aromaticity consistently through RDKit conversion;
  include benzene as a round-trip reference case.
- Molecular net charge must equal the sum of atom formal charges for a
  calculation-ready structure. Isotope mass numbers must match the selected
  element's reference data.
- Validation reports separate states: incomplete/invalid draft, unsupported
  chemistry, valid structure, and ready for a particular operation/model.
  Passing valence checks does not establish physical stability or force-field
  parameter coverage.
- Drafts remain editable and saveable even when chemically invalid.
  Malformed project data, such as dangling bond references, is a separate
  serialization error and must not be silently repaired.
- Unsupported imported chemistry must produce a specific error rather than
  losing charge, stereochemistry, atoms, or bonds during conversion.

### 4.3 Classical molecular dynamics mode

Purpose: simulate the motion of atoms and molecules over time under a
specified force field.

Recommended engine: - **OpenMM** as the first molecular-dynamics
integration target. - **LAMMPS** as a later option for materials
science, larger-scale systems, and additional interatomic potentials.

Capabilities: - Load a supported molecular system and force field. - Set
temperature, pressure, boundary conditions, timestep, and simulation
duration within validated ranges. - Run, pause, step, and reset. - Show
trajectory, kinetic energy, potential energy, total energy, temperature,
and other available observables. - Export trajectories and numerical
results. - Show the force field and parameter source in the run
metadata.

Scientific limitations: - Standard molecular mechanics force fields
generally use predefined topology and are not automatically capable of
discovering arbitrary bond formation and breaking. - Results depend on
force-field quality, parameter coverage, timestep, ensemble, initial
conditions, and sampling. - Molecular dynamics is not a direct
visualization of electrons moving around nuclei. - Temperature is a
statistical property of an ensemble, not a property that should be
assigned casually to a single atom.

### 4.4 Reactive chemistry mode

Purpose: explore selected reactions where bonds can form and break.

This is a later milestone, not a requirement for the first prototype.

Potential approach: - Investigate reactive force fields such as ReaxFF
through a suitable LAMMPS configuration. - Consider quantum-chemistry
calculations for small systems and selected reaction pathways. -
Restrict supported elements, systems, and conditions to those covered by
validated parameter sets or methods. - Compare results against reference
calculations or experimental data where possible.

Never label a reaction as scientifically predicted unless the chosen
model is suitable for that reaction and its limitations are disclosed.

### 4.5 Quantum chemistry mode

Purpose: calculate electronic structure and molecular properties for
supported small systems.

Potential engine: - **Psi4** for quantum-chemistry calculations.

Possible calculations: - Single-point electronic energy. - Geometry
optimization. - Supported molecular orbital calculations. - Electron
density and electrostatic-potential data. - Selected vibrational or
other properties, depending on method support.

The UI must report the method, basis set, charge, spin multiplicity,
convergence status, and relevant calculation settings. Results must not
be presented as exact when they are approximate.

### 4.6 Subatomic and nuclear physics mode

Purpose: provide a future route into particle and nuclear physics.

Potential engine: - **Geant4** for particle transport through materials,
detector-style interactions, and radiation-physics workflows.

Important boundary: - Geant4 is not a general-purpose engine for
assembling quarks into protons and neutrons or simulating arbitrary
quantum chromodynamics. - Quark and gluon visualizations in an early
release should be explicitly educational or illustrative unless
connected to a validated specialized model. - Do not represent quarks as
isolated particles that can be freely dragged apart in ordinary
conditions. Confinement and the limitations of the model must be
explained.

## 5. Recommended technology stack

### Front end

-   **TypeScript** --- application language and shared data contracts.
-   **React** --- interface components and application state.
-   **Vite** --- development server and build tooling.
-   **Three.js** --- main 3D rendering engine.
-   **WebGL2**, with WebGPU considered later when browser and library
    support are suitable.
-   **Zustand** or a similarly lightweight state store --- shared UI and
    scene state.
-   **Vitest** --- unit and component-level tests.
-   **Playwright** --- browser end-to-end tests.

### Scientific computation

Keep scientific engines behind a service boundary rather than embedding
all computation in the rendering loop.

Recommended initial integration: - Python service for RDKit and later
Psi4/OpenMM integrations. - FastAPI for a typed HTTP API. - WebSocket or
server-sent updates for job progress and live results where
appropriate. - OpenMM may use GPU acceleration when the deployment
environment supports it. - A later desktop packaging option can run
local services or native workers.

The initial prototype can use a mock simulation adapter and curated scientific
data before integrating heavy engines. This allows the UI and
interaction model to be developed and tested early.

Mock adapters are prototype/development tools only. Their controls,
results, and exports must say "Illustrative mock data"; they must not
substitute for unavailable engines or count toward scientific acceptance
tests. The usable MVP requires the RDKit operations listed in Section 13.

### Data and file formats

Prefer established formats: - **SDF / MOL** for molecular structures. -
**PDB / mmCIF** for supported biomolecular structures. - **XYZ** for
simple atomic coordinate sets. - Engine-native trajectory formats where
appropriate, with documented conversion. - JSON for application-level
metadata and experiment configuration.

Do not invent a proprietary format before there is a demonstrated need.

## 6. High-level architecture

Separate the project into five layers.

### A. Presentation layer

Responsibilities: - Navigation and workspaces. - Toolbars, menus,
inspectors, and settings. - Element and molecule palettes. - Experiment
controls. - Accessibility and keyboard interactions.

### B. Visualization layer

Responsibilities: - Three.js scene, camera, lights, materials, and
post-processing. - Atoms, bonds, surfaces, labels, vectors, and
probability-density renderings. - Selection, hover, picking, and object
highlighting. - Efficient instanced rendering for large numbers of
repeated objects. - Visual scale indicators and representation warnings.

The visualization layer receives state and results. It must not invent
physics values.

### C. Domain and simulation layer

Responsibilities: - Typed scientific entities and units. - Simulation
configuration and validation. - Model selection and capability
declarations. - Job lifecycle: validate, queue, run, cancel, complete,
fail; computation pause is optional by adapter capability. - Mapping between engine outputs and application-level
data.

### D. Engine adapter layer

Responsibilities: - OpenMM adapter. - RDKit adapter. - Psi4 adapter. -
Future LAMMPS and Geant4 adapters. - Version and capability reporting. -
Conversion to and from engine-specific formats.

Each adapter must declare: - Supported elements and system types. -
Supported operations. - Required input data. - Available outputs. -
Known limitations. - Engine version and configuration.

### E. Data and provenance layer

Responsibilities: - Element and isotope reference data. - Molecular
structures and conformers. - Force-field and parameter metadata. -
Experiment configurations and results. - Source, version, and provenance
of scientific datasets.

## 7. Suggested repository layout

Start with a single repository and keep the boundaries clear.

``` text
matterlab/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── docs/
│   ├── PROJECT_SPEC.md
│   ├── SCIENTIFIC_MODELS.md
│   ├── ARCHITECTURE.md
│   └── DATA_PROVENANCE.md
├── apps/
│   └── web/
│       ├── index.html
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── workspaces/
│       │   │   ├── atom/
│       │   │   ├── molecule/
│       │   │   └── experiment/
│       │   ├── scene/
│       │   ├── state/
│       │   └── styles/
│       └── tests/
├── packages/
│   ├── domain/
│   ├── visualization/
│   ├── simulation-client/
│   └── shared-types/
├── services/
│   └── science-api/
│       ├── app/
│       │   ├── api/
│       │   ├── adapters/
│       │   │   ├── rdkit/
│       │   │   ├── openmm/
│       │   │   └── psi4/
│       │   ├── models/
│       │   └── jobs/
│       └── tests/
├── data/
│   ├── elements/
│   ├── isotopes/
│   └── example-molecules/
└── scripts/
```

This is a target structure, not a requirement to create every directory
on day one.

## 8. Core domain objects

Use explicit types and units. Avoid ambiguous fields such as `mass: 12`
without saying whether that means atomic mass units, kilograms, or
another unit.

Example conceptual types:

``` ts
type ParticleKind =
  | "proton"
  | "neutron"
  | "electron"
  | "atom"
  | "molecule";

type Quantity = {
  value: number;
} & (
  | { dimension: "distance"; unit: "angstrom" }
  | { dimension: "time"; unit: "ps" }
  | { dimension: "temperature"; unit: "K" }
  | { dimension: "pressure"; unit: "bar" }
  | { dimension: "charge"; unit: "e" }
  | { dimension: "mass"; unit: "u" }
  | { dimension: "energy"; unit: "kJ/mol"; basis: "mole-of-systems" }
);

type Atom = {
  id: string;
  element: string;       // e.g. "C"
  isotope?: number;      // mass number, e.g. 13
  positionAngstrom: [number, number, number];
  formalCharge: number;
  aromatic: boolean;
};

type Bond = {
  id: string;
  atomA: string;
  atomB: string;
  order: 1 | 2 | 3 | "aromatic";
};

type Molecule = {
  id: string;
  revisionId: string;
  atoms: Atom[];
  bonds: Bond[];
  netCharge: number;
  spinMultiplicity?: number;
};

type SimulationModel = {
  id: string;
  name: string;
  category: "molecular-mechanics" | "quantum-chemistry"
           | "reactive-md" | "particle-transport"
           | "educational";
  engine: string;
  engineVersion?: string;
  assumptions: string[];
  limitations: string[];
};

type ExperimentConfig = {
  modelPresetId: string;
  modelPresetVersion: string;
  initialStructureRevisionId: string;
  temperature?: Extract<Quantity, { dimension: "temperature" }>;
  pressure?: Extract<Quantity, { dimension: "pressure" }>;
  timestep?: Extract<Quantity, { dimension: "time" }>;
  duration?: Extract<Quantity, { dimension: "time" }>;
  randomSeed?: number;
};
```

These are starting concepts, not complete API schemas. Canonical domain
units are shown above; adapters convert engine units explicitly.
An energy value describes one whole modeled system on a molar basis;
per-particle and per-atom averages require separate, explicit normalization
metadata. Do not conflate them.

Runtime schemas must reject non-finite numbers, invalid units, duplicate
IDs, self-bonds, duplicate atom-pair bonds, and missing atom references.
Formal charges are integers; charge consistency is checked before calculation.
Resolve bond endpoints within their owning structure revision.

Every calculation uses an immutable input revision. Editing creates a new
revision and cannot change a running job's input or relabel old results as
results for the edited structure. Later molecular-dynamics contracts must
also define topology, velocities, constraints, and periodic box vectors
with explicit units before that integration begins.

A versioned model preset is distinct from an engine. It fixes the physical
method and validated configuration: for molecular dynamics this includes
force field and parameter sources, integrator, ensemble, constraints,
boundary conditions, and permitted user overrides. Capability discovery
must report supported operations and input limits for each preset.

### Project persistence

- The MVP saves and opens local project files; cloud storage is deferred.
  Saving must not depend on the science service being available.
- Use a versioned JSON project envelope for structures, units, drafts,
  selected representation, experiment configuration, and provenance.
  Established molecular formats remain interchange formats, not complete
  replacements for project persistence.
- Preserve IDs, coordinates, connectivity, aromaticity, isotopes, charges,
  and scientific metadata across save/load. Do not round stored coordinates
  to the precision used in labels.
- Reject unsupported schema versions and corrupt files with actionable
  errors without replacing the currently open project. Migrations must be
  explicit and tested; never silently discard unknown scientific content.
- Mark unsaved changes and warn before destructive replacement. Autosave
  and recovery are deferred unless separately approved.
- MVP molecular interchange is SDF/MOL for the supported chemistry.
  Validate the whole import before modifying the scene. Broader formats,
  including PDB/mmCIF and lossy XYZ workflows, are later capabilities.

## 9. User interface specification

### Main application layout

The primary desktop layout should contain:

1.  **Top bar:** project name, workspace selector, save/open, undo/redo,
    settings.
2.  **Left sidebar:** element palette, molecule library, object tree,
    creation tools.
3.  **Central viewport:** interactive 3D laboratory.
4.  **Right inspector:** selected object properties, scientific data,
    model details.
5.  **Bottom panel:** simulation timeline, play/pause/step, charts,
    logs, and measurements.

On smaller screens, side panels should collapse into drawers. The first
release should prioritize desktop-sized browser windows.

### Main workspaces

**Atom workspace** - Periodic table or element selector. - Isotope and
charge selection. - Nucleus and electron-configuration panel. -
Orbital/probability visualization selector. - Scale and model
disclosure.

**Molecule workspace** - Element palette. - Atom placement and bond
creation. - Structure validation. - Formula and geometry inspector. -
Import/export controls. - Geometry optimization action when supported.

**Experiment workspace** - Model and engine selector. - Input
validation. - Environment controls. - Run/pause/step/reset. - Progress
and status. - Live measurements and plots. - Result provenance and
export.

### Interaction requirements

-   Orbit, pan, and zoom the camera.
-   Select an atom or object by clicking.
-   Multi-select where appropriate.
-   Add, delete, move, and inspect objects.
-   Undo and redo editing actions.
-   Reset the camera and fit the scene.
-   Toggle atom labels, bonds, axes, scale indicators, and overlays.
-   Pause and resume a running visualization without corrupting
    simulation state.
-   Clearly distinguish editing mode from simulation mode.

### Computation controls versus trajectory playback

- Playback pause stops advancing displayed frames; it does not pause the
  engine. A playback step advances one stored trajectory frame and displays
  its simulation time.
- Computation pause/resume and integration-step controls appear only when
  the adapter explicitly supports them. An integration step is not a frame.
- Job states are queued, running, cancelling, cancelled, completed, and
  failed; paused is optional. Reject invalid input before creating a job.
- Cancellation is acknowledged only after the worker stops. Preserve
  available partial results with incomplete/cancelled status.
- Reset playback returns to the first frame. Resetting experiment inputs
  restores the captured starting revision; it must not silently create a
  new run or cancel existing work.
- On disconnection, show connection loss rather than inventing job status.
  Reconnect using the job ID and retrieve authoritative state. If a service
  restart prevents recovery, report interruption explicitly, retaining
  available metadata and results.

### Accessibility baseline

Core editing, selection, property inspection, and save/load must be usable
by keyboard through toolbars, the object tree, and numeric coordinate
fields, without requiring 3D dragging. Provide visible focus, accessible
control names, non-color selection/error cues, reduced-motion support, and
text/table alternatives for essential viewport and chart information.

## 10. Visual design and rendering requirements

The graphics should be excellent, but scientific clarity takes
precedence over decorative effects.

### Visual direction

-   Dark, low-distraction laboratory environment as the default theme.
-   High-quality physically based materials where useful.
-   Carefully controlled bloom and glow; never let post-processing
    obscure structure.
-   Smooth camera movement and stable object selection.
-   Clear color contrast and colorblind-aware alternatives.
-   Subtle grid, axes, and scale indicators.
-   High-quality typography and restrained UI animation.

### Rendering techniques

-   Three.js with TypeScript.
-   Instanced meshes for repeated atoms or particles.
-   Shader-based surfaces for electron density and other scalar fields.
-   Level-of-detail strategies for large scenes.
-   Efficient picking and selection.
-   Post-processing that can be disabled.
-   Adaptive rendering quality based on device capability.

### Scientific visual representations

Support different representations explicitly: - Ball-and-stick. -
Space-filling / van der Waals representation. - Wireframe. - CPK-style
element coloring, with a legend and configurable scheme. -
Electron-density or orbital isosurfaces when data is available. -
Vectors for forces or velocities, clearly labeled. - Trajectory paths,
with time and scale context.

Do not make atom radii, bond thicknesses, electron clouds, or particle
sizes look physically to scale unless the representation truly is to
scale. Include a visual-scale disclosure whenever sizes are exaggerated
for visibility.

## 11. Performance targets

These are initial engineering targets to validate on representative
hardware, not guarantees.

-   Maintain a responsive interface during ordinary editing.
-   Target 60 frames per second for a modest interactive scene on a
    modern desktop GPU.
-   Avoid one draw call per atom when instancing is appropriate.
-   Keep expensive scientific calculations out of the browser render
    loop.
-   Stream or batch simulation frames rather than sending unnecessary
    per-particle updates.
-   Allow the user to reduce effects and rendering quality.
-   Measure performance with realistic test scenes before setting
    maximum particle counts.

The physics engine's timestep and the visual frame rate are separate.
Rendering at 60 FPS does not mean the physical simulation is running at
60 scientific timesteps per second.

### Benchmark contract

Proposed release budgets, pending measurement and approval:

| Scenario | Fixture | Proposed acceptance |
| --- | --- | --- |
| Ordinary editing | 100 atoms, 100 bonds, labels off | p95 frame time at most 16.7 ms; p95 selection response at most 100 ms |
| Dense structure | 1,000 atoms, 1,000 bonds, labels off | p95 frame time at most 33.3 ms on the low-effects preset |
| Trajectory playback, later release | 1,000 atoms, 1,000 frames | Bounded decoded-frame buffer; memory budget set before implementation |

Before treating these as release gates, record an exact reference CPU/GPU,
RAM, OS, browser version, 1920 x 1080 viewport, device pixel ratio, and
rendering preset. Measure a repeatable 60-second interaction after warm-up.
Store fixtures and the measurement procedure with benchmark results.
These are rendering budgets, not promises of scientific engine throughput.
Declare supported browsers and an explicit unsupported-WebGL2 message.

## 12. Scientific accuracy and trust requirements

This section is mandatory.

1.  Every simulation result must identify the model and engine used.
2.  Show the engine version and important calculation settings.
3.  Record units for all displayed numerical quantities.
4.  Distinguish measured, imported, calculated, approximated, and
    illustrative data.
5.  Display warnings when a user asks for an unsupported or invalid
    calculation.
6.  Never silently substitute a toy model for a scientific engine.
7.  Do not imply that a visually plausible outcome is scientifically
    valid.
8.  Record random seeds for stochastic simulations when the engine
    supports them.
9.  Provide reproducibility metadata for saved experiments.
10. Include references or provenance for datasets and parameter sets.
11. Explain numerical limitations such as finite timestep, convergence
    tolerance, and model approximations where relevant.
12. Do not compare results from different methods as if they were
    directly equivalent without explaining the difference.
13. Label orbital amplitude/phase, orbital probability density, and total
    electron density separately, including isovalue and units where
    applicable. They are not interchangeable.
14. Distinguish thermostat target temperature from instantaneous
    kinetic-temperature estimates; document degrees of freedom and the
    treatment of constraints when reporting the latter.

### Reproducibility record

Saved results must include immutable input and model-preset revisions,
input and parameter-file hashes, dataset references, engine and adapter
versions, resolved settings, random seeds where supported, numerical
precision/platform details, termination/convergence status, and output
units. Record unavailable metadata explicitly.

A random seed alone does not guarantee identical trajectories across
hardware, execution platforms, or engine versions. Each validation case
must state whether it expects exact equality, numerical tolerance, or
statistical agreement.

### Units

Adopt a consistent internal unit strategy and make conversions explicit.
Scientific engines may use different conventions. Store unit metadata at
adapter boundaries and convert into the application's canonical
representation.

Candidate display units include: - Distance: angstrom (Å) or nanometre
(nm), depending on context. - Time: femtosecond (fs) or picosecond
(ps). - Energy: kilojoule per mole (kJ/mol) or electronvolt (eV),
depending on context. - Temperature: kelvin (K). - Charge: elementary
charge (e). - Mass: unified atomic mass unit (u) or kilogram (kg).

Never infer units from a number alone.

Conversions between eV and kJ/mol must preserve the declared energy basis
(per whole system versus molar whole-system energy). Per-atom or
per-particle averages require explicit normalization, not just a unit change.

## 13. Initial MVP scope

The first usable version should be deliberately limited.

### Release boundaries

The proposed release split below takes precedence over the broader
capability lists elsewhere in this document. Confirm the split before
implementation; broader workflows describe the roadmap, not MVP promises.

| Capability | Prototype (milestones 0-2) | Usable MVP (through milestone 3) | Later |
| --- | --- | --- | --- |
| Static molecule editor and curated examples | Required | Required | Extend |
| Local project save/load and undo/redo | Required | Required | Extend |
| Chemical validation | Labeled provisional checks | RDKit required | Extend coverage |
| Supported SDF/MOL import/export | Optional | Required | Additional formats |
| Conformer generation | Deferred | RDKit, supported structures only | Extend |
| Atom/orbital workspace | Deferred | Deferred | Curated data first |
| Geometry optimization and dynamics | Deferred | Deferred | Validated presets |
| Quantum, reactive, and nuclear modes | Deferred | Deferred | Separate milestones |

The prototype is not a simulation release. Unsupported/deferred actions
must not appear as working scientific features.

Before implementation, approve the release split, supported chemistry
baseline, supported browser/OS matrix, and benchmark reference hardware
and budgets. These are open product decisions, not validated capabilities.

### MVP features

-   Web app starts locally from VS Code.
-   Main 3D viewport built with Three.js.
-   Camera orbit, pan, zoom, and reset.
-   Element palette with the approved chemistry subset from Section 4.2.
-   Add, select, move, and delete atom representations.
-   Basic molecule editor with explicit bond creation.
-   Molecule formula and chemical validation using RDKit through the
    science service. Provisional local checks are prototype-only.
-   Supported RDKit conformer generation, labeled as generated rather than
    experimentally determined or necessarily energy-minimized.
-   Local project save/load, undo/redo, and supported SDF/MOL interchange
    under the persistence contract in Section 8.
-   Inspector panel with element, atomic number, isotope (if selected),
    charge, and coordinates.
-   Switch between ball-and-stick and space-filling representations.
-   Clear distinction between static structure and running simulation.
-   Example molecules such as water, carbon dioxide, methane, and
    benzene.
-   Scientific-model information panel.
-   Basic tests and project documentation.

### Explicitly defer from MVP

-   Live quark and gluon simulation.
-   Full atom-from-first-principles construction.
-   Arbitrary chemical reaction prediction.
-   Large-scale molecular dynamics.
-   Real-time Psi4 calculations in the browser.
-   Multiplayer.
-   User accounts and cloud project storage.
-   Mobile-first interaction design.

A polished, accurate molecule editor is a better first milestone than a
broad but misleading simulation.

## 14. Development milestones

### Milestone 0 --- Project foundation

-   Create repository and development environment.
-   Set up TypeScript, React, Vite, linting, formatting, and tests.
-   Add a basic application shell.
-   Document how to run the project.

**Acceptance:** A developer can clone the repository, install
dependencies, and run the application locally using documented commands.

### Milestone 1 --- 3D laboratory

-   Add Three.js viewport.
-   Add camera controls and lighting.
-   Create atom and bond rendering primitives.
-   Add selection and object inspection.
-   Add representation switching.

**Acceptance:** Users can create, select, move, and delete a small set
of atoms in a smooth 3D scene.

### Milestone 2 --- Molecule editing

-   Add element palette.
-   Add atom placement and bond creation.
-   Add molecule data model and serialization.
-   Add formula and basic validation.
-   Load example structures.

**Acceptance:** Users can build and save simple molecular structures,
and the UI clearly reports invalid or unsupported structures. A user can
build water with explicit atoms and bonds, obtain H2O, save and reopen it
without losing coordinates, connectivity, isotopes, charges, or units,
and undo/redo bond deletion. Invalid drafts remain editable and saveable;
structurally corrupt files are rejected without replacing current work.

### Milestone 3 --- Scientific data and RDKit

-   Create the Python science service.
-   Add typed request/response contracts.
-   Integrate RDKit for supported structure operations.
-   Return validation, descriptors, and conformer data where supported.
-   Add service tests and error handling.

**Acceptance:** A molecule created in the UI can be submitted to the
service and receive a traceable, structured response. Water, carbon
dioxide, methane, and benzene pass supported round-trip fixtures.
An unsupported input produces a specific diagnostic rather than altered
chemistry. Service unavailability leaves editing and project saving
available while disabling service-dependent actions with an explanation.

### Milestone 4 --- First real simulation

-   Choose one well-supported molecular system and force field.
-   Integrate OpenMM behind an adapter.
-   Validate input and supported system requirements.
-   Run a short simulation as a background job.
-   Add bounded worker execution, job-state persistence, cancellation,
    progress reporting, and reconnect behavior before accepting long jobs.
-   Return trajectory and observable data.
-   Display model metadata and limitations.

**Acceptance:** A documented example can be run reproducibly, with units
and engine settings visible. Its preset defines the full physical setup,
and its reference case specifies numerical/statistical tolerances.
Editing the source structure cannot mutate a submitted job. Cancellation,
connection loss, and service interruption follow Section 9.

### Milestone 5 --- Quantum chemistry

-   Integrate Psi4 for supported small molecules.
-   Reuse the existing job queue and progress reporting.
-   Display energy, convergence status, method, and basis set.
-   Add optional orbital or electron-density visualization from
    calculated data.

**Acceptance:** A supported example calculation completes and its method
and settings are available to inspect.

### Milestone 6 --- Advanced physics

-   Evaluate LAMMPS for materials and reactive molecular dynamics.
-   Evaluate Geant4 for particle transport experiments.
-   Add specialized modes only when there is a well-defined scientific
    use case and validation plan.

## 15. API sketch

The science service should expose versioned, typed endpoints. Exact
schemas should be finalized during implementation.

Example routes:

``` text
GET  /api/v1/health
GET  /api/v1/capabilities
GET  /api/v1/elements
GET  /api/v1/elements/{symbol}
POST /api/v1/molecules/validate
POST /api/v1/molecules/conformers
POST /api/v1/experiments
GET  /api/v1/experiments/{job_id}
POST /api/v1/experiments/{job_id}/cancel
GET  /api/v1/experiments/{job_id}/results
```

Example experiment request:

``` json
{
  "model_preset_id": "water-md-demo",
  "model_preset_version": "1",
  "initial_structure_revision_id": "example-water-system-r1",
  "settings": {
    "temperature": {
      "value": 300,
      "unit": "K"
    },
    "duration": {
      "value": 10,
      "unit": "ps"
    }
  },
  "random_seed": 12345
}
```

This is illustrative; the water preset is not yet a validated scientific
configuration. The service must validate each field against the selected
versioned preset. Do not accept arbitrary engine settings without validation.

Use one authoritative runtime schema, with generated client types rather
than independently maintained Python/TypeScript contracts. The API above
uses snake_case; domain objects use camelCase with explicit boundary mapping.
The unit-tagged request fields must be converted to dimension-checked domain
quantities, not passed through as unvalidated objects.

Job creation returns HTTP 202 with a job ID and status URL after validation.
Use an idempotency key to prevent duplicate work when submission is retried.
Status/results identify the input revision and preset version. Define typed
errors with code, message, field path when relevant, and retryability.
Only advertise implemented capabilities; atomic-data endpoints and simulation
routes are not implied MVP requirements.

## 16. Testing and validation strategy

### Software tests

-   Unit tests for domain objects, unit conversion, and validation.
-   Component tests for editors and inspectors.
-   Integration tests for front-end/service communication.
-   End-to-end tests for the primary workflows.
-   Adapter tests using small, deterministic example systems.
-   Performance tests for rendering and trajectory playback.

### Scientific validation

-   Use published reference examples and engine-provided test cases.
-   Compare outputs against known values within documented tolerances.
-   Verify unit conversions independently.
-   Check conservation and stability properties where applicable.
-   Apply energy-conservation tests to appropriate isolated/NVE cases;
    do not require constant system energy under thermostatted dynamics.
-   Test sensitivity to timestep and relevant simulation settings.
-   Record the source and license of all reference datasets.
-   Have scientific assumptions reviewed before describing a feature as
    accurate.

A passing software test does not prove that a physical model is
scientifically valid.

### Required acceptance fixtures

- Water editor save/load and undo/redo preserve the Section 8 invariants.
- Benzene retains formula and aromaticity through supported SDF/MOL
  round trips; unsupported chemistry is rejected without silent conversion.
- Invalid drafts can be saved, but calculation submission requires
  operation-specific validation and parameter coverage.
- Unit tests independently verify distance/time conversions and energy
  basis, including rejection of incompatible dimensions.
- Job tests cover immutable inputs, duplicate submission, cancellation,
  partial-result labeling, reconnection, and service interruption.
- Each scientific reference fixture records its source, model/preset,
  expected observables, numerical or statistical tolerances, and why those
  tolerances are appropriate. Mock outputs cannot satisfy these tests.
- Keyboard-only editing and the approved performance fixtures are release
  gates for the features present in that release.

## 17. Error handling and safety

-   Validate structures and simulation settings before starting
    expensive jobs.
-   Show clear errors for unsupported elements, missing parameters,
    invalid valence, failed convergence, and engine crashes.
-   Allow cancellation of long-running jobs.
-   Keep the UI responsive while calculations run.
-   Do not silently discard partial results or failed-job metadata.
-   Apply resource limits to service jobs.
-   Do not execute arbitrary user-provided code or shell commands.
-   Keep uploaded files within documented size and format limits.

## 18. Licensing and third-party dependencies

Before adopting any repository or library: - Check its current license
and version. - Check whether the license is compatible with the intended
distribution model. - Record dependencies and their versions. - Preserve
required copyright and attribution notices. - Review licenses for
datasets, force fields, molecular structures, and visual assets
separately. - Do not assume that open-source software implies that all
associated scientific datasets are unrestricted.

The project should maintain a `THIRD_PARTY_NOTICES.md` and a dependency
inventory.

## 19. Initial repository shortlist

Use these as starting points for evaluation, not as a requirement to
integrate all of them immediately.

  ------------------------------------------------------------------------------------
  Project                 Intended role           Repository
  ----------------------- ----------------------- ------------------------------------
  Three.js                Main 3D renderer        https://github.com/mrdoob/three.js

  OpenMM                  Molecular dynamics      https://github.com/openmm/openmm

  RDKit                   Molecular chemistry and https://github.com/rdkit/rdkit
                          structures              

  Psi4                    Quantum chemistry       https://github.com/psi4/psi4

  LAMMPS                  Materials and advanced  https://github.com/lammps/lammps
                          molecular dynamics      

  Geant4                  Particle transport and  https://github.com/Geant4/geant4
                          detector physics        

  Mol\*                   Molecular visualization https://github.com/molstar/molstar
                          reference/component     

  3Dmol.js                Molecular visualization https://github.com/3dmol/3Dmol.js
                          reference/component     
  ------------------------------------------------------------------------------------

Review current documentation, release activity, supported platforms, and
licenses before selecting versions.

## 20. First development session checklist

Start small. Do not install every scientific engine on day one.

-   [ ] Create a Git repository named `matterlab`.
-   [ ] Create a React + TypeScript + Vite application.
-   [ ] Add Three.js and a basic full-window viewport.
-   [ ] Add camera orbit, pan, and zoom.
-   [ ] Render one carbon atom using a sphere.
-   [ ] Render a simple bond between two atoms.
-   [ ] Add a left-side element palette.
-   [ ] Add a right-side inspector.
-   [ ] Define typed `Atom`, `Bond`, and `Molecule` models.
-   [ ] Add a water molecule as the first example.
-   [ ] Add a visible notice: "Visual representation --- not to scale."
-   [ ] Add a README with setup and run instructions.
-   [ ] Commit the working foundation before adding more features.

### Suggested first milestone demo

The first demo is complete when a user can: 1. Open MatterLab in a
browser. 2. See a polished 3D laboratory. 3. Add oxygen and hydrogen
atoms. 4. Position them and create bonds. 5. See the water molecule's
formula and basic structure information. 6. Select an atom and inspect
its properties. 7. Switch the molecule representation. 8. Reset the
scene.

No physics engine integration is required for this first demo. The
structure editor should be cleanly designed so a real scientific engine
can be connected later.

------------------------------------------------------------------------

## 21. Definition of success

MatterLab is succeeding when it combines three qualities:

**Scientific integrity:** Results are tied to explicit models, units,
methods, assumptions, and provenance.

**Visual excellence:** The 3D environment is fluid, readable,
configurable, and beautiful without misrepresenting the science.

**Experimentation:** Users can construct systems, change conditions, run
supported calculations, inspect results, and learn from what happens.

The guiding rule for every feature is simple:

> Make the science as accurate as the selected model allows, make the
> graphics exceptional, and be honest about everything the model cannot
> tell us.
