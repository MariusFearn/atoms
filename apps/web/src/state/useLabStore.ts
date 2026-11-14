import { create } from 'zustand';
import {
  type Atom,
  type BondOrder,
  type ColorPaletteMode,
  EXAMPLE_MOLECULES,
  type ExperimentConfig,
  type ExperimentJobInfo,
  type ExperimentResults,
  type Molecule,
  PROJECT_SCHEMA_VERSION,
  type ProjectFileV1,
  type QuantumJobConfig,
  type QuantumJobInfo,
  type QuantumModelPreset,
  type QuantumResults,
  type RepresentationMode,
  type SimulationModelPreset,
  type StructureValidationReport,
  bondPairKey,
  cloneMolecule,
  createEmptyMolecule,
  parseProject,
  serializeProject,
  validateChemistryProvisional,
} from '@matterlab/domain';
import {
  type RdkitConformerResult,
  type RdkitValidationResult,
  ScienceApiError,
  cancelExperimentJob,
  cancelQuantumJob,
  exportMolBlockWithRdkit,
  fetchCapabilities,
  generateConformerWithRdkit,
  getExperimentResults,
  getExperimentStatus,
  getQuantumJobStatus,
  getQuantumResults,
  importMolBlockWithRdkit,
  listQuantumPresets,
  listSimulationPresets,
  submitExperimentJob,
  submitQuantumJob,
  validateMoleculeWithRdkit,
} from '@matterlab/simulation-client';

export type EditorTool = 'select' | 'place-atom' | 'bond';
export type WorkspaceTab = 'molecule' | 'atom' | 'experiment' | 'quantum';
export type QuantumFieldOverlayMode = 'none' | 'homo-amplitude-phase' | 'electron-density';

export interface ServiceStatusState {
  state: 'checking' | 'connected' | 'offline';
  modeLabel: string;
  rdkitAvailable: boolean;
  rdkitVersion: string | null;
  openmmAvailable: boolean;
  openmmVersion: string | null;
  pyscfAvailable: boolean;
  pyscfVersion: string | null;
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
  rdkitReport: RdkitValidationResult | null;
  lastConformerMeta: Omit<RdkitConformerResult, 'positionsAngstrom'> | null;
  isScienceBusy: boolean;
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

  simulationPresets: SimulationModelPreset[];
  experimentConfig: ExperimentConfig;
  experimentStartingMolecule: Molecule | null;
  activeJob: ExperimentJobInfo | null;
  activeResults: ExperimentResults | null;
  experimentConnectionLost: boolean;
  playbackFrameIndex: number;
  isPlayingTrajectory: boolean;

  quantumPresets: QuantumModelPreset[];
  quantumConfig: QuantumJobConfig;
  activeQuantumJob: QuantumJobInfo | null;
  activeQuantumResults: QuantumResults | null;
  quantumFieldOverlay: QuantumFieldOverlayMode;

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
  runRdkitValidation: () => Promise<RdkitValidationResult | null>;
  runRdkitConformer: (randomSeed?: number) => Promise<boolean>;
  importMolFile: (molText: string, name?: string) => Promise<boolean>;
  exportMolFile: () => Promise<{ molBlock: string; suggestedName: string } | null>;

  loadSimulationPresets: () => Promise<void>;
  selectSimulationPreset: (presetId: string) => void;
  updateExperimentConfig: (patch: {
    temperatureK?: number;
    timestepFs?: number;
    durationPs?: number;
    reportIntervalSteps?: number;
    randomSeed?: number;
    minimizeBeforeRun?: boolean;
  }) => void;
  runExperiment: () => Promise<void>;
  cancelActiveExperiment: () => Promise<void>;
  reconnectActiveExperiment: () => Promise<void>;
  resetExperimentInputs: () => void;
  setPlaybackFrameIndex: (index: number) => void;
  stepTrajectory: (delta: number) => void;
  toggleTrajectoryPlayback: () => void;
  resetTrajectoryPlayback: () => void;

