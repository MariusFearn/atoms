# Third-Party Notices & Dataset Provenance

This project uses open-source libraries and curated scientific reference datasets. Versions and licenses should be reviewed before distribution.

## Front-End & Domain Dependencies (`package.json`)

- **React / React DOM** (`react`, `react-dom`) — MIT License
- **Three.js** (`three`, `@types/three`) — MIT License
- **Zustand** (`zustand`) — MIT License
- **Lucide React** (`lucide-react`) — ISC License
- **Vite / Vitest / TypeScript / ESLint / Testing Library** — MIT / Apache-2.0 Licenses (dev tooling)

## Science API Dependencies (`services/science-api/pyproject.toml`, managed via `uv`)

- **FastAPI** — MIT License
- **Pydantic** — MIT License
- **Uvicorn** — BSD-3-Clause License
- **RDKit** (`rdkit`) — BSD-3-Clause License
- **OpenMM** (`openmm[cuda12]`, including `amber14/tip3p.xml` and NVIDIA CUDA 12 runtime packages) — MIT / LGPL / NVIDIA CUDA EULA Licenses
- **PySCF** (`pyscf`, `scipy`, `h5py`) — Apache-2.0 / BSD-3-Clause Licenses
- **NumPy / Pillow** (transitive dependencies) — BSD-3-Clause / HPND Licenses
- **pytest / httpx** — MIT / BSD-3-Clause Licenses (dev tooling)

## Curated Scientific Reference Data (`packages/domain/src/elements.ts`)

- **Standard Atomic Weights**: IUPAC CIAAW (2021) abridged standard atomic weights.
- **Isotopic Masses & Abundances**: NIST Atomic Weights and Isotopic Compositions.
- **Covalent Radii**: Cordero, B. et al., *Dalton Trans.*, 2008, 2832–2838.
- **Van der Waals Radii**: Bondi, A., *J. Phys. Chem.* 1964, 68, 441; Mantina, M. et al., *J. Phys. Chem. A* 2009, 113, 5806.
- **Element Coloring**: Jmol / CPK color conventions and Okabe-Ito-inspired colorblind-safe palette.

## Curated Nuclear & Atomic Wave Reference Data (`packages/domain/src/nuclear.ts`, `atomWave.ts`)

- **Nuclear Masses & Binding Energies**: AME2020 Atomic Mass Evaluation / NNDC NuDat 3.0 (⁴He, ⁸Be, ¹²C ground & Hoyle state, ¹⁶O, and p + ¹¹B reaction Q-value).
- **Fundamental Physical Constants**: CODATA recommended values (Coulomb constant αħc, Bohr radius a₀, proton/neutron/alpha masses, gravitational constant G).

