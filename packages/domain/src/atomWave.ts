export type HydrogenicOrbitalId = '1s' | '2s' | '2pz' | '2px' | '3dz2' | '3dx2y2';

export type AtomFieldDisplayMode = 'amplitude-phase' | 'probability-density';

export interface HydrogenicOrbitalSpec {
  id: HydrogenicOrbitalId;
  label: string;
  n: number;
  l: number;
  m: number;
  radialNodes: number;
  angularNodes: number;
  maxRadiusA0: number;
  summary: string;
}

export const BOHR_RADIUS_ANGSTROM = 0.529177210903;
export const HYDROGEN_GROUND_ENERGY_EV = 13.605693122994;
export const HC_EV_NM = 1239.841984332002;

export const HYDROGENIC_ORBITALS: readonly HydrogenicOrbitalSpec[] = [
  {
    id: '1s',
    label: '1s (n=1, l=0, m=0)',
    n: 1,
    l: 0,
    m: 0,
    radialNodes: 0,
    angularNodes: 0,
    maxRadiusA0: 5.5,
    summary: 'Fundamental spherical standing wave (0 nodes). Peak probability density at r = 1 a₀.',
  },
  {
    id: '2s',
    label: '2s (n=2, l=0, m=0)',
    n: 2,
    l: 0,
    m: 0,
    radialNodes: 1,
    angularNodes: 0,
    maxRadiusA0: 11.0,
    summary: 'Nested spherical standing wave with 1 radial node at r = 2 a₀ where phase flips sign (+ ↔ −).',
  },
  {
    id: '2pz',
    label: '2p_z (n=2, l=1, m=0)',
    n: 2,
    l: 1,
    m: 0,
    radialNodes: 0,
    angularNodes: 1,
    maxRadiusA0: 11.0,
    summary: 'Two opposite-phase lobes along the z-axis separated by an xy nodal plane.',
  },
  {
    id: '2px',
    label: '2p_x (n=2, l=1, m=±1)',
    n: 2,
    l: 1,
    m: 1,
    radialNodes: 0,
    angularNodes: 1,
    maxRadiusA0: 11.0,
    summary: 'Two opposite-phase lobes along the x-axis separated by a yz nodal plane.',
  },
  {
    id: '3dz2',
    label: '3d_z² (n=3, l=2, m=0)',
    n: 3,
    l: 2,
    m: 0,
    radialNodes: 0,
    angularNodes: 2,
    maxRadiusA0: 18.0,
    summary: 'Axial lobes with an opposite-phase equatorial torus (doughnut) ring.',
  },
  {
    id: '3dx2y2',
    label: '3d_x²−y² (n=3, l=2, m=2)',
    n: 3,
    l: 2,
    m: 2,
    radialNodes: 0,
    angularNodes: 2,
    maxRadiusA0: 18.0,
    summary: 'Four-leaf clover standing wave in the xy plane with alternating phases.',
  },
];

export function evaluateHydrogenicPsi(
  orbitalId: HydrogenicOrbitalId,
  xA0: number,
  yA0: number,
  zA0: number,
): number {
  const r = Math.sqrt(xA0 * xA0 + yA0 * yA0 + zA0 * zA0);
  if (r < 1e-12) {
    if (orbitalId === '1s') return 1 / Math.sqrt(Math.PI);
    if (orbitalId === '2s') return 1 / (2 * Math.sqrt(2 * Math.PI));
    return 0;
  }

  switch (orbitalId) {
    case '1s':
      return (1 / Math.sqrt(Math.PI)) * Math.exp(-r);
    case '2s':
      return (1 / (4 * Math.sqrt(2 * Math.PI))) * (2 - r) * Math.exp(-r / 2);
    case '2pz':
      return (1 / (4 * Math.sqrt(2 * Math.PI))) * zA0 * Math.exp(-r / 2);
    case '2px':
      return (1 / (4 * Math.sqrt(2 * Math.PI))) * xA0 * Math.exp(-r / 2);
    case '3dz2':
      return (
        (1 / (81 * Math.sqrt(6 * Math.PI))) *
        (3 * zA0 * zA0 - r * r) *
        Math.exp(-r / 3)
      );
    case '3dx2y2':
      return (
        (1 / (81 * Math.sqrt(2 * Math.PI))) *
        (xA0 * xA0 - yA0 * yA0) *
        Math.exp(-r / 3)
      );
  }
}

export interface HydrogenSpectralTransition {
  nUpper: number;
  nLower: number;
  energyUpperEv: number;
  energyLowerEv: number;
  deltaEnergyEv: number;
  wavelengthNm: number;
  seriesName: string;
  bandLabel: string;
  swatchHex: string;
}

export function wavelengthNmToSwatchHex(wavelengthNm: number): {
  bandLabel: string;
  swatchHex: string;
} {
  if (wavelengthNm < 380) {
    return { bandLabel: 'Ultraviolet (UV)', swatchHex: '#a78bfa' };
  }
  if (wavelengthNm < 450) {
    return { bandLabel: 'Visible Violet', swatchHex: '#8b5cf6' };
  }
  if (wavelengthNm < 495) {
    return { bandLabel: 'Visible Blue / Cyan', swatchHex: '#38bdf8' };
  }
  if (wavelengthNm < 570) {
    return { bandLabel: 'Visible Green', swatchHex: '#34d399' };
  }
  if (wavelengthNm < 620) {
    return { bandLabel: 'Visible Yellow / Orange', swatchHex: '#fbbf24' };
  }
  if (wavelengthNm <= 750) {
    return { bandLabel: 'Visible Red', swatchHex: '#ef4444' };
  }
  return { bandLabel: 'Infrared (IR)', swatchHex: '#9f1239' };
}

export function computeHydrogenTransition(
  nUpper: number,
  nLower: number,
): HydrogenSpectralTransition {
  const safeLower = Math.max(1, Math.min(4, Math.floor(nLower)));
  const safeUpper = Math.max(safeLower + 1, Math.min(6, Math.floor(nUpper)));
  const energyUpperEv = -HYDROGEN_GROUND_ENERGY_EV / (safeUpper * safeUpper);
  const energyLowerEv = -HYDROGEN_GROUND_ENERGY_EV / (safeLower * safeLower);
  const deltaEnergyEv = energyUpperEv - energyLowerEv;
  const wavelengthNm = HC_EV_NM / deltaEnergyEv;
  const { bandLabel, swatchHex } = wavelengthNmToSwatchHex(wavelengthNm);

  const seriesName =
    safeLower === 1
      ? 'Lyman series'
      : safeLower === 2
        ? 'Balmer series'
        : safeLower === 3
          ? 'Paschen series'
          : 'Brackett series';

  return {
    nUpper: safeUpper,
    nLower: safeLower,
    energyUpperEv,
    energyLowerEv,
    deltaEnergyEv,
    wavelengthNm,
    seriesName,
    bandLabel,
    swatchHex,
  };
}
