import type { Molecule } from './models.js';

export interface ExampleMoleculeEntry {
  id: string;
  title: string;
  formulaLabel: string;
  description: string;
  molecule: Molecule;
}

export const EXAMPLE_MOLECULES: readonly ExampleMoleculeEntry[] = [
  {
    id: 'water',
    title: 'Water',
    formulaLabel: 'H₂O',
    description:
      'Bent triatomic molecule (~104.5° H–O–H angle, ~0.958 Å O–H bond length). Curated reference geometry.',
    molecule: {
      id: 'example-water',
      name: 'Water (H2O)',
      revisionId: 'example-water-r1',
      netCharge: 0,
      provenance: {
        sourceKind: 'curated-illustrative-reference',
        summary: 'Curated reference geometry (bent, H-O-H ≈ 104.45°). Not computed by live engine.',
        geometryStatus: 'illustrative-reference',
      },
      atoms: [
        {
          id: 'O1',
          element: 'O',
          positionAngstrom: [0, 0, 0],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'H1',
          element: 'H',
          positionAngstrom: [0.757, 0.586, 0],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'H2',
          element: 'H',
          positionAngstrom: [-0.757, 0.586, 0],
          formalCharge: 0,
          aromatic: false,
        },
      ],
      bonds: [
        { id: 'b1', atomA: 'O1', atomB: 'H1', order: 1 },
        { id: 'b2', atomA: 'O1', atomB: 'H2', order: 1 },
      ],
    },
  },
  {
    id: 'carbon-dioxide',
    title: 'Carbon Dioxide',
    formulaLabel: 'CO₂',
    description:
      'Linear molecule (180° O=C=O, ~1.160 Å C=O double bonds). Curated reference geometry.',
    molecule: {
      id: 'example-co2',
      name: 'Carbon Dioxide (CO2)',
      revisionId: 'example-co2-r1',
      netCharge: 0,
      provenance: {
        sourceKind: 'curated-illustrative-reference',
        summary: 'Curated linear reference geometry (C=O = 1.160 Å). Not computed by live engine.',
        geometryStatus: 'illustrative-reference',
      },
      atoms: [
        {
          id: 'C1',
          element: 'C',
          positionAngstrom: [0, 0, 0],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'O1',
          element: 'O',
          positionAngstrom: [-1.16, 0, 0],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'O2',
          element: 'O',
          positionAngstrom: [1.16, 0, 0],
          formalCharge: 0,
          aromatic: false,
        },
      ],
      bonds: [
        { id: 'b1', atomA: 'C1', atomB: 'O1', order: 2 },
        { id: 'b2', atomA: 'C1', atomB: 'O2', order: 2 },
      ],
    },
  },
  {
    id: 'methane',
    title: 'Methane',
    formulaLabel: 'CH₄',
    description:
      'Tetrahedral hydrocarbon (~109.5° H–C–H angle, ~1.089 Å C–H bonds). Curated reference geometry.',
    molecule: {
      id: 'example-methane',
      name: 'Methane (CH4)',
      revisionId: 'example-methane-r1',
      netCharge: 0,
      provenance: {
        sourceKind: 'curated-illustrative-reference',
        summary: 'Curated tetrahedral reference geometry (C-H = 1.089 Å). Not computed by live engine.',
        geometryStatus: 'illustrative-reference',
      },
      atoms: [
        {
          id: 'C1',
          element: 'C',
          positionAngstrom: [0, 0, 0],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'H1',
          element: 'H',
          positionAngstrom: [0.629, 0.629, 0.629],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'H2',
          element: 'H',
          positionAngstrom: [-0.629, -0.629, 0.629],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'H3',
          element: 'H',
          positionAngstrom: [-0.629, 0.629, -0.629],
          formalCharge: 0,
          aromatic: false,
        },
        {
          id: 'H4',
          element: 'H',
          positionAngstrom: [0.629, -0.629, -0.629],
          formalCharge: 0,
          aromatic: false,
        },
      ],
      bonds: [
        { id: 'b1', atomA: 'C1', atomB: 'H1', order: 1 },
        { id: 'b2', atomA: 'C1', atomB: 'H2', order: 1 },
        { id: 'b3', atomA: 'C1', atomB: 'H3', order: 1 },
        { id: 'b4', atomA: 'C1', atomB: 'H4', order: 1 },
      ],
    },
  },
  {
    id: 'benzene',
    title: 'Benzene',
    formulaLabel: 'C₆H₆',
    description:
      'Planar aromatic ring preserving explicit aromatic atom & bond properties (1.397 Å C–C, 1.084 Å C–H).',
    molecule: (() => {
      const rCC = 1.397;
      const rCH = 1.397 + 1.084;
      const atoms: Molecule['atoms'] = [];
      const bonds: Molecule['bonds'] = [];
      for (let i = 0; i < 6; i++) {
        const theta = (i * Math.PI) / 3;
        const cId = `C${i + 1}`;
        const hId = `H${i + 1}`;
        atoms.push({
          id: cId,
          element: 'C',
          positionAngstrom: [
            Number((rCC * Math.cos(theta)).toFixed(6)),
            Number((rCC * Math.sin(theta)).toFixed(6)),
            0,
          ],
          formalCharge: 0,
          aromatic: true,
        });
        atoms.push({
          id: hId,
          element: 'H',
          positionAngstrom: [
            Number((rCH * Math.cos(theta)).toFixed(6)),
            Number((rCH * Math.sin(theta)).toFixed(6)),
            0,
          ],
          formalCharge: 0,
          aromatic: false,
        });
      }
      for (let i = 0; i < 6; i++) {
        const next = (i + 1) % 6;
        bonds.push({
          id: `bc${i + 1}`,
          atomA: `C${i + 1}`,
          atomB: `C${next + 1}`,
          order: 'aromatic',
        });
        bonds.push({
          id: `bh${i + 1}`,
          atomA: `C${i + 1}`,
          atomB: `H${i + 1}`,
          order: 1,
        });
      }
      return {
        id: 'example-benzene',
        name: 'Benzene (C6H6)',
        revisionId: 'example-benzene-r1',
        netCharge: 0,
        provenance: {
          sourceKind: 'curated-illustrative-reference',
          summary: 'Curated planar aromatic ring reference geometry. Preserves aromaticity.',
          geometryStatus: 'illustrative-reference',
        },
        atoms,
        bonds,
      };
    })(),
  },
  {
    id: 'water-cluster-8',
    title: 'Water Cluster (8 H₂O)',
    formulaLabel: 'H₁₆O₈',
    description:
      'Eight-molecule TIP3P water cluster (24 atoms) for classical OpenMM molecular dynamics.',
    molecule: (() => {
      const atoms: Molecule['atoms'] = [];
      const bonds: Molecule['bonds'] = [];
      let idx = 1;
      for (let ix = 0; ix < 2; ix++) {
        for (let iy = 0; iy < 2; iy++) {
          for (let iz = 0; iz < 2; iz++) {
            const ox = Number((ix * 3.1 - 1.55).toFixed(4));
            const oy = Number((iy * 3.1 - 1.55).toFixed(4));
            const oz = Number((iz * 3.1 - 1.55).toFixed(4));
            const oId = `O${idx}`;
            const h1Id = `H${idx * 2 - 1}`;
            const h2Id = `H${idx * 2}`;
            atoms.push(
              {
                id: oId,
                element: 'O',
                positionAngstrom: [ox, oy, oz],
                formalCharge: 0,
                aromatic: false,
              },
              {
                id: h1Id,
                element: 'H',
                positionAngstrom: [Number((ox + 0.757).toFixed(4)), Number((oy + 0.586).toFixed(4)), oz],
                formalCharge: 0,
                aromatic: false,
              },
              {
                id: h2Id,
                element: 'H',
                positionAngstrom: [Number((ox - 0.757).toFixed(4)), Number((oy + 0.586).toFixed(4)), oz],
                formalCharge: 0,
                aromatic: false,
              },
            );
            bonds.push(
              { id: `bw${idx}a`, atomA: oId, atomB: h1Id, order: 1 },
              { id: `bw${idx}b`, atomA: oId, atomB: h2Id, order: 1 },
            );
            idx += 1;
          }
        }
      }
      return {
        id: 'example-water-cluster-8',
        name: 'TIP3P Water Cluster (8 H2O)',
        revisionId: 'example-water-cluster-8-r1',
        netCharge: 0,
        provenance: {
          sourceKind: 'curated-illustrative-reference',
          summary: 'Curated 8-molecule TIP3P water lattice starter for OpenMM dynamics.',
          geometryStatus: 'illustrative-reference',
        },
        atoms,
        bonds,
      };
    })(),
  },
];

export function cloneMolecule(molecule: Molecule): Molecule {
  return {
    ...molecule,
    atoms: molecule.atoms.map((a) => ({
      ...a,
      positionAngstrom: [...a.positionAngstrom] as [number, number, number],
    })),
    bonds: molecule.bonds.map((b) => ({ ...b })),
    provenance: { ...molecule.provenance },
  };
}
