import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_MOLECULES,
  PROJECT_SCHEMA_VERSION,
  ProjectSerializationError,
  UnitValidationError,
  cloneMolecule,
  computeBondAngleDegrees,
  computeBondLengthAngstrom,
  computeFormula,
  convertQuantity,
  parseProject,
  serializeProject,
  validateChemistryProvisional,
} from '../src/index.js';

describe('units and quantities', () => {
  it('converts distance and time accurately', () => {
    const nm = convertQuantity(
      { dimension: 'distance', unit: 'angstrom', value: 1.54 },
      'nm',
    );
    expect(nm.unit).toBe('nm');
    expect(nm.value).toBeCloseTo(0.154, 10);

    const ps = convertQuantity({ dimension: 'time', unit: 'fs', value: 250 }, 'ps');
    expect(ps.unit).toBe('ps');
    expect(ps.value).toBeCloseTo(0.25, 10);
  });

  it('converts whole-system eV to molar whole-system kJ/mol and rejects incompatible dimensions', () => {
    const kJ = convertQuantity(
      { dimension: 'energy', unit: 'eV', basis: 'whole-system', value: 1 },
      'kJ/mol',
    );
    expect(kJ.dimension).toBe('energy');
    if (kJ.dimension === 'energy') {
      expect(kJ.basis).toBe('mole-of-systems');
      expect(kJ.value).toBeCloseTo(96.485332, 4);
    }

    expect(() =>
      convertQuantity({ dimension: 'distance', unit: 'angstrom', value: 1 }, 'ps'),
    ).toThrow(UnitValidationError);

    expect(() =>
      convertQuantity({ dimension: 'distance', unit: 'angstrom', value: Number.NaN }, 'nm'),
    ).toThrow(UnitValidationError);
  });
});

describe('molecule formulas, geometry, and provisional validation', () => {
  it('computes explicit formulas for curated examples without adding implicit hydrogens', () => {
    const byId = new Map(EXAMPLE_MOLECULES.map((e) => [e.id, e.molecule]));
    expect(computeFormula(byId.get('water')!)).toBe('H2O');
    expect(computeFormula(byId.get('carbon-dioxide')!)).toBe('CO2');
    expect(computeFormula(byId.get('methane')!)).toBe('CH4');
    expect(computeFormula(byId.get('benzene')!)).toBe('C6H6');

    const bareCarbon = cloneMolecule(byId.get('methane')!);
    bareCarbon.atoms = [bareCarbon.atoms[0]!];
    bareCarbon.bonds = [];
    expect(computeFormula(bareCarbon)).toBe('C');
  });

  it('computes water bond length and H-O-H bond angle', () => {
    const water = EXAMPLE_MOLECULES.find((e) => e.id === 'water')!.molecule;
    const o = water.atoms[0]!;
    const h1 = water.atoms[1]!;
    const h2 = water.atoms[2]!;
    expect(computeBondLengthAngstrom(o, h1)).toBeCloseTo(0.957, 2);
    expect(computeBondAngleDegrees(o, h1, h2)!).toBeCloseTo(104.5, 0);
  });

  it('validates all four curated examples as valid-provisional while keeping engine submission false', () => {
    for (const entry of EXAMPLE_MOLECULES) {
      const report = validateChemistryProvisional(entry.molecule);
      expect(report.status).toBe('valid-provisional');
      expect(report.validatorKind).toBe('provisional-client-v1');
      expect(report.readyForEngineSubmission).toBe(false);
    }
  });

  it('distinguishes incomplete drafts, invalid valence, and unsupported elements', () => {
    const water = cloneMolecule(EXAMPLE_MOLECULES.find((e) => e.id === 'water')!.molecule);
    water.bonds = water.bonds.slice(0, 1);
    expect(validateChemistryProvisional(water).status).toBe('incomplete-draft');

    const overvalent = cloneMolecule(
      EXAMPLE_MOLECULES.find((e) => e.id === 'methane')!.molecule,
    );
    overvalent.atoms.push({
      id: 'H5',
      element: 'H',
      positionAngstrom: [0, 0, 1.09],
      formalCharge: 0,
      aromatic: false,
    });
    overvalent.bonds.push({ id: 'b5', atomA: 'C1', atomB: 'H5', order: 1 });
    expect(validateChemistryProvisional(overvalent).status).toBe('invalid-valence');

    const unsupported = cloneMolecule(water);
    unsupported.atoms[0]!.element = 'Fe';
    expect(validateChemistryProvisional(unsupported).status).toBe('unsupported-chemistry');
  });
});

describe('project JSON persistence', () => {
  it('round-trips benzene preserving coordinates, aromaticity, isotopes, charges, and units', () => {
    const benzene = cloneMolecule(
      EXAMPLE_MOLECULES.find((e) => e.id === 'benzene')!.molecule,
    );
    benzene.atoms[0]!.isotope = 13;
    benzene.atoms[0]!.positionAngstrom = [1.397123456, 0.000001234, -0.000000789];

    const json = serializeProject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectName: 'Benzene Test',
      savedAtIso: '2026-11-14T20:00:00.000Z',
      units: { distance: 'angstrom', charge: 'e', mass: 'u' },
      viewSettings: {
        representation: 'ball-and-stick',
        colorPalette: 'cpk',
        showLabels: true,
        showBonds: true,
        showAxes: true,
        showGrid: true,
      },
      molecule: benzene,
    });

    const loaded = parseProject(json);
    expect(loaded.molecule.atoms[0]!.isotope).toBe(13);
    expect(loaded.molecule.atoms[0]!.aromatic).toBe(true);
    expect(loaded.molecule.atoms[0]!.positionAngstrom[0]).toBe(1.397123456);
    expect(loaded.molecule.bonds.some((b) => b.order === 'aromatic')).toBe(true);
  });

  it('rejects unsupported schema versions and dangling bond references without silent repair', () => {
    expect(() =>
      parseProject(JSON.stringify({ schemaVersion: 'matterlab.project.v99' })),
    ).toThrow(ProjectSerializationError);

    const water = cloneMolecule(EXAMPLE_MOLECULES[0]!.molecule);
    water.bonds.push({ id: 'bad', atomA: 'O1', atomB: 'NO_SUCH_ATOM', order: 1 });
    const rawCorrupt = JSON.stringify({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      projectName: 'Corrupt',
      savedAtIso: '2026-11-14T20:00:00.000Z',
      units: { distance: 'angstrom', charge: 'e', mass: 'u' },
      viewSettings: {
        representation: 'ball-and-stick',
        colorPalette: 'cpk',
        showLabels: true,
        showBonds: true,
        showAxes: true,
        showGrid: true,
      },
      molecule: water,
    });

    expect(() => parseProject(rawCorrupt)).toThrow(ProjectSerializationError);
  });
});
