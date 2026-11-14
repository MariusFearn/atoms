import { create } from 'zustand';
import {
  type Atom,
  type BondOrder,
  type ColorPaletteMode,
  EXAMPLE_MOLECULES,
  type Molecule,
  PROJECT_SCHEMA_VERSION,
  type ProjectFileV1,
  type RepresentationMode,
  type StructureValidationReport,
  bondPairKey,
  cloneMolecule,
  createEmptyMolecule,
  parseProject,
  serializeProject,
  validateChemistryProvisional,
} from '@matterlab/domain';

export type EditorTool = 'select' | 'place-atom' | 'bond';
export type WorkspaceTab = 'molecule' | 'atom' | 'experiment';

export interface ServiceStatusState {
  state: 'checking' | 'connected' | 'offline';
  modeLabel: string;
  rdkitAvailable: boolean;
  openmmAvailable: boolean;
  detail: string;
}

interface LabSnapshot {
  molecule: Molecule;
  projectName: string;
}

export interface LabState {
  projectName: string;
  workspaceTab: WorkspaceTab;
  molecule: Molecule;
  validation: StructureValidationReport;
  past: LabSnapshot[];
  future: LabSnapshot[];
  hasUnsavedChanges: boolean;

  activeTool: EditorTool;
  activeElement: string;
  activeBondOrder: BondOrder;
  selectedAtomIds: string[];
  selectedBondId: string | null;
  pendingBondSourceAtomId: string | null;
  hoveredAtomId: string | null;

  representation: RepresentationMode;
  colorPalette: ColorPaletteMode;
  showLabels: boolean;
  showBonds: boolean;
  showAxes: boolean;
  showGrid: boolean;
  lowEffects: boolean;

  cameraResetNonce: number;
  cameraFitNonce: number;
  statusBanner: { kind: 'info' | 'warning' | 'error'; message: string } | null;
  serviceStatus: ServiceStatusState;

  setWorkspaceTab: (tab: WorkspaceTab) => void;
  setProjectName: (name: string) => void;
  setActiveTool: (tool: EditorTool) => void;
  setActiveElement: (symbol: string) => void;
  setActiveBondOrder: (order: BondOrder) => void;
  setHoveredAtomId: (atomId: string | null) => void;

  selectAtom: (atomId: string | null, additive?: boolean) => void;
  selectBond: (bondId: string | null) => void;

  addAtom: (element: string, positionAngstrom: [number, number, number]) => string;
  moveAtom: (atomId: string, positionAngstrom: [number, number, number], recordUndo?: boolean) => void;
  beginAtomMoveGesture: () => void;
  updateAtomProperties: (
    atomId: string,
    patch: {
      element?: string;
      isotope?: number | undefined;
      formalCharge?: number;
      aromatic?: boolean;
    },
  ) => void;
  deleteSelected: () => void;
  deleteAtom: (atomId: string) => void;
  createOrUpdateBond: (atomA: string, atomB: string, order: BondOrder) => void;
  deleteBond: (bondId: string) => void;
  handleAtomClickForTool: (atomId: string, additive?: boolean) => void;

  undo: () => void;
  redo: () => void;

  setRepresentation: (mode: RepresentationMode) => void;
  setColorPalette: (palette: ColorPaletteMode) => void;
  toggleLabels: () => void;
  toggleBonds: () => void;
  toggleAxes: () => void;
  toggleGrid: () => void;
  toggleLowEffects: () => void;

  triggerCameraReset: () => void;
  triggerCameraFit: () => void;

  loadExample: (exampleId: string) => void;
  resetToEmptyScene: () => void;
  exportProjectJson: () => string;
  importProjectJson: (jsonText: string) => boolean;
  markSaved: () => void;
  clearStatusBanner: () => void;
  setStatusBanner: (banner: { kind: 'info' | 'warning' | 'error'; message: string }) => void;
  checkScienceService: () => Promise<void>;
}

let revisionCounter = 1;
let entityCounter = 100;

function nextRevisionId(baseId: string): string {
  revisionCounter += 1;
  return `${baseId}-r${revisionCounter}`;
}

