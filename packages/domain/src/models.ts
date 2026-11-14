import { getElementBySymbol } from './elements.js';

export type BondOrder = 1 | 2 | 3 | 'aromatic';

export type RepresentationMode = 'ball-and-stick' | 'space-filling';

export type ColorPaletteMode = 'cpk' | 'colorblind';

export interface Atom {
  id: string;
  element: string;
  isotope?: number;
  positionAngstrom: [number, number, number];
  formalCharge: number;
  aromatic: boolean;
}

export interface Bond {
  id: string;
  atomA: string;
  atomB: string;
  order: BondOrder;
}

export interface StructureProvenance {
  sourceKind: 'user-constructed' | 'curated-illustrative-reference' | 'imported-sdf';
  summary: string;
  geometryStatus: 'user-placed' | 'illustrative-reference' | 'rdkit-conformer';
}

export interface Molecule {
  id: string;
  name: string;
  revisionId: string;
  atoms: Atom[];
  bonds: Bond[];
  netCharge: number;
  spinMultiplicity?: number;
  provenance: StructureProvenance;
}

export interface SimulationModel {
  id: string;
  name: string;
  category:
    | 'molecular-mechanics'
    | 'quantum-chemistry'
    | 'reactive-md'
    | 'particle-transport'
    | 'educational';
  engine: string;
  engineVersion?: string;
  assumptions: string[];
  limitations: string[];
}

export const STATIC_EDITOR_MODEL: SimulationModel = {
  id: 'matterlab-static-structure-provisional',
  name: 'Static Molecular Structure (Provisional Client Checks)',
  category: 'educational',
  engine: 'MatterLab Local Provisional Validator',
  engineVersion: '0.1.0-prototype',
  assumptions: [
    'Explicit hydrogen atoms are represented directly; implicit hydrogens are never added silently.',
    'Drawn bonds are chemical connectivity representations, not rigid mechanical rods.',
    'Ball-and-stick and van der Waals radii are visual conventions for readability, not physical quantum boundaries.',
  ],
  limitations: [
    'No live physics or quantum-chemistry engine is running in this workspace.',
    'Provisional valence checks are heuristic prototype checks only and do not replace RDKit validation.',
    'Passing valence checks does not imply physical stability, minimum energy, or force-field parameter coverage.',
  ],
};

export type ValidationStatus =
  | 'valid-provisional'
  | 'incomplete-draft'
  | 'invalid-valence'
  | 'unsupported-chemistry'
  | 'integrity-error';

export interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  atomIds?: string[];
  bondIds?: string[];
}

export interface StructureValidationReport {
  status: ValidationStatus;
  validatorKind: 'provisional-client-v1';
  readyForEngineSubmission: boolean;
  diagnostics: ValidationDiagnostic[];
}

export function createEmptyMolecule(
  name = 'Untitled Structure',
  id = 'mol-1',
  revisionId = 'rev-1',
): Molecule {
  return {
    id,
    name,
    revisionId,
    atoms: [],
    bonds: [],
    netCharge: 0,
    provenance: {
      sourceKind: 'user-constructed',
      summary: 'Constructed interactively in MatterLab structure editor.',
      geometryStatus: 'user-placed',
    },
  };
}

export function computeFormula(molecule: Molecule): string {
  if (molecule.atoms.length === 0) {
    return 'Empty';
  }

  const counts = new Map<string, number>();
  for (const atom of molecule.atoms) {
    counts.set(atom.element, (counts.get(atom.element) ?? 0) + 1);
  }

  const orderedSymbols: string[] = [];
  if (counts.has('C')) {
    orderedSymbols.push('C');
    if (counts.has('H')) {
      orderedSymbols.push('H');
    }
    const rest = [...counts.keys()]
      .filter((s) => s !== 'C' && s !== 'H')
      .sort((a, b) => a.localeCompare(b));
    orderedSymbols.push(...rest);
  } else {
    orderedSymbols.push(...[...counts.keys()].sort((a, b) => a.localeCompare(b)));
  }

  let formula = orderedSymbols
    .map((symbol) => {
      const count = counts.get(symbol) ?? 0;
      return count > 1 ? `${symbol}${count}` : symbol;
    })
    .join('');

  if (molecule.netCharge !== 0) {
    const absCharge = Math.abs(molecule.netCharge);
    const sign = molecule.netCharge > 0 ? '+' : '-';
    formula += absCharge === 1 ? sign : `${absCharge}${sign}`;
  }

  return formula;
}

