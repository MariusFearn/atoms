export interface IsotopeReference {
  massNumber: number;
  atomicMassU: number;
  naturalAbundancePercent?: number;
  label: string;
}

export interface ElementReference {
  atomicNumber: number;
  symbol: string;
  name: string;
  category: 'nonmetal' | 'halogen';
  standardAtomicWeightU: number;
  covalentRadiusAngstrom: number;
  vdwRadiusAngstrom: number;
  cpkColorHex: string;
  colorblindColorHex: string;
  commonNeutralValences: readonly number[];
  electronConfiguration: string;
  isotopes: readonly IsotopeReference[];
  provenance: string;
}

export const DATASET_PROVENANCE = {
  atomicWeights: 'IUPAC CIAAW 2021 abridged standard atomic weights',
  covalentRadii: 'Cordero et al., Dalton Trans. 2008, 2832–2838',
  vdwRadii: 'Bondi (1964) & Mantina et al., J. Phys. Chem. A 2009, 113, 5806',
  isotopes: 'NIST Atomic Weights and Isotopic Compositions (reference mass numbers)',
  colors: 'Jmol/CPK convention + Okabe-Ito-inspired high-contrast palette',
} as const;

export const MVP_ELEMENTS: readonly ElementReference[] = [
  {
    atomicNumber: 1,
    symbol: 'H',
    name: 'Hydrogen',
    category: 'nonmetal',
    standardAtomicWeightU: 1.008,
    covalentRadiusAngstrom: 0.31,
    vdwRadiusAngstrom: 1.1,
    cpkColorHex: '#f1f5f9',
    colorblindColorHex: '#f8fafc',
    commonNeutralValences: [1],
    electronConfiguration: '1s1',
    isotopes: [
      { massNumber: 1, atomicMassU: 1.007825, naturalAbundancePercent: 99.9885, label: '¹H (Protium)' },
      { massNumber: 2, atomicMassU: 2.014102, naturalAbundancePercent: 0.0115, label: '²H (Deuterium)' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 6,
    symbol: 'C',
    name: 'Carbon',
    category: 'nonmetal',
    standardAtomicWeightU: 12.011,
    covalentRadiusAngstrom: 0.76,
    vdwRadiusAngstrom: 1.7,
    cpkColorHex: '#4b5563',
    colorblindColorHex: '#64748b',
    commonNeutralValences: [4],
    electronConfiguration: '1s2 2s2 2p2',
    isotopes: [
      { massNumber: 12, atomicMassU: 12.0, naturalAbundancePercent: 98.93, label: '¹²C' },
      { massNumber: 13, atomicMassU: 13.003355, naturalAbundancePercent: 1.07, label: '¹³C' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 7,
    symbol: 'N',
    name: 'Nitrogen',
    category: 'nonmetal',
    standardAtomicWeightU: 14.007,
    covalentRadiusAngstrom: 0.71,
    vdwRadiusAngstrom: 1.55,
    cpkColorHex: '#3b82f6',
    colorblindColorHex: '#0072b2',
    commonNeutralValences: [3],
    electronConfiguration: '1s2 2s2 2p3',
    isotopes: [
      { massNumber: 14, atomicMassU: 14.003074, naturalAbundancePercent: 99.636, label: '¹⁴N' },
      { massNumber: 15, atomicMassU: 15.000109, naturalAbundancePercent: 0.364, label: '¹⁵N' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 8,
    symbol: 'O',
    name: 'Oxygen',
    category: 'nonmetal',
    standardAtomicWeightU: 15.999,
    covalentRadiusAngstrom: 0.66,
    vdwRadiusAngstrom: 1.52,
    cpkColorHex: '#ef4444',
    colorblindColorHex: '#d55e00',
    commonNeutralValences: [2],
    electronConfiguration: '1s2 2s2 2p4',
    isotopes: [
      { massNumber: 16, atomicMassU: 15.994915, naturalAbundancePercent: 99.757, label: '¹⁶O' },
      { massNumber: 17, atomicMassU: 16.999132, naturalAbundancePercent: 0.038, label: '¹⁷O' },
      { massNumber: 18, atomicMassU: 17.99916, naturalAbundancePercent: 0.205, label: '¹⁸O' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 9,
    symbol: 'F',
    name: 'Fluorine',
    category: 'halogen',
    standardAtomicWeightU: 18.998,
    covalentRadiusAngstrom: 0.57,
    vdwRadiusAngstrom: 1.47,
    cpkColorHex: '#84cc16',
    colorblindColorHex: '#56b4e9',
    commonNeutralValences: [1],
    electronConfiguration: '1s2 2s2 2p5',
    isotopes: [
      { massNumber: 19, atomicMassU: 18.998403, naturalAbundancePercent: 100.0, label: '¹⁹F' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 15,
    symbol: 'P',
    name: 'Phosphorus',
    category: 'nonmetal',
    standardAtomicWeightU: 30.974,
    covalentRadiusAngstrom: 1.07,
    vdwRadiusAngstrom: 1.8,
    cpkColorHex: '#f97316',
    colorblindColorHex: '#e69f00',
    commonNeutralValences: [3, 5],
    electronConfiguration: '[Ne] 3s2 3p3',
    isotopes: [
      { massNumber: 31, atomicMassU: 30.973762, naturalAbundancePercent: 100.0, label: '³¹P' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 16,
    symbol: 'S',
    name: 'Sulfur',
    category: 'nonmetal',
    standardAtomicWeightU: 32.06,
    covalentRadiusAngstrom: 1.05,
    vdwRadiusAngstrom: 1.8,
    cpkColorHex: '#eab308',
    colorblindColorHex: '#f0e442',
    commonNeutralValences: [2, 4, 6],
    electronConfiguration: '[Ne] 3s2 3p4',
    isotopes: [
      { massNumber: 32, atomicMassU: 31.972071, naturalAbundancePercent: 94.99, label: '³²S' },
      { massNumber: 33, atomicMassU: 32.971459, naturalAbundancePercent: 0.75, label: '³³S' },
      { massNumber: 34, atomicMassU: 33.967867, naturalAbundancePercent: 4.25, label: '³⁴S' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 17,
    symbol: 'Cl',
    name: 'Chlorine',
    category: 'halogen',
    standardAtomicWeightU: 35.45,
    covalentRadiusAngstrom: 1.02,
    vdwRadiusAngstrom: 1.75,
    cpkColorHex: '#22c55e',
    colorblindColorHex: '#009e73',
    commonNeutralValences: [1],
    electronConfiguration: '[Ne] 3s2 3p5',
    isotopes: [
      { massNumber: 35, atomicMassU: 34.968853, naturalAbundancePercent: 75.76, label: '³⁵Cl' },
      { massNumber: 37, atomicMassU: 36.965903, naturalAbundancePercent: 24.24, label: '³⁷Cl' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 35,
    symbol: 'Br',
    name: 'Bromine',
    category: 'halogen',
    standardAtomicWeightU: 79.904,
    covalentRadiusAngstrom: 1.2,
    vdwRadiusAngstrom: 1.85,
    cpkColorHex: '#991b1b',
    colorblindColorHex: '#a63603',
    commonNeutralValences: [1],
    electronConfiguration: '[Ar] 3d10 4s2 4p5',
    isotopes: [
      { massNumber: 79, atomicMassU: 78.918338, naturalAbundancePercent: 50.69, label: '⁷⁹Br' },
      { massNumber: 81, atomicMassU: 80.91629, naturalAbundancePercent: 49.31, label: '⁸¹Br' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
  {
    atomicNumber: 53,
    symbol: 'I',
    name: 'Iodine',
    category: 'halogen',
    standardAtomicWeightU: 126.9,
    covalentRadiusAngstrom: 1.39,
    vdwRadiusAngstrom: 1.98,
    cpkColorHex: '#9333ea',
    colorblindColorHex: '#cc79a7',
    commonNeutralValences: [1],
    electronConfiguration: '[Kr] 4d10 5s2 5p5',
    isotopes: [
      { massNumber: 127, atomicMassU: 126.904473, naturalAbundancePercent: 100.0, label: '¹²⁷I' },
    ],
    provenance: DATASET_PROVENANCE.atomicWeights,
  },
] as const;

const ELEMENT_BY_SYMBOL = new Map<string, ElementReference>(
  MVP_ELEMENTS.map((el) => [el.symbol, el]),
);

export function getElementBySymbol(symbol: string): ElementReference | undefined {
  return ELEMENT_BY_SYMBOL.get(symbol);
}

export function isSupportedElementSymbol(symbol: string): boolean {
  return ELEMENT_BY_SYMBOL.has(symbol);
}