  loadQuantumPresets: () => Promise<void>;
  selectQuantumPreset: (presetId: string) => void;
  setQuantumComputeFields: (computeFields: boolean) => void;
  setQuantumFieldOverlay: (mode: QuantumFieldOverlayMode) => void;
  runQuantumCalculation: () => Promise<void>;
  cancelActiveQuantumJob: () => Promise<void>;
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

const DEFAULT_EXPERIMENT_CONFIG: ExperimentConfig = {
  modelPresetId: 'tip3p-water-nvt',
  modelPresetVersion: '1',
  initialStructureRevisionId: initialWater.revisionId,
  temperature: { dimension: 'temperature', unit: 'K', value: 300 },
  timestep: { dimension: 'time', unit: 'fs', value: 1.0 },
  duration: { dimension: 'time', unit: 'ps', value: 2.0 },
  reportIntervalSteps: 40,
  randomSeed: 42,
  minimizeBeforeRun: true,
};

const DEFAULT_QUANTUM_CONFIG: QuantumJobConfig = {
  modelPresetId: 'pyscf-rhf-631g',
  modelPresetVersion: '1',
  initialStructureRevisionId: initialWater.revisionId,
  computeFields: true,
};

let activePollTimer: ReturnType<typeof setTimeout> | null = null;
let activeQuantumPollTimer: ReturnType<typeof setTimeout> | null = null;

function clearActivePollTimer(): void {
  if (activePollTimer !== null) {
    clearTimeout(activePollTimer);
    activePollTimer = null;
  }
}

function clearActiveQuantumPollTimer(): void {
  if (activeQuantumPollTimer !== null) {
    clearTimeout(activeQuantumPollTimer);
    activeQuantumPollTimer = null;
  }
}

export const useLabStore = create<LabState>((set, get) => ({
  projectName: 'Water Reference',
  workspaceTab: 'molecule',
  molecule: initialWater,
  validation: validateChemistryProvisional(initialWater),
  rdkitReport: null,
  lastConformerMeta: null,
  isScienceBusy: false,
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
    rdkitVersion: null,
    openmmAvailable: false,
    openmmVersion: null,
    pyscfAvailable: false,
    pyscfVersion: null,
    detail: 'Connecting to optional local science-api.',
  },

  simulationPresets: [],
  experimentConfig: DEFAULT_EXPERIMENT_CONFIG,
  experimentStartingMolecule: null,
  activeJob: null,
  activeResults: null,
  experimentConnectionLost: false,
  playbackFrameIndex: 0,
  isPlayingTrajectory: false,

  quantumPresets: [],
  quantumConfig: DEFAULT_QUANTUM_CONFIG,
  activeQuantumJob: null,
  activeQuantumResults: null,
  quantumFieldOverlay: 'homo-amplitude-phase',

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
        rdkitReport: null,
        lastConformerMeta: null,
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
        rdkitReport: null,
        lastConformerMeta: null,
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
        rdkitReport: null,
        lastConformerMeta: null,
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
      const data = await fetchCapabilities();
      const rdkit = data.adapters.find((a) => a.adapter === 'rdkit');
      const openmm = data.adapters.find((a) => a.adapter === 'openmm');
      const pyscf = data.adapters.find((a) => a.adapter === 'pyscf');
      const rdkitAvailable = rdkit?.available ?? false;
      const openmmAvailable = openmm?.available ?? false;
      const pyscfAvailable = pyscf?.available ?? false;
      const parts: string[] = [`Science API v${data.api_version}`];
      if (rdkitAvailable) parts.push(`RDKit ${rdkit?.version ?? ''}`.trim());
      if (openmmAvailable) parts.push(`OpenMM ${openmm?.version ?? ''}`.trim());
      if (pyscfAvailable) parts.push(`PySCF ${pyscf?.version ?? ''}`.trim());
      set({
        serviceStatus: {
          state: 'connected',
          modeLabel: parts.join(' · '),
          rdkitAvailable,
          rdkitVersion: rdkit?.version ?? null,
          openmmAvailable,
          openmmVersion: openmm?.version ?? null,
          pyscfAvailable,
          pyscfVersion: pyscf?.version ?? null,
          detail: 'RDKit, OpenMM, and PySCF scientific adapters connected.',
        },
      });
      if (openmmAvailable) {
        await get().loadSimulationPresets();
      }
      if (pyscfAvailable) {
        await get().loadQuantumPresets();
      }
    } catch {
      set({
        serviceStatus: {
          state: 'offline',
          modeLabel: 'Local editor mode (Science API offline)',
          rdkitAvailable: false,
          rdkitVersion: null,
          openmmAvailable: false,
          openmmVersion: null,
          pyscfAvailable: false,
          pyscfVersion: null,
          detail:
            'Local structure editing and JSON project save/load remain available. Service-dependent RDKit, OpenMM, and PySCF actions are disabled.',
        },
      });
    }
  },