export function computeMolecularMassU(molecule: Molecule): number {
  let total = 0;
  for (const atom of molecule.atoms) {
    const el = getElementBySymbol(atom.element);
    if (!el) continue;
    if (atom.isotope !== undefined) {
      const iso = el.isotopes.find((i) => i.massNumber === atom.isotope);
      total += iso ? iso.atomicMassU : el.standardAtomicWeightU;
    } else {
      total += el.standardAtomicWeightU;
    }
  }
  return total;
}

export function computeBondLengthAngstrom(atomA: Atom, atomB: Atom): number {
  const dx = atomB.positionAngstrom[0] - atomA.positionAngstrom[0];
  const dy = atomB.positionAngstrom[1] - atomA.positionAngstrom[1];
  const dz = atomB.positionAngstrom[2] - atomA.positionAngstrom[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function computeBondAngleDegrees(
  center: Atom,
  neighborA: Atom,
  neighborB: Atom,
): number | null {
  const vax = neighborA.positionAngstrom[0] - center.positionAngstrom[0];
  const vay = neighborA.positionAngstrom[1] - center.positionAngstrom[1];
  const vaz = neighborA.positionAngstrom[2] - center.positionAngstrom[2];

  const vbx = neighborB.positionAngstrom[0] - center.positionAngstrom[0];
  const vby = neighborB.positionAngstrom[1] - center.positionAngstrom[1];
  const vbz = neighborB.positionAngstrom[2] - center.positionAngstrom[2];

  const magA = Math.sqrt(vax * vax + vay * vay + vaz * vaz);
  const magB = Math.sqrt(vbx * vbx + vby * vby + vbz * vbz);
  if (magA < 1e-9 || magB < 1e-9) {
    return null;
  }

  const dot = vax * vbx + vay * vby + vaz * vbz;
  const cosTheta = Math.max(-1, Math.min(1, dot / (magA * magB)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

export function bondPairKey(atomA: string, atomB: string): string {
  return atomA < atomB ? `${atomA}::${atomB}` : `${atomB}::${atomA}`;
}

export function validateStructureIntegrity(molecule: Molecule): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const atomIds = new Set<string>();

  for (const atom of molecule.atoms) {
    if (!atom.id) {
      diagnostics.push({
        severity: 'error',
        code: 'EMPTY_ATOM_ID',
        message: 'Atom is missing an id.',
      });
      continue;
    }
    if (atomIds.has(atom.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'DUPLICATE_ATOM_ID',
        message: `Duplicate atom id "${atom.id}".`,
        atomIds: [atom.id],
      });
    }
    atomIds.add(atom.id);

    const [x, y, z] = atom.positionAngstrom;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      diagnostics.push({
        severity: 'error',
        code: 'NON_FINITE_COORDINATE',
        message: `Atom "${atom.id}" has non-finite coordinates.`,
        atomIds: [atom.id],
      });
    }

    if (!Number.isInteger(atom.formalCharge)) {
      diagnostics.push({
        severity: 'error',
        code: 'NON_INTEGER_FORMAL_CHARGE',
        message: `Atom "${atom.id}" formal charge must be an integer.`,
        atomIds: [atom.id],
      });
    }

    const el = getElementBySymbol(atom.element);
    if (el && atom.isotope !== undefined) {
      const validIso = el.isotopes.some((i) => i.massNumber === atom.isotope);
      if (!validIso) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_ISOTOPE',
          message: `Isotope ${atom.isotope} is not in reference data for ${atom.element}.`,
          atomIds: [atom.id],
        });
      }
    }
  }

  const bondIds = new Set<string>();
  const seenPairs = new Set<string>();

  for (const bond of molecule.bonds) {
    if (!bond.id) {
      diagnostics.push({
        severity: 'error',
        code: 'EMPTY_BOND_ID',
        message: 'Bond is missing an id.',
      });
    } else if (bondIds.has(bond.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'DUPLICATE_BOND_ID',
        message: `Duplicate bond id "${bond.id}".`,
        bondIds: [bond.id],
      });
    }
    bondIds.add(bond.id);

    if (bond.atomA === bond.atomB) {
      diagnostics.push({
        severity: 'error',
        code: 'SELF_BOND',
        message: `Bond "${bond.id}" cannot connect atom "${bond.atomA}" to itself.`,
        atomIds: [bond.atomA],
        bondIds: [bond.id],
      });
    }

    if (!atomIds.has(bond.atomA) || !atomIds.has(bond.atomB)) {
      diagnostics.push({
        severity: 'error',
        code: 'DANGLING_BOND_REF',
        message: `Bond "${bond.id}" references missing atom (${bond.atomA} -> ${bond.atomB}).`,
        bondIds: [bond.id],
      });
    }

    const pairKey = bondPairKey(bond.atomA, bond.atomB);
    if (seenPairs.has(pairKey)) {
      diagnostics.push({
        severity: 'error',
        code: 'DUPLICATE_BOND_PAIR',
        message: `Duplicate bond between atoms "${bond.atomA}" and "${bond.atomB}".`,
        atomIds: [bond.atomA, bond.atomB],
        bondIds: [bond.id],
      });
    }
    seenPairs.add(pairKey);
  }

  if (!Number.isInteger(molecule.netCharge)) {
    diagnostics.push({
      severity: 'error',
      code: 'NON_INTEGER_NET_CHARGE',
      message: 'Molecular net charge must be an integer.',
    });
  } else {
    const sumFormal = molecule.atoms.reduce((acc, a) => acc + a.formalCharge, 0);
    if (molecule.netCharge !== sumFormal) {
      diagnostics.push({
        severity: 'error',
        code: 'NET_CHARGE_MISMATCH',
        message: `Molecular net charge (${molecule.netCharge}) does not equal the sum of atom formal charges (${sumFormal}).`,
      });
    }
  }

  return diagnostics;
}

