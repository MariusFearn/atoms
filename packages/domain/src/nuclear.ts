export type NuclearParticleKind = 'proton' | 'neutron' | 'alpha';

export const NUCLEAR_COULOMB_KE_E2_MEV_FM = 1.439964547842567;
export const PROTON_MASS_MEV_C2 = 938.27208816;
export const NEUTRON_MASS_MEV_C2 = 939.56542052;
export const ALPHA_MASS_MEV_C2 = 3727.3794066;
export const MEV_PER_U = 931.49410242;
export const FM_PER_C_SECONDS = 3.33564095198152e-24;

// G * (1 MeV/c^2)^2 in MeV * fm:
// 1 MeV/c^2 = 1.7826619216e-30 kg; 1 MeV*fm = 1.602176634e-28 J*m
// G * (1 MeV/c^2)^2 / (1 MeV*fm) = 1.323794e-42 MeV*fm / (MeV/c^2)^2
export const GRAVITY_MEV_FM_PER_MEV2 = 1.32379424e-42;

export interface NuclearParticle {
  id: string;
  kind: NuclearParticleKind;
  label: string;
  chargeE: number;
  massMevC2: number;
  positionFm: [number, number, number];
  velocityC: [number, number, number];
}

export interface NuclearForceConfig {
  coulombScale: number;
  nuclearAttractionMev: number;
  nuclearAttractionRangeFm: number;
  coreRepulsionMev: number;
  coreRepulsionRangeFm: number;
  gravityEnabled: boolean;
  gravityLog10Multiplier: number;
  dampingPerFc: number;
  timestepFc: number;
  totalSteps: number;
  reportIntervalSteps: number;
}

export interface NuclearReferenceBenchmark {
  nuclide: string;
  totalBindingEnergyMev: number;
  clusterBindingEnergyMev: number;
  stabilitySummary: string;
  halfLifeNote: string;
  source: string;
}

export interface NuclearClusterPreset {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  particles: NuclearParticle[];
  clusterEdges: Array<[string, string]>;
  recommendedForceConfig: NuclearForceConfig;
  benchmark: NuclearReferenceBenchmark;
}

export interface NuclearGuidedExperiment {
  id: string;
  title: string;
  question: string;
  presetId: string;
  forceOverrides: Partial<NuclearForceConfig>;
  whatToWatch: string;
}

export interface NuclearTrajectoryFrame {
  frameIndex: number;
  step: number;
  timeFc: number;
  kineticEnergyMev: number;
  coulombEnergyMev: number;
  nuclearEnergyMev: number;
  gravityEnergyMev: number;
  potentialEnergyMev: number;
  totalEnergyMev: number;
  minPairDistanceFm: number;
  maxPairDistanceFm: number;
  positionsFm: Array<[number, number, number]>;
  forceVectorsMevFm: Array<[number, number, number]>;
}

export type NuclearStabilityVerdict =
  | 'bound-oscillating'
  | 'unbound-dissociated'
  | 'collapsed-core';

export interface NuclearSimulationResult {
  presetId: string;
  modelLabel: string;
  disclaimer: string;
  assumptions: string[];
  limitations: string[];
  particleIds: string[];
  particleKinds: NuclearParticleKind[];
  stabilityVerdict: NuclearStabilityVerdict;
  verdictExplanation: string;
  initialTotalEnergyMev: number;
  finalTotalEnergyMev: number;
  energyDriftMev: number;
  finalClusterEnergyMev: number;
  referenceBenchmark: NuclearReferenceBenchmark | null;
  frames: NuclearTrajectoryFrame[];
}

export const DEFAULT_NUCLEAR_FORCE_CONFIG: NuclearForceConfig = {
  coulombScale: 1.0,
  nuclearAttractionMev: 84.0,
  nuclearAttractionRangeFm: 2.11,
  coreRepulsionMev: 475.0,
  coreRepulsionRangeFm: 1.43,
  gravityEnabled: true,
  gravityLog10Multiplier: 0,
  dampingPerFc: 0.0,
  timestepFc: 0.25,
  totalSteps: 400,
  reportIntervalSteps: 4,
};