  runRdkitValidation: async () => {
    const submittedMolecule = cloneMolecule(get().molecule);
    const submittedRevisionId = submittedMolecule.revisionId;
    set({ isScienceBusy: true });

    try {
      const result = await validateMoleculeWithRdkit(submittedMolecule);
      if (get().molecule.revisionId !== submittedRevisionId) {
        set({
          isScienceBusy: false,
          statusBanner: {
            kind: 'warning',
            message: `Structure was edited while validating ${submittedRevisionId}; discarded stale RDKit result.`,
          },
        });
        return null;
      }

      set({
        isScienceBusy: false,
        rdkitReport: result,
        statusBanner: {
          kind: result.status === 'valid-rdkit' ? 'info' : 'warning',
          message:
            result.status === 'valid-rdkit'
              ? `RDKit ${result.engineVersion}: Validated ${result.descriptors?.explicitFormula ?? submittedMolecule.name} (${result.descriptors?.canonicalSmiles ?? ''}).`
              : `RDKit ${result.engineVersion}: ${result.status} — ${result.diagnostics[0]?.message ?? 'See inspector.'}`,
        },
      });
      return result;
    } catch (err) {
      const apiErr = err instanceof ScienceApiError ? err : null;
      if (apiErr?.code === 'SERVICE_UNAVAILABLE') {
        set({
          isScienceBusy: false,
          serviceStatus: {
            state: 'offline',
            modeLabel: 'Local editor mode (Science API offline)',
            rdkitAvailable: false,
            rdkitVersion: null,
            openmmAvailable: false,
            openmmVersion: null,
            pyscfAvailable: false,
            pyscfVersion: null,
            detail:
              'Lost connection to Science API. Local editing and JSON save/load remain available.',
          },
          statusBanner: {
            kind: 'error',
            message: 'Science API is unavailable. Editing and JSON save/load remain active.',
          },
        });
      } else {
        set({
          isScienceBusy: false,
          statusBanner: {
            kind: 'error',
            message: err instanceof Error ? err.message : 'RDKit validation request failed.',
          },
        });
      }
      return null;
    }
  },