function bondOrderNumericContribution(order: BondOrder): number {
  return order === 'aromatic' ? 1.5 : order;
}

export function validateChemistryProvisional(
  molecule: Molecule,
): StructureValidationReport {
  const diagnostics: ValidationDiagnostic[] = [];
  const integrityErrors = validateStructureIntegrity(molecule);
  diagnostics.push(...integrityErrors);

  if (integrityErrors.length > 0) {
    return {
      status: 'integrity-error',
      validatorKind: 'provisional-client-v1',
      readyForEngineSubmission: false,
      diagnostics,
    };
  }

  if (molecule.atoms.length === 0) {
    diagnostics.push({
      severity: 'info',
      code: 'EMPTY_STRUCTURE',
      message: 'No atoms in scene yet. Add atoms from the element palette or load an example.',
    });
    return {
      status: 'incomplete-draft',
      validatorKind: 'provisional-client-v1',
      readyForEngineSubmission: false,
      diagnostics,
    };
  }

  let hasUnsupported = false;
  for (const atom of molecule.atoms) {
    if (!getElementBySymbol(atom.element)) {
      hasUnsupported = true;
      diagnostics.push({
        severity: 'error',
        code: 'UNSUPPORTED_ELEMENT',
        message: `Element "${atom.element}" is outside the approved MVP chemistry baseline (H, C, N, O, F, P, S, Cl, Br, I).`,
        atomIds: [atom.id],
      });
    }
  }

  if (hasUnsupported) {
    return {
      status: 'unsupported-chemistry',
      validatorKind: 'provisional-client-v1',
      readyForEngineSubmission: false,
      diagnostics,
    };
  }

  const atomById = new Map(molecule.atoms.map((a) => [a.id, a]));
  const bondOrderSum = new Map<string, number>();
  const hasAromaticBond = new Map<string, boolean>();
  for (const atom of molecule.atoms) {
    bondOrderSum.set(atom.id, 0);
    hasAromaticBond.set(atom.id, false);
  }

  for (const bond of molecule.bonds) {
    const contrib = bondOrderNumericContribution(bond.order);
    bondOrderSum.set(bond.atomA, (bondOrderSum.get(bond.atomA) ?? 0) + contrib);
    bondOrderSum.set(bond.atomB, (bondOrderSum.get(bond.atomB) ?? 0) + contrib);
    if (bond.order === 'aromatic') {
      hasAromaticBond.set(bond.atomA, true);
      hasAromaticBond.set(bond.atomB, true);
    }

    const a = atomById.get(bond.atomA);
    const b = atomById.get(bond.atomB);
    if (a && b) {
      const dist = computeBondLengthAngstrom(a, b);
      if (dist < 0.35) {
        diagnostics.push({
          severity: 'warning',
          code: 'OVERLAPPING_BONDED_ATOMS',
          message: `Atoms ${a.element}(${a.id}) and ${b.element}(${b.id}) are very close (${dist.toFixed(2)} Å).`,
          atomIds: [a.id, b.id],
          bondIds: [bond.id],
        });
      } else if (dist > 2.6) {
        diagnostics.push({
          severity: 'warning',
          code: 'STRETCHED_BOND',
          message: `Bond ${a.element}–${b.element} is unusually long (${dist.toFixed(2)} Å).`,
          atomIds: [a.id, b.id],
          bondIds: [bond.id],
        });
      }
    }
  }

  let hasInvalidValence = false;
  let hasIncompleteDraft = false;

  for (const atom of molecule.atoms) {
    const el = getElementBySymbol(atom.element)!;
    const sum = bondOrderSum.get(atom.id) ?? 0;

    if (atom.aromatic !== (hasAromaticBond.get(atom.id) ?? false)) {
      hasInvalidValence = true;
      diagnostics.push({
        severity: 'error',
        code: 'AROMATIC_CONSISTENCY',
        message: `Atom ${atom.element}(${atom.id}) aromatic flag (${atom.aromatic}) does not match its attached aromatic bonds.`,
        atomIds: [atom.id],
      });
    }

    // Provisional neutral + simple formal charge check
    const expectedValences = el.commonNeutralValences.map((v) =>
      Math.max(0, v + (atom.element === 'H' ? -Math.abs(atom.formalCharge) : atom.formalCharge * (atom.element === 'C' ? -1 : 1))),
    );
    const maxValence = Math.max(...expectedValences);
    const matchesExact = expectedValences.some((v) => Math.abs(sum - v) < 1e-6);

    if (sum > maxValence + 1e-6) {
      hasInvalidValence = true;
      diagnostics.push({
        severity: 'error',
        code: 'VALENCE_EXCEEDED',
        message: `${atom.element}(${atom.id}) has bond-order sum ${sum}, exceeding provisional valence (${expectedValences.join(' or ')}).`,
        atomIds: [atom.id],
      });
    } else if (!matchesExact) {
      hasIncompleteDraft = true;
      diagnostics.push({
        severity: 'warning',
        code: 'INCOMPLETE_VALENCE',
        message: `${atom.element}(${atom.id}) has bond-order sum ${sum} (expected ${expectedValences.join(' or ')} with explicit hydrogens). Draft remains editable.`,
        atomIds: [atom.id],
      });
    }
  }

  const status: ValidationStatus = hasInvalidValence
    ? 'invalid-valence'
    : hasIncompleteDraft
      ? 'incomplete-draft'
      : 'valid-provisional';

  if (status === 'valid-provisional') {
    diagnostics.push({
      severity: 'info',
      code: 'PROVISIONAL_PASS',
      message:
        'Passes provisional client valence checks. Authoritative chemical validation requires the RDKit science service (Milestone 3).',
    });
  }

  return {
    status,
    validatorKind: 'provisional-client-v1',
    readyForEngineSubmission: false,
    diagnostics,
  };
}
