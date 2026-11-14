import type { Atom, Bond, BondOrder, Molecule } from '@matterlab/domain';

export interface ApiErrorPayload {
  code: string;
  message: string;
  field_path?: string | null;
  retryable: boolean;
}

export interface ApiAtomDto {
  id: string;
  element: string;
  isotope: number | null;
  position_angstrom: [number, number, number];
  formal_charge: number;
  aromatic: boolean;
}

export interface ApiBondDto {
  id: string;
  atom_a: string;
  atom_b: string;
  order: 1 | 2 | 3 | 'aromatic';
}

export interface ApiMoleculeInputDto {
  id: string;
  name: string;
  revision_id: string;
  atoms: ApiAtomDto[];
  bonds: ApiBondDto[];
  net_charge: number;
  spin_multiplicity?: number | null;
}

export interface ApiDiagnosticDto {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  field_path: string | null;
  atom_ids: string[];
  bond_ids: string[];
}

export interface ApiMolecularDescriptorsDto {
  explicit_formula: string;
  canonical_smiles: string | null;
  inchikey: string | null;
  atom_count: number;
  heavy_atom_count: number;
  bond_count: number;
  molecular_mass_u: number;
  exact_mass_u: number;
  rotatable_bond_count: number;
  ring_count: number;
  aromatic_atom_count: number;
  hbd_count: number;
  hba_count: number;
  tpsa_angstrom2: number;
}

export interface ApiValidationResponseDto {
  structure_revision_id: string;
  status:
    | 'valid-rdkit'
    | 'incomplete-draft'
    | 'invalid-valence'
    | 'unsupported-chemistry'
    | 'integrity-error';
  ready_for_conformer_generation: boolean;
  ready_for_md: boolean;
  engine: string;
  engine_version: string;
  assumptions: string[];
  limitations: string[];
  descriptors: ApiMolecularDescriptorsDto | null;
  diagnostics: ApiDiagnosticDto[];
}

export interface ApiConformerResponseDto {
  source_revision_id: string;
  method: string;
  engine: string;
  engine_version: string;
  random_seed: number;
  energy_minimized: boolean;
  geometry_status: 'rdkit-conformer';
  distance_unit: 'angstrom';
  assumptions: string[];
  limitations: string[];
  positions_angstrom: Record<string, [number, number, number]>;
}

export interface ApiMolImportResponseDto {
  engine: string;
  engine_version: string;
  distance_unit: 'angstrom';
  molecule: ApiMoleculeInputDto;
  warnings: string[];
}

export interface ApiMolExportResponseDto {
  structure_revision_id: string;
  engine: string;
  engine_version: string;
  format: 'mol-v2000';
  mol_block: string;
  warnings: string[];
}

export interface ApiCapabilitiesResponseDto {
  api_version: string;
  adapters: Array<{
    adapter: string;
    available: boolean;
    version: string | null;
    supported_elements: string[];
    supported_operations: string[];
    limitations: string[];
  }>;
}

// --- Domain <-> API boundary mappers ---

export function toApiMoleculeDto(molecule: Molecule): ApiMoleculeInputDto {
  return {
    id: molecule.id,
    name: molecule.name,
    revision_id: molecule.revisionId,
    net_charge: molecule.netCharge,
    spin_multiplicity: molecule.spinMultiplicity ?? null,
    atoms: molecule.atoms.map((a) => ({
      id: a.id,
      element: a.element,
      isotope: a.isotope ?? null,
      position_angstrom: [...a.positionAngstrom] as [number, number, number],
      formal_charge: a.formalCharge,
      aromatic: a.aromatic,
    })),
    bonds: molecule.bonds.map((b) => ({
      id: b.id,
      atom_a: b.atomA,
      atom_b: b.atomB,
      order: b.order,
    })),
  };
}

export function fromApiMoleculeDto(dto: ApiMoleculeInputDto): Molecule {
  const atoms: Atom[] = dto.atoms.map((a) => {
    const atom: Atom = {
      id: a.id,
      element: a.element,
      positionAngstrom: [...a.position_angstrom] as [number, number, number],
      formalCharge: a.formal_charge,
      aromatic: a.aromatic,
    };
    if (a.isotope !== null) {
      atom.isotope = a.isotope;
    }
    return atom;
  });

  const bonds: Bond[] = dto.bonds.map((b) => ({
    id: b.id,
    atomA: b.atom_a,
    atomB: b.atom_b,
    order: b.order as BondOrder,
  }));

  const mol: Molecule = {
    id: dto.id,
    name: dto.name,
    revisionId: dto.revision_id,
    atoms,
    bonds,
    netCharge: dto.net_charge,
    provenance: {
      sourceKind: 'imported-sdf',
      summary: 'Imported from SDF/MOL via RDKit science service (coordinates in Å).',
      geometryStatus: 'user-placed',
    },
  };
  if (dto.spin_multiplicity !== undefined && dto.spin_multiplicity !== null) {
    mol.spinMultiplicity = dto.spin_multiplicity;
  }
  return mol;
}

// --- CamelCase Domain Result Models ---

export interface RdkitValidationResult {
  structureRevisionId: string;
  status: ApiValidationResponseDto['status'];
  readyForConformerGeneration: boolean;
  readyForMd: boolean;
  engine: string;
  engineVersion: string;
  assumptions: string[];
  limitations: string[];
  descriptors: {
    explicitFormula: string;
    canonicalSmiles: string | null;
    inchikey: string | null;
    atomCount: number;
    heavyAtomCount: number;
    bondCount: number;
    molecularMassU: number;
    exactMassU: number;
    rotatableBondCount: number;
    ringCount: number;
    aromaticAtomCount: number;
    hbdCount: number;
    hbaCount: number;
    tpsaAngstrom2: number;
  } | null;
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    fieldPath: string | null;
    atomIds: string[];
    bondIds: string[];
  }>;
}

export interface RdkitConformerResult {
  sourceRevisionId: string;
  method: string;
  engine: string;
  engineVersion: string;
  randomSeed: number;
  energyMinimized: boolean;
  geometryStatus: 'rdkit-conformer';
  distanceUnit: 'angstrom';
  assumptions: string[];
  limitations: string[];
  positionsAngstrom: Record<string, [number, number, number]>;
}