  runRdkitConformer: async (randomSeed = 42) => {
    const submittedMolecule = cloneMolecule(get().molecule);
    const submittedRevisionId = submittedMolecule.revisionId;
    set({ isScienceBusy: true });

    try {
      const result = await generateConformerWithRdkit(submittedMolecule, randomSeed);
      if (get().molecule.revisionId !== submittedRevisionId) {
        set({
          isScienceBusy: false,
          statusBanner: {
            kind: 'warning',
            message: `Structure changed during conformer generation (${submittedRevisionId}); did not overwrite edited coordinates.`,
          },
        });
        return false;
      }

      const { positionsAngstrom, ...meta } = result;
      set((state) => {
        const snapshot: LabSnapshot = {
          molecule: cloneMolecule(state.molecule),
          projectName: state.projectName,
        };
        const nextMol = cloneMolecule(state.molecule);
        nextMol.atoms = nextMol.atoms.map((a) => {
          const coords = positionsAngstrom[a.id];
          return coords ? { ...a, positionAngstrom: [...coords] as [number, number, number] } : a;
        });
        nextMol.revisionId = nextRevisionId(nextMol.id);
        nextMol.provenance = {
          sourceKind: 'user-constructed',
          summary: `Generated 3D conformer via ${result.method} (RDKit ${result.engineVersion}, seed=${result.randomSeed}; not experimentally determined or energy-minimized).`,
          geometryStatus: 'rdkit-conformer',
        };

        return {
          isScienceBusy: false,
          molecule: nextMol,
          validation: validateChemistryProvisional(nextMol),
          rdkitReport: null,
          lastConformerMeta: meta,
          past: [...state.past.slice(-49), snapshot],
          future: [],
          hasUnsavedChanges: true,
          cameraFitNonce: state.cameraFitNonce + 1,
          statusBanner: {
            kind: 'info',
            message: `Generated RDKit ETKDGv3 conformer (seed=${result.randomSeed}, not energy-minimized).`,
          },
        };
      });
      return true;
    } catch (err) {
      set({
        isScienceBusy: false,
        statusBanner: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'RDKit conformer generation failed.',
        },
      });
      return false;
    }
  },

  importMolFile: async (molText, name) => {
    set({ isScienceBusy: true });
    try {
      const res = await importMolBlockWithRdkit(molText, name);
      set((state) => ({
        isScienceBusy: false,
        projectName: res.molecule.name,
        molecule: res.molecule,
        validation: validateChemistryProvisional(res.molecule),
        rdkitReport: null,
        lastConformerMeta: null,
        past: [],
        future: [],
        hasUnsavedChanges: true,
        selectedAtomIds: res.molecule.atoms[0] ? [res.molecule.atoms[0].id] : [],
        selectedBondId: null,
        pendingBondSourceAtomId: null,
        cameraFitNonce: state.cameraFitNonce + 1,
        statusBanner: {
          kind: 'info',
          message: `Imported MOL structure "${res.molecule.name}" (${res.molecule.atoms.length} atoms) via RDKit ${res.engineVersion}.`,
        },
      }));
      return true;
    } catch (err) {
      set({
        isScienceBusy: false,
        statusBanner: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to import MOL/SDF file.',
        },
      });
      return false;
    }
  },

  exportMolFile: async () => {
    const state = get();
    set({ isScienceBusy: true });
    try {
      const res = await exportMolBlockWithRdkit(state.molecule);
      const slug =
        state.projectName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'matterlab-molecule';
      set({
        isScienceBusy: false,
        statusBanner: {
          kind: 'info',
          message: `Exported ${slug}.mol (MOL V2000) via RDKit ${res.engineVersion}.`,
        },
      });
      return { molBlock: res.molBlock, suggestedName: `${slug}.mol` };
    } catch (err) {
      set({
        isScienceBusy: false,
        statusBanner: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to export MOL file.',
        },
      });
      return null;
    }
  },

  loadSimulationPresets: async () => {
    try {
      const presets = await listSimulationPresets();
      set((state) => {
        const selected =
          presets.find((p) => p.id === state.experimentConfig.modelPresetId) ?? presets[0];
        if (!selected) return { simulationPresets: presets };
        return {
          simulationPresets: presets,
          experimentConfig: {
            ...state.experimentConfig,
            modelPresetId: selected.id,
            modelPresetVersion: selected.version,
          },
        };
      });
    } catch {
      // Presets remain empty when offline
    }
  },

  selectSimulationPreset: (presetId) =>
    set((state) => {
      const preset = state.simulationPresets.find((p) => p.id === presetId);
      if (!preset) return {};
      return {
        experimentConfig: {
          ...state.experimentConfig,
          modelPresetId: preset.id,
          modelPresetVersion: preset.version,
          temperature: {
            dimension: 'temperature',
            unit: 'K',
            value: preset.defaultTemperatureK,
          },
          timestep: {
            dimension: 'time',
            unit: 'fs',
            value: preset.defaultTimestepFs,
          },
          duration: {
            dimension: 'time',
            unit: 'ps',
            value: preset.defaultDurationPs,
          },
        },
      };
    }),

  updateExperimentConfig: (patch) =>
    set((state) => ({
      experimentConfig: {
        ...state.experimentConfig,
        ...(patch.temperatureK !== undefined && Number.isFinite(patch.temperatureK)
          ? {
              temperature: {
                dimension: 'temperature',
                unit: 'K',
                value: patch.temperatureK,
              },
            }
          : {}),
        ...(patch.timestepFs !== undefined && Number.isFinite(patch.timestepFs)
          ? {
              timestep: {
                dimension: 'time',
                unit: 'fs',
                value: patch.timestepFs,
              },
            }
          : {}),
        ...(patch.durationPs !== undefined && Number.isFinite(patch.durationPs)
          ? {
              duration: {
                dimension: 'time',
                unit: 'ps',
                value: patch.durationPs,
              },
            }
          : {}),
        ...(patch.reportIntervalSteps !== undefined &&
        Number.isInteger(patch.reportIntervalSteps) &&
        patch.reportIntervalSteps >= 1
          ? { reportIntervalSteps: patch.reportIntervalSteps }
          : {}),
        ...(patch.randomSeed !== undefined && Number.isInteger(patch.randomSeed)
          ? { randomSeed: patch.randomSeed }
          : {}),
        ...(patch.minimizeBeforeRun !== undefined
          ? { minimizeBeforeRun: patch.minimizeBeforeRun }
          : {}),
      },
    })),

  runExperiment: async () => {
    clearActivePollTimer();
    const state = get();
    const submittedMolecule = cloneMolecule(state.molecule);
    const config: ExperimentConfig = {
      ...state.experimentConfig,
      initialStructureRevisionId: submittedMolecule.revisionId,
    };
    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `exp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    set({
      isScienceBusy: true,
      experimentConnectionLost: false,
      experimentStartingMolecule: submittedMolecule,
      experimentConfig: config,
      isPlayingTrajectory: false,
      playbackFrameIndex: 0,
    });

    const pollJob = async (jobId: string) => {
      try {
        const job = await getExperimentStatus(jobId);
        set({ activeJob: job, experimentConnectionLost: false });

        if (job.framesRecorded > 0) {
          const partialOrFull = await getExperimentResults(jobId);
          set({ activeResults: partialOrFull });
        }

        if (job.status === 'queued' || job.status === 'running' || job.status === 'cancelling') {
          activePollTimer = setTimeout(() => {
            void pollJob(jobId);
          }, 250);
          return;
        }

        const finalResults = await getExperimentResults(jobId);
        set({
          isScienceBusy: false,
          activeJob: job,
          activeResults: finalResults,
          statusBanner: {
            kind:
              job.status === 'completed'
                ? 'info'
                : job.status === 'cancelled'
                  ? 'warning'
                  : 'error',
            message:
              job.status === 'completed'
                ? `OpenMM simulation completed (${finalResults.frames.length} frames, ${finalResults.reproducibility.ensemble}).`
                : job.status === 'cancelled'
                  ? `Simulation cancelled; ${finalResults.frames.length} partial frame(s) preserved.`
                  : `Simulation ${job.status}: ${job.errorMessage ?? 'see results.'}`,
          },
        });
      } catch {
        // Section 9: show connection loss rather than inventing job status
        set({
          isScienceBusy: false,
          experimentConnectionLost: true,
          statusBanner: {
            kind: 'error',
            message: `Lost connection while tracking job ${jobId}. Use Reconnect to retrieve authoritative status.`,
          },
        });
      }
    };

    try {
      const job = await submitExperimentJob(submittedMolecule, config, idempotencyKey);
      set({
        activeJob: job,
        activeResults: null,
        statusBanner: {
          kind: 'info',
          message: `Submitted OpenMM job ${job.jobId} (revision ${submittedMolecule.revisionId}).`,
        },
      });
      await pollJob(job.jobId);
    } catch (err) {
      set({
        isScienceBusy: false,
        statusBanner: {
          kind: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to submit OpenMM simulation job.',
        },
      });
    }
  },

  cancelActiveExperiment: async () => {
    const job = get().activeJob;
    if (!job) return;
    try {
      const updated = await cancelExperimentJob(job.jobId);
      set({
        activeJob: updated,
        statusBanner: {
          kind: 'warning',
          message:
            updated.status === 'cancelled'
              ? `Job ${updated.jobId} cancelled.`
              : `Cancellation requested for ${updated.jobId}; waiting for worker to stop…`,
        },
      });
    } catch (err) {
      set({
        experimentConnectionLost: true,
        statusBanner: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to send cancel request.',
        },
      });
    }
  },

  reconnectActiveExperiment: async () => {
    const job = get().activeJob;
    if (!job) return;
    clearActivePollTimer();
    try {
      const freshJob = await getExperimentStatus(job.jobId);
      const freshResults = await getExperimentResults(job.jobId);
      set({
        activeJob: freshJob,
        activeResults: freshResults,
        experimentConnectionLost: false,
        isScienceBusy:
          freshJob.status === 'queued' ||
          freshJob.status === 'running' ||
          freshJob.status === 'cancelling',
        statusBanner: {
          kind: freshJob.status === 'interrupted' ? 'warning' : 'info',
          message:
            freshJob.status === 'interrupted'
              ? `Recovered job ${freshJob.jobId}: service restarted and marked job interrupted (${freshResults.frames.length} partial frames retained).`
              : `Reconnected to job ${freshJob.jobId} (status: ${freshJob.status}).`,
        },
      });
    } catch (err) {
      set({
        experimentConnectionLost: true,
        statusBanner: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'Reconnect failed: science-api unreachable.',
        },
      });
    }
  },

  resetExperimentInputs: () =>
    set((state) => {
      // Section 9: Restores captured starting revision & preset defaults; never starts or cancels a run
      const preset =
        state.simulationPresets.find((p) => p.id === state.experimentConfig.modelPresetId) ??
        state.simulationPresets[0];
      const restoredMol = state.experimentStartingMolecule
        ? cloneMolecule(state.experimentStartingMolecule)
        : state.molecule;
      return {
        molecule: restoredMol,
        validation: validateChemistryProvisional(restoredMol),
        experimentConfig: {
          ...state.experimentConfig,
          initialStructureRevisionId: restoredMol.revisionId,
          temperature: {
            dimension: 'temperature',
            unit: 'K',
            value: preset?.defaultTemperatureK ?? 300,
          },
          timestep: {
            dimension: 'time',
            unit: 'fs',
            value: preset?.defaultTimestepFs ?? 1.0,
          },
          duration: {
            dimension: 'time',
            unit: 'ps',
            value: preset?.defaultDurationPs ?? 2.0,
          },
          reportIntervalSteps: 40,
          randomSeed: 42,
          minimizeBeforeRun: true,
        },
        statusBanner: {
          kind: 'info',
          message: 'Experiment inputs restored to captured starting revision and preset defaults (no job started or cancelled).',
        },
      };
    }),

  setPlaybackFrameIndex: (index) =>
    set((state) => {
      const count = state.activeResults?.frames.length ?? 0;
      if (count === 0) return { playbackFrameIndex: 0 };
      const clamped = Math.max(0, Math.min(count - 1, index));
      return { playbackFrameIndex: clamped };
    }),

  stepTrajectory: (delta) =>
    set((state) => {
      const count = state.activeResults?.frames.length ?? 0;
      if (count === 0) return {};
      const next = Math.max(0, Math.min(count - 1, state.playbackFrameIndex + delta));
      return { playbackFrameIndex: next, isPlayingTrajectory: false };
    }),

  toggleTrajectoryPlayback: () =>
    set((state) => {
      const count = state.activeResults?.frames.length ?? 0;
      if (count <= 1) return { isPlayingTrajectory: false };
      if (!state.isPlayingTrajectory && state.playbackFrameIndex >= count - 1) {
        return { isPlayingTrajectory: true, playbackFrameIndex: 0 };
      }
      return { isPlayingTrajectory: !state.isPlayingTrajectory };
    }),

  resetTrajectoryPlayback: () =>
    set({ playbackFrameIndex: 0, isPlayingTrajectory: false }),

  loadQuantumPresets: async () => {
    try {
      const presets = await listQuantumPresets();
      set((state) => {
        const selected =
          presets.find((p) => p.id === state.quantumConfig.modelPresetId) ?? presets[0];
        if (!selected) return { quantumPresets: presets };
        return {
          quantumPresets: presets,
          quantumConfig: {
            ...state.quantumConfig,
            modelPresetId: selected.id,
            modelPresetVersion: selected.version,
          },
        };
      });
    } catch {
      // Offline
    }
  },

  selectQuantumPreset: (presetId) =>
    set((state) => {
      const found = state.quantumPresets.find((p) => p.id === presetId);
      if (!found) return {};
      return {
        quantumConfig: {
          ...state.quantumConfig,
          modelPresetId: found.id,
          modelPresetVersion: found.version,
        },
      };
    }),

  setQuantumComputeFields: (computeFields) =>
    set((state) => ({
      quantumConfig: { ...state.quantumConfig, computeFields },
    })),

  setQuantumFieldOverlay: (quantumFieldOverlay) => set({ quantumFieldOverlay }),

  runQuantumCalculation: async () => {
    clearActiveQuantumPollTimer();
    const state = get();
    const submittedMolecule = cloneMolecule(state.molecule);
    const config: QuantumJobConfig = {
      ...state.quantumConfig,
      initialStructureRevisionId: submittedMolecule.revisionId,
    };
    const idempotencyKey =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `qc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    set({
      isScienceBusy: true,
      quantumConfig: config,
      activeQuantumResults: null,
    });

    const pollQc = async (jobId: string) => {
      try {
        const job = await getQuantumJobStatus(jobId);
        set({ activeQuantumJob: job });
        if (job.status === 'queued' || job.status === 'running' || job.status === 'cancelling') {
          activeQuantumPollTimer = setTimeout(() => {
            void pollQc(jobId);
          }, 220);
          return;
        }
        const results = await getQuantumResults(jobId);
        set({
          isScienceBusy: false,
          activeQuantumJob: job,
          activeQuantumResults: results,
          statusBanner: {
            kind: results.converged ? 'info' : 'warning',
            message:
              job.status === 'completed'
                ? `PySCF ${results.method}/${results.basisSet}: E = ${results.totalEnergyHartree?.toFixed(6) ?? '—'} Eh (${results.converged ? 'converged' : 'unconverged'}).`
                : `Quantum job ${job.status}: ${job.errorMessage ?? 'see panel.'}`,
          },
        });
      } catch (err) {
        set({
          isScienceBusy: false,
          statusBanner: {
            kind: 'error',
            message:
              err instanceof Error ? err.message : 'Lost connection while polling quantum job.',
          },
        });
      }
    };

    try {
      const job = await submitQuantumJob(submittedMolecule, config, idempotencyKey);
      set({
        activeQuantumJob: job,
        statusBanner: {
          kind: 'info',
          message: `Submitted PySCF job ${job.jobId} (revision ${submittedMolecule.revisionId}).`,
        },
      });
      await pollQc(job.jobId);
    } catch (err) {
      set({
        isScienceBusy: false,
        statusBanner: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'Quantum job submission failed.',
        },
      });
    }
  },

  cancelActiveQuantumJob: async () => {
    const job = get().activeQuantumJob;
    if (!job) return;
    try {
      const updated = await cancelQuantumJob(job.jobId);
      set({
        activeQuantumJob: updated,
        statusBanner: {
          kind: 'warning',
          message: `Cancellation requested for quantum job ${updated.jobId}.`,
        },
      });
    } catch (err) {
      set({
        statusBanner: {
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to cancel quantum job.',
        },
      });
    }
  },
}));