const C12_SIDE_FM = 3.05;
const C12_R_FM = C12_SIDE_FM / Math.sqrt(3);

// Regular tetrahedron edge ~ 3.05 fm centered at origin:
// vertices at (s, s, s), (s, -s, -s), (-s, s, -s), (-s, -s, s) where edge = 2*sqrt(2)*s
const O16_S_FM = 3.05 / (2 * Math.SQRT2);

export const NUCLEAR_PRESETS: readonly NuclearClusterPreset[] = [
  {
    id: 'be8-two-alpha',
    name: 'Beryllium-8 (2α)',
    subtitle: '2 Alpha Clusters · Unbound Resonance',
    description:
      'Two alpha particles (He-4 cores) starting near the shallow nuclear attraction well with realistic relative zero-point motion. Tests the Be-8 breakup discussed in the video.',
    particles: [
      {
        id: 'a1',
        kind: 'alpha',
        label: 'α1 (He-4)',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-1.7, 0, 0],
        velocityC: [-0.034, 0, 0],
      },
      {
        id: 'a2',
        kind: 'alpha',
        label: 'α2 (He-4)',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [1.7, 0, 0],
        velocityC: [0.034, 0, 0],
      },
    ],
    clusterEdges: [['a1', 'a2']],
    recommendedForceConfig: { ...DEFAULT_NUCLEAR_FORCE_CONFIG },
    benchmark: {
      nuclide: '⁸Be (4p, 4n)',
      totalBindingEnergyMev: 56.5,
      clusterBindingEnergyMev: 0.0918,
      stabilitySummary: 'Unbound (+0.0918 MeV above 2α threshold)',
      halfLifeNote: 'Decays into 2α in ~8.19 × 10⁻¹⁷ s',
      source: 'AME2020 / NNDC NuDat 3.0',
    },
  },
  {
    id: 'c12-three-alpha',
    name: 'Carbon-12 (3α Lock)',
    subtitle: '3 Alpha Clusters · Equilateral Triangle',
    description:
      'Three alpha particles arranged in an equilateral triangle (~3.05 fm side). Models how 3 alphas gain extra pairwise bonds and stay bound where 2 alphas (Be-8) fail.',
    particles: [
      {
        id: 'a1',
        kind: 'alpha',
        label: 'α1',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [C12_R_FM, 0, 0],
        velocityC: [0, 0.012, 0],
      },
      {
        id: 'a2',
        kind: 'alpha',
        label: 'α2',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-0.5 * C12_R_FM, (Math.sqrt(3) / 2) * C12_R_FM, 0],
        velocityC: [-0.01, -0.006, 0],
      },
      {
        id: 'a3',
        kind: 'alpha',
        label: 'α3',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-0.5 * C12_R_FM, -(Math.sqrt(3) / 2) * C12_R_FM, 0],
        velocityC: [0.01, -0.006, 0],
      },
    ],
    clusterEdges: [
      ['a1', 'a2'],
      ['a2', 'a3'],
      ['a3', 'a1'],
    ],
    recommendedForceConfig: { ...DEFAULT_NUCLEAR_FORCE_CONFIG },
    benchmark: {
      nuclide: '¹²C Ground State (6p, 6n)',
      totalBindingEnergyMev: 92.162,
      clusterBindingEnergyMev: -7.275,
      stabilitySummary: 'Stable (−7.275 MeV below 3α threshold)',
      halfLifeNote: 'Stable (98.93% natural abundance)',
      source: 'AME2020 / NNDC NuDat 3.0',
    },
  },
  {
    id: 'c12-hoyle-state',
    name: 'Carbon-12 (Hoyle State)',
    subtitle: '3 Alpha Clusters · Extended Obtuse Chain',
    description:
      'Excited 0⁺₂ state of Carbon-12 where three alpha clusters sit in a stretched obtuse/linear configuration near the 3α breakup threshold—crucial for carbon synthesis in stars.',
    particles: [
      {
        id: 'a1',
        kind: 'alpha',
        label: 'α1',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-3.3, -0.35, 0],
        velocityC: [0.006, 0.005, 0],
      },
      {
        id: 'a2',
        kind: 'alpha',
        label: 'α2',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [0, 0.7, 0],
        velocityC: [0, -0.01, 0],
      },
      {
        id: 'a3',
        kind: 'alpha',
        label: 'α3',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [3.3, -0.35, 0],
        velocityC: [-0.006, 0.005, 0],
      },
    ],
    clusterEdges: [
      ['a1', 'a2'],
      ['a2', 'a3'],
      ['a3', 'a1'],
    ],
    recommendedForceConfig: { ...DEFAULT_NUCLEAR_FORCE_CONFIG },
    benchmark: {
      nuclide: '¹²C Hoyle State (7.654 MeV 0⁺₂)',
      totalBindingEnergyMev: 84.508,
      clusterBindingEnergyMev: 0.379,
      stabilitySummary: 'Near-threshold resonance (+0.379 MeV above 3α)',
      halfLifeNote: 'Excited state; decays via 3α or radiative γ to ¹²C ground',
      source: 'NNDC NuDat 3.0 / Freer & Fynbo (2014)',
    },
  },
  {
    id: 'o16-four-alpha',
    name: 'Oxygen-16 (4α Tetrahedron)',
    subtitle: '4 Alpha Clusters · 3D Pyramid',
    description:
      'Four alpha clusters at the corners of a regular 3D tetrahedron (6 pairwise links). Demonstrates why Oxygen-16 is strongly bound in alpha-cluster models.',
    particles: [
      {
        id: 'a1',
        kind: 'alpha',
        label: 'α1',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [O16_S_FM, O16_S_FM, O16_S_FM],
        velocityC: [0, 0, 0],
      },
      {
        id: 'a2',
        kind: 'alpha',
        label: 'α2',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [O16_S_FM, -O16_S_FM, -O16_S_FM],
        velocityC: [0, 0, 0],
      },
      {
        id: 'a3',
        kind: 'alpha',
        label: 'α3',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-O16_S_FM, O16_S_FM, -O16_S_FM],
        velocityC: [0, 0, 0],
      },
      {
        id: 'a4',
        kind: 'alpha',
        label: 'α4',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-O16_S_FM, -O16_S_FM, O16_S_FM],
        velocityC: [0, 0, 0],
      },
    ],
    clusterEdges: [
      ['a1', 'a2'],
      ['a1', 'a3'],
      ['a1', 'a4'],
      ['a2', 'a3'],
      ['a2', 'a4'],
      ['a3', 'a4'],
    ],
    recommendedForceConfig: { ...DEFAULT_NUCLEAR_FORCE_CONFIG },
    benchmark: {
      nuclide: '¹⁶O Ground State (8p, 8n)',
      totalBindingEnergyMev: 127.619,
      clusterBindingEnergyMev: -14.437,
      stabilitySummary: 'Stable (−14.437 MeV below 4α threshold)',
      halfLifeNote: 'Stable (99.757% natural abundance)',
      source: 'AME2020 / NNDC NuDat 3.0',
    },
  },
  {
    id: 'he4-nucleons',
    name: 'Helium-4 (2p + 2n)',
    subtitle: '4 Individual Nucleons · Core Tetrahedron',
    description:
      'Two protons (+1e) and two neutrons (0e) forming a single alpha particle. Lets you toggle Coulomb repulsion vs. nucleon attraction and see why neutrons help bind protons.',
    particles: [
      {
        id: 'p1',
        kind: 'proton',
        label: 'p1 (+1)',
        chargeE: 1,
        massMevC2: PROTON_MASS_MEV_C2,
        positionFm: [0.68, 0.68, 0.68],
        velocityC: [0, 0, 0],
      },
      {
        id: 'p2',
        kind: 'proton',
        label: 'p2 (+1)',
        chargeE: 1,
        massMevC2: PROTON_MASS_MEV_C2,
        positionFm: [0.68, -0.68, -0.68],
        velocityC: [0, 0, 0],
      },
      {
        id: 'n1',
        kind: 'neutron',
        label: 'n1 (0)',
        chargeE: 0,
        massMevC2: NEUTRON_MASS_MEV_C2,
        positionFm: [-0.68, 0.68, -0.68],
        velocityC: [0, 0, 0],
      },
      {
        id: 'n2',
        kind: 'neutron',
        label: 'n2 (0)',
        chargeE: 0,
        massMevC2: NEUTRON_MASS_MEV_C2,
        positionFm: [-0.68, -0.68, 0.68],
        velocityC: [0, 0, 0],
      },
    ],
    clusterEdges: [
      ['p1', 'p2'],
      ['p1', 'n1'],
      ['p1', 'n2'],
      ['p2', 'n1'],
      ['p2', 'n2'],
      ['n1', 'n2'],
    ],
    recommendedForceConfig: {
      ...DEFAULT_NUCLEAR_FORCE_CONFIG,
      nuclearAttractionMev: 42.0,
      nuclearAttractionRangeFm: 1.85,
      coreRepulsionMev: 140.0,
      coreRepulsionRangeFm: 0.85,
      timestepFc: 0.15,
    },
    benchmark: {
      nuclide: '⁴He (2p, 2n)',
      totalBindingEnergyMev: 28.296,
      clusterBindingEnergyMev: -28.296,
      stabilitySummary: 'Deeply bound (−28.296 MeV vs. free 2p+2n)',
      halfLifeNote: 'Stable (α particle)',
      source: 'AME2020 / NNDC NuDat 3.0',
    },
  },
  {
    id: 'b11-proton-fusion',
    name: 'Boron-11 + Proton (p + ¹¹B)',
    subtitle: 'Beam Proton + 2α/p/2n Boron Cluster Proxy',
    description:
      'Toy cluster representation of an incoming proton approaching ¹¹B (modeled as 2α + 1p + 2n = 5p, 6n). Mirrors the p + ¹¹B → 3α fusion reaction referenced in the video comments.',
    particles: [
      {
        id: 'a1',
        kind: 'alpha',
        label: 'α1',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-1.3, 1.5, 0],
        velocityC: [0, 0, 0],
      },
      {
        id: 'a2',
        kind: 'alpha',
        label: 'α2',
        chargeE: 2,
        massMevC2: ALPHA_MASS_MEV_C2,
        positionFm: [-1.3, -1.5, 0],
        velocityC: [0, 0, 0],
      },
      {
        id: 'p_core',
        kind: 'proton',
        label: 'p(t)',
        chargeE: 1,
        massMevC2: PROTON_MASS_MEV_C2,
        positionFm: [1.7, 0, 1.4],
        velocityC: [0, 0, 0],
      },
      {
        id: 'n1',
        kind: 'neutron',
        label: 'n1(t)',
        chargeE: 0,
        massMevC2: NEUTRON_MASS_MEV_C2,
        positionFm: [1.7, 1.3, -1.0],
        velocityC: [0, 0, 0],
      },
      {
        id: 'n2',
        kind: 'neutron',
        label: 'n2(t)',
        chargeE: 0,
        massMevC2: NEUTRON_MASS_MEV_C2,
        positionFm: [1.7, -1.3, -1.0],
        velocityC: [0, 0, 0],
      },
      {
        id: 'p_in',
        kind: 'proton',
        label: 'p (beam)',
        chargeE: 1,
        massMevC2: PROTON_MASS_MEV_C2,
        positionFm: [-6.0, 0.25, 0],
        velocityC: [0.14, 0, 0],
      },
    ],
    clusterEdges: [
      ['a1', 'a2'],
      ['a1', 'p_core'],
      ['a2', 'p_core'],
      ['p_core', 'n1'],
      ['p_core', 'n2'],
      ['n1', 'n2'],
    ],
    recommendedForceConfig: {
      ...DEFAULT_NUCLEAR_FORCE_CONFIG,
      timestepFc: 0.2,
    },
    benchmark: {
      nuclide: 'p + ¹¹B → 3α',
      totalBindingEnergyMev: 76.205,
      clusterBindingEnergyMev: -8.59,
      stabilitySummary: 'Exothermic reaction (Q = +8.590 MeV released)',
      halfLifeNote: 'Aneutronic fusion channel yielding 3α',
      source: 'AME2020 / NNDC NuDat 3.0',
    },
  },
];