function nextAtomId(element: string, existingAtoms: Atom[]): string {
  const existing = new Set(existingAtoms.map((a) => a.id));
  let idx = existingAtoms.filter((a) => a.element === element).length + 1;
  while (existing.has(`${element}${idx}`)) {
    idx += 1;
  }
  return `${element}${idx}`;
}

function nextBondId(existingBonds: Molecule['bonds']): string {
  const existing = new Set(existingBonds.map((b) => b.id));
  entityCounter += 1;
  let id = `b${entityCounter}`;
  while (existing.has(id)) {
    entityCounter += 1;
    id = `b${entityCounter}`;
  }
  return id;
}

function syncAromaticFlags(molecule: Molecule): Molecule {
  const aromaticAtomIds = new Set<string>();
  for (const bond of molecule.bonds) {
    if (bond.order === 'aromatic') {
      aromaticAtomIds.add(bond.atomA);
      aromaticAtomIds.add(bond.atomB);
    }
  }
  return {
    ...molecule,
    atoms: molecule.atoms.map((atom) => ({
      ...atom,
      aromatic: aromaticAtomIds.has(atom.id),
    })),
  };
}

function recomputeNetCharge(molecule: Molecule): Molecule {
  const netCharge = molecule.atoms.reduce((sum, a) => sum + a.formalCharge, 0);
  return { ...molecule, netCharge };
}

function withUserMutation(
  state: LabState,
  mutate: (mol: Molecule) => Molecule,
  recordUndo = true,
): Partial<LabState> {
  const snapshot: LabSnapshot = {
    molecule: cloneMolecule(state.molecule),
    projectName: state.projectName,
  };
  let nextMol = mutate(cloneMolecule(state.molecule));
  nextMol = recomputeNetCharge(nextMol);
  nextMol.revisionId = nextRevisionId(nextMol.id);
  if (nextMol.provenance.sourceKind !== 'user-constructed') {
    nextMol.provenance = {
      sourceKind: 'user-constructed',
      summary: 'Modified interactively in MatterLab structure editor.',
      geometryStatus: 'user-placed',
    };
  }

  return {
    molecule: nextMol,
    validation: validateChemistryProvisional(nextMol),
    past: recordUndo ? [...state.past.slice(-49), snapshot] : state.past,
    future: recordUndo ? [] : state.future,
    hasUnsavedChanges: true,
  };
}

const initialWater = cloneMolecule(EXAMPLE_MOLECULES[0]!.molecule);

