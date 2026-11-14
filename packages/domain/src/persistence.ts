import {
  type BondOrder,
  type ColorPaletteMode,
  type Molecule,
  type RepresentationMode,
  validateStructureIntegrity,
} from './models.js';

export const PROJECT_SCHEMA_VERSION = 'matterlab.project.v1' as const;

export interface ProjectUnitsConfig {
  distance: 'angstrom';
  charge: 'e';
  mass: 'u';
}

export interface ProjectViewSettings {
  representation: RepresentationMode;
  colorPalette: ColorPaletteMode;
  showLabels: boolean;
  showBonds: boolean;
  showAxes: boolean;
  showGrid: boolean;
}

export interface ProjectFileV1 {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projectName: string;
  savedAtIso: string;
  units: ProjectUnitsConfig;
  viewSettings: ProjectViewSettings;
  molecule: Molecule;
}

export class ProjectSerializationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProjectSerializationError';
    this.code = code;
  }
}

export function serializeProject(project: ProjectFileV1): string {
  const integrityErrors = validateStructureIntegrity(project.molecule);
  if (integrityErrors.length > 0) {
    throw new ProjectSerializationError(
      'CORRUPT_PROJECT_STRUCTURE',
      `Cannot serialize project with structural integrity errors: ${integrityErrors[0]?.message}`,
    );
  }
  return JSON.stringify(project, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidBondOrder(order: unknown): order is BondOrder {
  return order === 1 || order === 2 || order === 3 || order === 'aromatic';
}

export function parseProject(jsonText: string): ProjectFileV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    throw new ProjectSerializationError(
      'INVALID_JSON',
      `Project file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!isRecord(raw)) {
    throw new ProjectSerializationError(
      'INVALID_ENVELOPE',
      'Project file root must be a JSON object.',
    );
  }

  if (raw.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new ProjectSerializationError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Unsupported project schemaVersion "${String(raw.schemaVersion)}". Expected "${PROJECT_SCHEMA_VERSION}".`,
    );
  }

  if (typeof raw.projectName !== 'string' || !raw.projectName.trim()) {
    throw new ProjectSerializationError(
      'INVALID_PROJECT_NAME',
      'Project file must include a non-empty projectName.',
    );
  }

  if (!isRecord(raw.units) || raw.units.distance !== 'angstrom' || raw.units.charge !== 'e' || raw.units.mass !== 'u') {
    throw new ProjectSerializationError(
      'INVALID_UNITS',
      'Project file units must declare distance="angstrom", charge="e", mass="u".',
    );
  }

  if (!isRecord(raw.viewSettings)) {
    throw new ProjectSerializationError(
      'INVALID_VIEW_SETTINGS',
      'Project file is missing viewSettings.',
    );
  }

  const vs = raw.viewSettings;
  if (
    (vs.representation !== 'ball-and-stick' && vs.representation !== 'space-filling') ||
    (vs.colorPalette !== 'cpk' && vs.colorPalette !== 'colorblind') ||
    typeof vs.showLabels !== 'boolean' ||
    typeof vs.showBonds !== 'boolean' ||
    typeof vs.showAxes !== 'boolean' ||
    typeof vs.showGrid !== 'boolean'
  ) {
    throw new ProjectSerializationError(
      'INVALID_VIEW_SETTINGS',
      'Project viewSettings contain unsupported or missing fields.',
    );
  }

  if (!isRecord(raw.molecule)) {
    throw new ProjectSerializationError(
      'MISSING_MOLECULE',
      'Project file is missing molecule object.',
    );
  }

  const mol = raw.molecule;
  if (
    typeof mol.id !== 'string' ||
    typeof mol.name !== 'string' ||
    typeof mol.revisionId !== 'string' ||
    typeof mol.netCharge !== 'number' ||
    !Array.isArray(mol.atoms) ||
    !Array.isArray(mol.bonds) ||
    !isRecord(mol.provenance)
  ) {
    throw new ProjectSerializationError(
      'INVALID_MOLECULE_SHAPE',
      'Project molecule object is malformed or missing required fields.',
    );
  }

  for (const atom of mol.atoms) {
    if (
      !isRecord(atom) ||
      typeof atom.id !== 'string' ||
      typeof atom.element !== 'string' ||
      !Array.isArray(atom.positionAngstrom) ||
      atom.positionAngstrom.length !== 3 ||
      typeof atom.formalCharge !== 'number' ||
      typeof atom.aromatic !== 'boolean'
    ) {
      throw new ProjectSerializationError(
        'INVALID_ATOM',
        'One or more atom records are malformed.',
      );
    }
    if (atom.isotope !== undefined && !Number.isInteger(atom.isotope)) {
      throw new ProjectSerializationError(
        'INVALID_ATOM_ISOTOPE',
        `Atom "${atom.id}" has a non-integer isotope mass number.`,
      );
    }
  }

  for (const bond of mol.bonds) {
    if (
      !isRecord(bond) ||
      typeof bond.id !== 'string' ||
      typeof bond.atomA !== 'string' ||
      typeof bond.atomB !== 'string' ||
      !isValidBondOrder(bond.order)
    ) {
      throw new ProjectSerializationError(
        'INVALID_BOND',
        'One or more bond records are malformed or have an unsupported bond order.',
      );
    }
  }

  const parsedMolecule = mol as unknown as Molecule;
  const integrityErrors = validateStructureIntegrity(parsedMolecule);
  if (integrityErrors.length > 0) {
    throw new ProjectSerializationError(
      integrityErrors[0]!.code,
      `Project molecule failed integrity check: ${integrityErrors[0]!.message}`,
    );
  }

  return raw as unknown as ProjectFileV1;
}