export const NUCLEAR_GUIDED_EXPERIMENTS: readonly NuclearGuidedExperiment[] = [
  {
    id: 'exp-real-gravity-be8',
    title: '1. Can Real Gravity Hold Be-8 Together?',
    question:
      'Turn off the short-range nuclear "Velcro" and leave only Electric Repulsion + Real Gravity (10⁰×). Does gravity keep two alphas together?',
    presetId: 'be8-two-alpha',
    forceOverrides: {
      coulombScale: 1.0,
      nuclearAttractionMev: 0,
      coreRepulsionMev: 0,
      gravityEnabled: true,
      gravityLog10Multiplier: 0,
    },
    whatToWatch:
      'The two alphas immediately blast apart. Compare the Coulomb energy (~1.8 MeV) to real gravitational energy (~10⁻³⁵ MeV): gravity is 35+ orders of magnitude too weak.',
  },
  {
    id: 'exp-amplified-gravity',
    title: '2. Test the Video Idea: Boost Gravity 10³⁶×',
    question:
      'What happens if you amplify a 1/r² gravity-like pull by 10³⁶× so it rivals electric repulsion—without any short-range core bumper?',
    presetId: 'c12-three-alpha',
    forceOverrides: {
      coulombScale: 1.0,
      nuclearAttractionMev: 0,
      coreRepulsionMev: 0,
      gravityEnabled: true,
      gravityLog10Multiplier: 36,
    },
    whatToWatch:
      'Because both electric push (1/r) and gravity pull (1/r) shrink identically with distance, there is NO stable equilibrium radius: the triangle either collapses inward toward r = 0 or expands forever.',
  },
  {
    id: 'exp-be8-vs-c12',
    title: '3. Why Be-8 Splits While C-12 Locks',
    question:
      'With standard short-range nuclear Velcro + Coulomb repulsion, run Be-8 (2 alphas) and then C-12 (3 alphas).',
    presetId: 'c12-three-alpha',
    forceOverrides: {
      ...DEFAULT_NUCLEAR_FORCE_CONFIG,
    },
    whatToWatch:
      'In C-12, 3 pairwise links beat the repulsion and keep the triangle oscillating cleanly (−7.3 MeV cluster energy). In Be-8, only 1 link is not enough to trap its zero-point motion, so it separates.',
  },
  {
    id: 'exp-hoyle-relax',
    title: '4. Stretch the Triangle: Hoyle State',
    question:
      'Run the stretched C-12 Hoyle chain first with no damping, then try a small damping value (0.05) to watch it fold into the tight ground-state triangle.',
    presetId: 'c12-hoyle-state',
    forceOverrides: {
      ...DEFAULT_NUCLEAR_FORCE_CONFIG,
      dampingPerFc: 0.04,
      totalSteps: 600,
    },
    whatToWatch:
      'Watch the obtuse chain bend and snap into an equilateral triangle as excess energy drains away—mirroring the Hoyle state decaying toward ground-state Carbon-12.',
  },
];

export function getNuclearPresetById(id: string): NuclearClusterPreset {
  return NUCLEAR_PRESETS.find((p) => p.id === id) ?? NUCLEAR_PRESETS[0]!;
}

export function mevToAtomicMassU(mev: number): number {
  return mev / MEV_PER_U;
}