export const useLabStore = create<LabState>((set, get) => ({
  projectName: 'Water Reference',
  workspaceTab: 'molecule',
  molecule: initialWater,
  validation: validateChemistryProvisional(initialWater),
  past: [],
  future: [],
  hasUnsavedChanges: false,

  activeTool: 'select',
  activeElement: 'C',
  activeBondOrder: 1,
  selectedAtomIds: ['O1'],
  selectedBondId: null,
  pendingBondSourceAtomId: null,
  hoveredAtomId: null,

  representation: 'ball-and-stick',
  colorPalette: 'cpk',
  showLabels: true,
  showBonds: true,
  showAxes: true,
  showGrid: true,
  lowEffects: false,

  cameraResetNonce: 0,
  cameraFitNonce: 0,
  statusBanner: null,
  serviceStatus: {
    state: 'checking',
    modeLabel: 'Checking science service…',
    rdkitAvailable: false,
    openmmAvailable: false,
    detail: 'Connecting to optional local science-api.',
  },

  setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
  setProjectName: (projectName) => set({ projectName, hasUnsavedChanges: true }),

  setActiveTool: (activeTool) =>
    set({
      activeTool,
      pendingBondSourceAtomId: null,
    }),

  setActiveElement: (activeElement) => set({ activeElement }),
  setActiveBondOrder: (activeBondOrder) => set({ activeBondOrder }),
  setHoveredAtomId: (hoveredAtomId) => set({ hoveredAtomId }),

  selectAtom: (atomId, additive = false) =>
    set((state) => {
      if (!atomId) {
        return { selectedAtomIds: [], selectedBondId: null, pendingBondSourceAtomId: null };
      }
      if (!additive) {
        return { selectedAtomIds: [atomId], selectedBondId: null };
      }
      const exists = state.selectedAtomIds.includes(atomId);
      const next = exists
        ? state.selectedAtomIds.filter((id) => id !== atomId)
        : [...state.selectedAtomIds, atomId];
      return { selectedAtomIds: next, selectedBondId: null };
    }),

  selectBond: (bondId) =>
    set({
      selectedBondId: bondId,
      selectedAtomIds: [],
      pendingBondSourceAtomId: null,
    }),

  addAtom: (element, positionAngstrom) => {
    let createdId = '';
    set((state) => {
      const updates = withUserMutation(state, (mol) => {
        createdId = nextAtomId(element, mol.atoms);
        mol.atoms.push({
          id: createdId,
          element,
          positionAngstrom: [
            Number(positionAngstrom[0].toFixed(4)),
            Number(positionAngstrom[1].toFixed(4)),
            Number(positionAngstrom[2].toFixed(4)),
          ],
          formalCharge: 0,
          aromatic: false,
        });
        return mol;
      });
      return {
        ...updates,
        selectedAtomIds: [createdId],
        selectedBondId: null,
      };
    });
    return createdId;
  },

  beginAtomMoveGesture: () =>
    set((state) => ({
      past: [
        ...state.past.slice(-49),
        { molecule: cloneMolecule(state.molecule), projectName: state.projectName },
      ],
      future: [],
    })),

  moveAtom: (atomId, positionAngstrom, recordUndo = true) =>
    set((state) => {
      if (
        !Number.isFinite(positionAngstrom[0]) ||
        !Number.isFinite(positionAngstrom[1]) ||
        !Number.isFinite(positionAngstrom[2])
      ) {
        return {};
      }
      return withUserMutation(
        state,
        (mol) => {
          mol.atoms = mol.atoms.map((a) =>
            a.id === atomId
              ? { ...a, positionAngstrom: [...positionAngstrom] as [number, number, number] }
              : a,
          );
          return mol;
        },
        recordUndo,
      );
    }),

  updateAtomProperties: (atomId, patch) =>
    set((state) =>
      withUserMutation(state, (mol) => {
        mol.atoms = mol.atoms.map((a) => {
          if (a.id !== atomId) return a;
          const next: Atom = {
            ...a,
            ...(patch.element !== undefined ? { element: patch.element } : {}),
            ...(patch.formalCharge !== undefined
              ? { formalCharge: patch.formalCharge }
              : {}),
            ...(patch.aromatic !== undefined ? { aromatic: patch.aromatic } : {}),
          };
          if (patch.element && patch.element !== a.element) {
            delete next.isotope;
          } else if ('isotope' in patch) {
            if (patch.isotope === undefined) {
              delete next.isotope;
            } else {
              next.isotope = patch.isotope;
            }
          }
          return next;
        });
        return mol;
      }),
    ),

  deleteAtom: (atomId) =>
    set((state) => {
      const updates = withUserMutation(state, (mol) => {
        mol.atoms = mol.atoms.filter((a) => a.id !== atomId);
        mol.bonds = mol.bonds.filter((b) => b.atomA !== atomId && b.atomB !== atomId);
        return syncAromaticFlags(mol);
      });
      return {
        ...updates,
        selectedAtomIds: state.selectedAtomIds.filter((id) => id !== atomId),
        pendingBondSourceAtomId:
          state.pendingBondSourceAtomId === atomId ? null : state.pendingBondSourceAtomId,
      };
    }),

  deleteSelected: () => {
    const state = get();
    if (state.selectedBondId) {
      state.deleteBond(state.selectedBondId);
      return;
    }
    if (state.selectedAtomIds.length === 0) return;
    const toDelete = new Set(state.selectedAtomIds);
    set((curr) => ({
      ...withUserMutation(curr, (mol) => {
        mol.atoms = mol.atoms.filter((a) => !toDelete.has(a.id));
        mol.bonds = mol.bonds.filter(
          (b) => !toDelete.has(b.atomA) && !toDelete.has(b.atomB),
        );
        return syncAromaticFlags(mol);
      }),
      selectedAtomIds: [],
      pendingBondSourceAtomId: null,
    }));
  },

  createOrUpdateBond: (atomA, atomB, order) => {
    if (atomA === atomB) return;
    set((state) => {
      const key = bondPairKey(atomA, atomB);
      let createdBondId = '';
      const updates = withUserMutation(state, (mol) => {
        const existing = mol.bonds.find(
          (b) => bondPairKey(b.atomA, b.atomB) === key,
        );
        if (existing) {
          existing.order = order;
          createdBondId = existing.id;
        } else {
          createdBondId = nextBondId(mol.bonds);
          mol.bonds.push({
            id: createdBondId,
            atomA,
            atomB,
            order,
          });
        }
        return syncAromaticFlags(mol);
      });
      return {
        ...updates,
        selectedBondId: createdBondId,
        selectedAtomIds: [atomA, atomB],
        pendingBondSourceAtomId: null,
      };
    });
  },

  deleteBond: (bondId) =>
    set((state) => ({
      ...withUserMutation(state, (mol) => {
        mol.bonds = mol.bonds.filter((b) => b.id !== bondId);
        return syncAromaticFlags(mol);
      }),
      selectedBondId: state.selectedBondId === bondId ? null : state.selectedBondId,
    })),

  handleAtomClickForTool: (atomId, additive = false) => {
    const state = get();
    if (state.activeTool !== 'bond') {
      state.selectAtom(atomId, additive);
      return;
    }
    if (!state.pendingBondSourceAtomId) {
      set({
        pendingBondSourceAtomId: atomId,
        selectedAtomIds: [atomId],
        selectedBondId: null,
      });
      return;
    }
    if (state.pendingBondSourceAtomId === atomId) {
      set({ pendingBondSourceAtomId: null });
      return;
    }
    state.createOrUpdateBond(
      state.pendingBondSourceAtomId,
      atomId,
      state.activeBondOrder,
    );
  },

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return {};
      const previous = state.past[state.past.length - 1]!;
      const currentSnapshot: LabSnapshot = {
        molecule: cloneMolecule(state.molecule),
        projectName: state.projectName,
      };
      return {
        molecule: previous.molecule,
        projectName: previous.projectName,
        validation: validateChemistryProvisional(previous.molecule),
        past: state.past.slice(0, -1),
        future: [currentSnapshot, ...state.future],
        hasUnsavedChanges: true,
        selectedAtomIds: state.selectedAtomIds.filter((id) =>
          previous.molecule.atoms.some((a) => a.id === id),
        ),
        selectedBondId: previous.molecule.bonds.some((b) => b.id === state.selectedBondId)
          ? state.selectedBondId
          : null,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {};
      const next = state.future[0]!;
      const currentSnapshot: LabSnapshot = {
        molecule: cloneMolecule(state.molecule),
        projectName: state.projectName,
      };
      return {
        molecule: next.molecule,
        projectName: next.projectName,
        validation: validateChemistryProvisional(next.molecule),
        past: [...state.past, currentSnapshot],
        future: state.future.slice(1),
        hasUnsavedChanges: true,
        selectedAtomIds: state.selectedAtomIds.filter((id) =>
          next.molecule.atoms.some((a) => a.id === id),
        ),
        selectedBondId: next.molecule.bonds.some((b) => b.id === state.selectedBondId)
          ? state.selectedBondId
          : null,
      };
    }),

  setRepresentation: (representation) => set({ representation }),
  setColorPalette: (colorPalette) => set({ colorPalette }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleBonds: () => set((s) => ({ showBonds: !s.showBonds })),
  toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleLowEffects: () => set((s) => ({ lowEffects: !s.lowEffects })),

  triggerCameraReset: () => set((s) => ({ cameraResetNonce: s.cameraResetNonce + 1 })),
  triggerCameraFit: () => set((s) => ({ cameraFitNonce: s.cameraFitNonce + 1 })),

  loadExample: (exampleId) =>
    set((state) => {
      const found = EXAMPLE_MOLECULES.find((e) => e.id === exampleId);
      if (!found) return {};
      const mol = cloneMolecule(found.molecule);
      return {
        projectName: `${found.title} Reference`,
        molecule: mol,
        validation: validateChemistryProvisional(mol),
        past: [],
        future: [],
        hasUnsavedChanges: false,
        selectedAtomIds: mol.atoms[0] ? [mol.atoms[0].id] : [],
        selectedBondId: null,
        pendingBondSourceAtomId: null,
        cameraFitNonce: state.cameraFitNonce + 1,
        statusBanner: {
          kind: 'info',
          message: `Loaded curated reference structure: ${found.title} (${found.formulaLabel}).`,
        },
      };
    }),

  resetToEmptyScene: () =>
    set((state) => {
      const empty = createEmptyMolecule('New Structure', 'mol-new', 'rev-1');
      return {
        projectName: 'Untitled Project',
        molecule: empty,
        validation: validateChemistryProvisional(empty),
        past: [],
        future: [],
        hasUnsavedChanges: false,
        selectedAtomIds: [],
        selectedBondId: null,
        pendingBondSourceAtomId: null,
        cameraResetNonce: state.cameraResetNonce + 1,
        statusBanner: {
          kind: 'info',
          message: 'Workspace reset to an empty structure.',
        },
      };
    }),

  exportProjectJson: () => {
    const state = get();
    const file: ProjectFileV1 = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectName: state.projectName.trim() || 'Untitled MatterLab Project',
      savedAtIso: new Date().toISOString(),
      units: { distance: 'angstrom', charge: 'e', mass: 'u' },
      viewSettings: {
        representation: state.representation,
        colorPalette: state.colorPalette,
        showLabels: state.showLabels,
        showBonds: state.showBonds,
        showAxes: state.showAxes,
        showGrid: state.showGrid,
      },
      molecule: state.molecule,
    };
    return serializeProject(file);
  },

  importProjectJson: (jsonText) => {
    try {
      const parsed = parseProject(jsonText);
      set((state) => ({
        projectName: parsed.projectName,
        molecule: parsed.molecule,
        validation: validateChemistryProvisional(parsed.molecule),
        representation: parsed.viewSettings.representation,
        colorPalette: parsed.viewSettings.colorPalette,
        showLabels: parsed.viewSettings.showLabels,
        showBonds: parsed.viewSettings.showBonds,
        showAxes: parsed.viewSettings.showAxes,
        showGrid: parsed.viewSettings.showGrid,
        past: [],
        future: [],
        hasUnsavedChanges: false,
        selectedAtomIds: parsed.molecule.atoms[0] ? [parsed.molecule.atoms[0].id] : [],
        selectedBondId: null,
        pendingBondSourceAtomId: null,
        cameraFitNonce: state.cameraFitNonce + 1,
        statusBanner: {
          kind: 'info',
          message: `Opened project "${parsed.projectName}" (${parsed.molecule.atoms.length} atoms).`,
        },
      }));
      return true;
    } catch (err) {
      set({
        statusBanner: {
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to open project file: invalid format.',
        },
      });
      return false;
    }
  },

  markSaved: () => set({ hasUnsavedChanges: false }),
  clearStatusBanner: () => set({ statusBanner: null }),
  setStatusBanner: (statusBanner) => set({ statusBanner }),

  checkScienceService: async () => {
    try {
      const res = await fetch('/api/v1/capabilities');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        api_version: string;
        adapters: Array<{ adapter: string; available: boolean }>;
      };
      const rdkit = data.adapters.find((a) => a.adapter === 'rdkit')?.available ?? false;
      const openmm = data.adapters.find((a) => a.adapter === 'openmm')?.available ?? false;
      set({
        serviceStatus: {
          state: 'connected',
          modeLabel: `Science API v${data.api_version} connected`,
          rdkitAvailable: rdkit,
          openmmAvailable: openmm,
          detail: rdkit
            ? 'RDKit validation ready.'
            : 'Prototype scaffold connected; RDKit (Milestone 3) and OpenMM (Milestone 4) are not enabled yet.',
        },
      });
    } catch {
      set({
        serviceStatus: {
          state: 'offline',
          modeLabel: 'Local editor mode (Science API offline)',
          rdkitAvailable: false,
          openmmAvailable: false,
          detail:
            'Local structure editing and JSON project save/load remain available. Service-dependent RDKit validation and conformers are disabled.',
        },
      });
    }
  },
}));
