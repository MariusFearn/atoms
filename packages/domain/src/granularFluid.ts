export type MacroParticleKind = 'water' | 'sand' | 'oil' | 'ferro';

export type SandWaterPresetId =
  | 'cascade-maze'
  | 'density-tower'
  | 'plinko-funnel'
  | 'sand-into-water'
  | 'dam-break'
  | 'sand-pile'
  | 'obstacle-splash';

export interface ObstacleBox3D {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  angleZ: number;
}

export interface SandWaterConfig {
  gravityY: number;
  gravityX: number;
  gravityZ?: number;
  viscosity: number;
  sandFriction: number;
  stiffness: number;
  hasObstacle: boolean;
  isGlassMode?: boolean;
  paused: boolean;
}

export const DEFAULT_SAND_WATER_CONFIG: SandWaterConfig = {
  gravityY: -18.0,
  gravityX: 0.0,
  gravityZ: 0.0,
  viscosity: 0.35,
  sandFriction: 0.55,
  stiffness: 1.0,
  hasObstacle: false,
  isGlassMode: false,
  paused: false,
};

export const TANK_BOUNDS = {
  minX: -4.5,
  maxX: 4.5,
  minY: 0.0,
  maxY: 6.8,
  minZ: -2.1,
  maxZ: 2.1,
} as const;

export const OBSTACLE_BOX = {
  minX: -0.4,
  maxX: 0.4,
  minY: 0.0,
  maxY: 2.5,
  minZ: -2.1,
  maxZ: 2.1,
} as const;

export const MAX_MACRO_PARTICLES = 6000;
export const WATER_RADIUS = 0.08;
export const SAND_RADIUS = 0.072;
export const OIL_RADIUS = 0.082;
export const FERRO_RADIUS = 0.072;

/**
 * Real-world densities in g/cm³ (relative to water), used as particle masses.
 * 'ferro' is magnetite (Fe₃O₄) "black iron sand", handled as magnetic grains.
 */
export const MATERIAL_DENSITY_G_CM3: Readonly<Record<MacroParticleKind, number>> = {
  water: 1.0, // liquid water ~20 °C
  oil: 0.92, // vegetable / cooking oil
  sand: 2.65, // quartz (SiO₂) grains
  ferro: 5.2, // magnetite (Fe₃O₄) grains
};

export const MATERIAL_LABELS: Readonly<Record<MacroParticleKind, string>> = {
  water: 'Water',
  oil: 'Oil',
  sand: 'Sand',
  ferro: 'Magnetite',
};

export function getObstaclesForPreset(
  presetId: SandWaterPresetId,
  hasBarrier: boolean,
  isGlassMode: boolean,
): ObstacleBox3D[] {
  if (isGlassMode) return [];

  if (presetId === 'cascade-maze') {
    return [
      { cx: -1.75, cy: 5.15, cz: 0, hx: 2.35, hy: 0.13, hz: 2.05, angleZ: -0.22 },
      { cx: 1.75, cy: 3.95, cz: 0, hx: 2.35, hy: 0.13, hz: 2.05, angleZ: 0.22 },
      { cx: -1.55, cy: 2.7, cz: 0, hx: 2.3, hy: 0.13, hz: 2.05, angleZ: -0.2 },
      { cx: 1.65, cy: 1.5, cz: 0, hx: 2.2, hy: 0.13, hz: 2.05, angleZ: 0.2 },
      { cx: -0.8, cy: 0.55, cz: 0, hx: 0.22, hy: 0.55, hz: 2.05, angleZ: 0 },
      { cx: 0.9, cy: 0.45, cz: 0, hx: 0.18, hy: 0.45, hz: 2.05, angleZ: 0 },
    ];
  }

  if (presetId === 'plinko-funnel') {
    const pegs: ObstacleBox3D[] = [
      { cx: -1.85, cy: 5.35, cz: 0, hx: 1.6, hy: 0.13, hz: 2.05, angleZ: -0.42 },
      { cx: 1.85, cy: 5.35, cz: 0, hx: 1.6, hy: 0.13, hz: 2.05, angleZ: 0.42 },
    ];
    for (const x of [-1.7, 0, 1.7]) {
      pegs.push({ cx: x, cy: 3.85, cz: 0, hx: 0.22, hy: 0.22, hz: 2.05, angleZ: 0.7854 });
    }
    for (const x of [-2.55, -0.85, 0.85, 2.55]) {
      pegs.push({ cx: x, cy: 2.75, cz: 0, hx: 0.22, hy: 0.22, hz: 2.05, angleZ: 0.7854 });
    }
    for (const x of [-1.7, 0, 1.7]) {
      pegs.push({ cx: x, cy: 1.65, cz: 0, hx: 0.22, hy: 0.22, hz: 2.05, angleZ: 0.7854 });
    }
    for (const x of [-1.8, 0, 1.8]) {
      pegs.push({ cx: x, cy: 0.48, cz: 0, hx: 0.11, hy: 0.48, hz: 2.05, angleZ: 0 });
    }
    return pegs;
  }

  if (hasBarrier) {
    return [{ cx: 0, cy: 1.25, cz: 0, hx: 0.35, hy: 1.25, hz: 2.05, angleZ: 0 }];
  }
  return [];
}

function kindToCode(kind: MacroParticleKind): number {
  switch (kind) {
    case 'water':
      return 0;
    case 'sand':
      return 1;
    case 'oil':
      return 2;
    case 'ferro':
      return 3;
  }
}

function particleMassFromCode(code: number): number {
  switch (code) {
    case 0:
      return MATERIAL_DENSITY_G_CM3.water;
    case 1:
      return MATERIAL_DENSITY_G_CM3.sand;
    case 2:
      return MATERIAL_DENSITY_G_CM3.oil;
    default:
      return MATERIAL_DENSITY_G_CM3.ferro;
  }
}

function particleRadiusFromCode(code: number): number {
  switch (code) {
    case 0:
      return WATER_RADIUS;
    case 1:
      return SAND_RADIUS;
    case 2:
      return OIL_RADIUS;
    default:
      return FERRO_RADIUS;
  }
}
const SMOOTHING_H = 0.28;
const CELL_SIZE = SMOOTHING_H;

// Spatial grid dimensions covering TANK_BOUNDS (9.0 x 6.8 x 4.2)
const GRID_NX = 34;
const GRID_NY = 26;
const GRID_NZ = 16;
const GRID_TOTAL_CELLS = GRID_NX * GRID_NY * GRID_NZ;

export interface SandWaterSimulationState {
  count: number;
  kinds: Uint8Array; // 0 = water, 1 = sand
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  fx: Float32Array;
  fy: Float32Array;
  fz: Float32Array;
  density: Float32Array;
  pressure: Float32Array;
  cellHead: Int32Array;
  cellNext: Int32Array;
  stepCount: number;
}

export function createSandWaterState(): SandWaterSimulationState {
  return {
    count: 0,
    kinds: new Uint8Array(MAX_MACRO_PARTICLES),
    px: new Float32Array(MAX_MACRO_PARTICLES),
    py: new Float32Array(MAX_MACRO_PARTICLES),
    pz: new Float32Array(MAX_MACRO_PARTICLES),
    vx: new Float32Array(MAX_MACRO_PARTICLES),
    vy: new Float32Array(MAX_MACRO_PARTICLES),
    vz: new Float32Array(MAX_MACRO_PARTICLES),
    fx: new Float32Array(MAX_MACRO_PARTICLES),
    fy: new Float32Array(MAX_MACRO_PARTICLES),
    fz: new Float32Array(MAX_MACRO_PARTICLES),
    density: new Float32Array(MAX_MACRO_PARTICLES),
    pressure: new Float32Array(MAX_MACRO_PARTICLES),
    cellHead: new Int32Array(GRID_TOTAL_CELLS),
    cellNext: new Int32Array(MAX_MACRO_PARTICLES),
    stepCount: 0,
  };
}

export function spawnMacroParticle(
  state: SandWaterSimulationState,
  kind: MacroParticleKind,
  x: number,
  y: number,
  z: number,
  vx = 0,
  vy = 0,
  vz = 0,
): boolean {
  if (state.count >= MAX_MACRO_PARTICLES) return false;
  const idx = state.count;
  state.kinds[idx] = kindToCode(kind);
  state.px[idx] = Math.max(TANK_BOUNDS.minX + 0.12, Math.min(TANK_BOUNDS.maxX - 0.12, x));
  state.py[idx] = Math.max(TANK_BOUNDS.minY + 0.12, Math.min(TANK_BOUNDS.maxY - 0.12, y));
  state.pz[idx] = Math.max(TANK_BOUNDS.minZ + 0.12, Math.min(TANK_BOUNDS.maxZ - 0.12, z));
  state.vx[idx] = vx;
  state.vy[idx] = vy;
  state.vz[idx] = vz;
  state.count += 1;
  return true;
}

function deterministicJitter(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

export function loadSandWaterPreset(
  state: SandWaterSimulationState,
  presetId: SandWaterPresetId,
  isGlassMode = false,
): { hasObstacle: boolean } {
  state.count = 0;
  state.stepCount = 0;
  let seq = 1;

  if (isGlassMode) {
    if (presetId === 'density-tower') {
      // 4-layer density column inside 3D Glass: Ferro (bottom), Sand, Water, Oil (top)
      const layers: Array<{ kind: MacroParticleKind; y0: number; yCount: number; rMax: number }> = [
        { kind: 'ferro', y0: 0.15, yCount: 4, rMax: 1.5 },
        { kind: 'sand', y0: 0.9, yCount: 5, rMax: 1.55 },
        { kind: 'water', y0: 1.9, yCount: 7, rMax: 1.65 },
        { kind: 'oil', y0: 3.3, yCount: 6, rMax: 1.75 },
      ];
      for (const layer of layers) {
        for (let iy = 0; iy < layer.yCount; iy++) {
          for (let x = -layer.rMax; x <= layer.rMax; x += 0.22) {
            for (let z = -layer.rMax; z <= layer.rMax; z += 0.22) {
              if (x * x + z * z <= layer.rMax * layer.rMax) {
                seq += 1;
                spawnMacroParticle(
                  state,
                  layer.kind,
                  x + deterministicJitter(seq) * 0.02,
                  layer.y0 + iy * 0.19,
                  z + deterministicJitter(seq + 3) * 0.02,
                );
              }
            }
          }
        }
      }
      return { hasObstacle: false };
    }
    if (presetId === 'sand-pile') {
      for (let iy = 0; iy < 16; iy++) {
        for (let x = -1.4; x <= 1.4; x += 0.17) {
          for (let z = -1.4; z <= 1.4; z += 0.17) {
            if (x * x + z * z <= 1.4 * 1.4) {
              seq += 1;
              spawnMacroParticle(
                state,
                'sand',
                x + deterministicJitter(seq) * 0.02,
                1.0 + iy * 0.17,
                z + deterministicJitter(seq + 3) * 0.02,
              );
            }
          }
        }
      }
      return { hasObstacle: false };
    }
    if (presetId === 'dam-break') {
      for (let iy = 0; iy < 18; iy++) {
        for (let x = -1.2; x <= 1.2; x += 0.18) {
          for (let z = -1.2; z <= 1.2; z += 0.18) {
            if (x * x + z * z <= 1.2 * 1.2) {
              seq += 1;
              spawnMacroParticle(
                state,
                'water',
                x - 0.35 + deterministicJitter(seq) * 0.02,
                0.2 + iy * 0.18,
                z + deterministicJitter(seq + 5) * 0.02,
                1.2,
                0,
                0,
              );
            }
          }
        }
      }
      return { hasObstacle: false };
    }
    for (let iy = 0; iy < 10; iy++) {
      for (let x = -1.7; x <= 1.7; x += 0.21) {
        for (let z = -1.7; z <= 1.7; z += 0.21) {
          if (x * x + z * z <= 1.7 * 1.7) {
            seq += 1;
            spawnMacroParticle(
              state,
              'water',
              x + deterministicJitter(seq) * 0.02,
              0.2 + iy * 0.19,
              z + deterministicJitter(seq + 7) * 0.02,
            );
          }
        }
      }
    }
    for (let iy = 0; iy < 10; iy++) {
      for (let x = -0.95; x <= 0.95; x += 0.18) {
        for (let z = -0.95; z <= 0.95; z += 0.18) {
          if (x * x + z * z <= 0.95 * 0.95) {
            seq += 1;
            spawnMacroParticle(
              state,
              'sand',
              x + deterministicJitter(seq) * 0.02,
              2.8 + iy * 0.18,
              z + deterministicJitter(seq + 11) * 0.02,
            );
          }
        }
      }
    }
    return { hasObstacle: false };
  }

  if (presetId === 'cascade-maze') {
    for (let ix = 0; ix < 12; ix++) {
      for (let iy = 0; iy < 6; iy++) {
        for (let iz = 0; iz < 8; iz++) {
          seq += 1;
          spawnMacroParticle(
            state,
            'water',
            -3.8 + ix * 0.18 + deterministicJitter(seq) * 0.02,
            5.65 + iy * 0.17,
            -0.8 + iz * 0.22,
            1.4,
            0,
            0,
          );
        }
      }
    }
    for (let ix = 0; ix < 7; ix++) {
      for (let iy = 0; iy < 4; iy++) {
        for (let iz = 0; iz < 6; iz++) {
          seq += 1;
          spawnMacroParticle(
            state,
            'oil',
            -3.6 + ix * 0.19 + deterministicJitter(seq) * 0.02,
            5.8 + iy * 0.17,
            -0.6 + iz * 0.22,
            1.2,
            0,
            0,
          );
        }
      }
    }
    return { hasObstacle: true };
  }

  if (presetId === 'plinko-funnel') {
    for (let ix = 0; ix < 12; ix++) {
      for (let iy = 0; iy < 6; iy++) {
        for (let iz = 0; iz < 8; iz++) {
          seq += 1;
          spawnMacroParticle(
            state,
            ix % 3 === 0 ? 'sand' : 'water',
            -1.1 + ix * 0.19 + deterministicJitter(seq) * 0.02,
            5.65 + iy * 0.17,
            -0.8 + iz * 0.22,
          );
        }
      }
    }
    return { hasObstacle: true };
  }

  if (presetId === 'density-tower') {
    const bands: Array<{ kind: MacroParticleKind; yStart: number; yRows: number }> = [
      { kind: 'ferro', yStart: 0.15, yRows: 3 },
      { kind: 'sand', yStart: 0.75, yRows: 4 },
      { kind: 'water', yStart: 1.6, yRows: 6 },
      { kind: 'oil', yStart: 2.9, yRows: 5 },
    ];
    for (const band of bands) {
      for (let ix = 0; ix < 18; ix++) {
        for (let iy = 0; iy < band.yRows; iy++) {
          for (let iz = 0; iz < 8; iz++) {
            seq += 1;
            spawnMacroParticle(
              state,
              band.kind,
              -3.2 + ix * 0.36 + deterministicJitter(seq) * 0.03,
              band.yStart + iy * 0.19,
              -0.85 + iz * 0.24,
            );
          }
        }
      }
    }
    return { hasObstacle: false };
  }

  if (presetId === 'dam-break') {
    for (let ix = 0; ix < 14; ix++) {
      for (let iy = 0; iy < 20; iy++) {
        for (let iz = 0; iz < 10; iz++) {
          seq += 1;
          spawnMacroParticle(
            state,
            'water',
            -4.15 + ix * 0.17 + deterministicJitter(seq) * 0.03,
            0.2 + iy * 0.17,
            -0.85 + iz * 0.19 + deterministicJitter(seq + 9) * 0.03,
          );
        }
      }
    }
    return { hasObstacle: false };
  }

  if (presetId === 'sand-pile') {
    for (let ix = 0; ix < 14; ix++) {
      for (let iy = 0; iy < 18; iy++) {
        for (let iz = 0; iz < 10; iz++) {
          seq += 1;
          spawnMacroParticle(
            state,
            'sand',
            -1.15 + ix * 0.17 + deterministicJitter(seq) * 0.03,
            1.6 + iy * 0.17,
            -0.85 + iz * 0.19 + deterministicJitter(seq + 7) * 0.03,
          );
        }
      }
    }
    return { hasObstacle: false };
  }

  if (presetId === 'obstacle-splash') {
    for (let ix = 0; ix < 12; ix++) {
      for (let iy = 0; iy < 16; iy++) {
        for (let iz = 0; iz < 10; iz++) {
          seq += 1;
          spawnMacroParticle(
            state,
            'water',
            -4.1 + ix * 0.18 + deterministicJitter(seq) * 0.03,
            0.2 + iy * 0.18,
            -0.85 + iz * 0.19 + deterministicJitter(seq + 3) * 0.03,
            2.4,
            0,
            0,
          );
        }
      }
    }
    for (let ix = 0; ix < 8; ix++) {
      for (let iy = 0; iy < 8; iy++) {
        for (let iz = 0; iz < 8; iz++) {
          seq += 1;
          spawnMacroParticle(
            state,
            'sand',
            1.6 + ix * 0.17 + deterministicJitter(seq) * 0.02,
            0.15 + iy * 0.16,
            -0.7 + iz * 0.2,
          );
        }
      }
    }
    return { hasObstacle: true };
  }

  // Default: 'sand-into-water' — deep pool of water at bottom + fine sand stream dropping from above
  for (let ix = 0; ix < 24; ix++) {
    for (let iy = 0; iy < 8; iy++) {
      for (let iz = 0; iz < 10; iz++) {
        seq += 1;
        spawnMacroParticle(
          state,
          'water',
          -3.6 + ix * 0.31 + deterministicJitter(seq) * 0.03,
          0.16 + iy * 0.18,
          -0.95 + iz * 0.21 + deterministicJitter(seq + 5) * 0.03,
        );
      }
    }
  }
  for (let ix = 0; ix < 10; ix++) {
    for (let iy = 0; iy < 10; iy++) {
      for (let iz = 0; iz < 8; iz++) {
        seq += 1;
        spawnMacroParticle(
          state,
          'sand',
          -0.85 + ix * 0.17 + deterministicJitter(seq) * 0.03,
          2.6 + iy * 0.17,
          -0.65 + iz * 0.18 + deterministicJitter(seq + 11) * 0.03,
        );
      }
    }
  }
  return { hasObstacle: false };
}

function cellIndex(cx: number, cy: number, cz: number): number {
  return (cy * GRID_NZ + cz) * GRID_NX + cx;
}

function coordToCellX(x: number): number {
  return Math.max(0, Math.min(GRID_NX - 1, Math.floor((x - TANK_BOUNDS.minX) / CELL_SIZE)));
}

function coordToCellY(y: number): number {
  return Math.max(0, Math.min(GRID_NY - 1, Math.floor((y - TANK_BOUNDS.minY) / CELL_SIZE)));
}

function coordToCellZ(z: number): number {
  return Math.max(0, Math.min(GRID_NZ - 1, Math.floor((z - TANK_BOUNDS.minZ) / CELL_SIZE)));
}

export interface StirImpulse {
  active: boolean;
  mode?: 'stir' | 'magnet';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
}

export function stepSandWaterSimulation(
  state: SandWaterSimulationState,
  config: SandWaterConfig,
  dt = 1 / 60,
  stir?: StirImpulse,
  obstacles: ObstacleBox3D[] = [],
): void {
  const n = state.count;
  if (n === 0 || config.paused) return;

  const {
    kinds,
    px,
    py,
    pz,
    vx,
    vy,
    vz,
    fx,
    fy,
    fz,
    density,
    pressure,
    cellHead,
    cellNext,
  } = state;

  const substeps = 2;
  const subDt = Math.min(0.012, dt / substeps);
  const h2 = SMOOTHING_H * SMOOTHING_H;
  const poly6Coeff = 315.0 / (64.0 * Math.PI * Math.pow(SMOOTHING_H, 9));
  const spikyGradCoeff = -45.0 / (Math.PI * Math.pow(SMOOTHING_H, 6));
  const viscLapCoeff = 45.0 / (Math.PI * Math.pow(SMOOTHING_H, 6));

  const restDensity = 55.0;
  const gasK = 3.2 * config.stiffness;
  const viscMu = 0.04 + config.viscosity * 0.35;
  const sandKn = 650.0 * config.stiffness;
  const sandCn = 18.0;

  for (let sub = 0; sub < substeps; sub++) {
    // 1. Rebuild spatial hash
    cellHead.fill(-1);
    for (let i = 0; i < n; i++) {
      const cx = coordToCellX(px[i]!);
      const cy = coordToCellY(py[i]!);
      const cz = coordToCellZ(pz[i]!);
      const cIdx = cellIndex(cx, cy, cz);
      cellNext[i] = cellHead[cIdx]!;
      cellHead[cIdx] = i;
    }

    // 2. Fluid (water & oil) density & pressure pass
    for (let i = 0; i < n; i++) {
      const k = kinds[i]!;
      if (k === 1 || k === 3) {
        density[i] = restDensity;
        pressure[i] = 0;
        continue;
      }
      let rho = 0;
      const xi = px[i]!;
      const yi = py[i]!;
      const zi = pz[i]!;
      const cx0 = coordToCellX(xi);
      const cy0 = coordToCellY(yi);
      const cz0 = coordToCellZ(zi);

      for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(GRID_NY - 1, cy0 + 1); cy++) {
        for (let cz = Math.max(0, cz0 - 1); cz <= Math.min(GRID_NZ - 1, cz0 + 1); cz++) {
          for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(GRID_NX - 1, cx0 + 1); cx++) {
            let j = cellHead[cellIndex(cx, cy, cz)]!;
            while (j !== -1) {
              const dx = xi - px[j]!;
              const dy = yi - py[j]!;
              const dz = zi - pz[j]!;
              const r2 = dx * dx + dy * dy + dz * dz;
              if (r2 < h2) {
                const diff = h2 - r2;
                const massJ = particleMassFromCode(kinds[j]!);
                rho += massJ * poly6Coeff * diff * diff * diff;
              }
              j = cellNext[j]!;
            }
          }
        }
      }
      density[i] = Math.max(restDensity * 0.35, rho);
      pressure[i] =
        gasK *
        Math.max(0, density[i]! - restDensity * (k === 2 ? MATERIAL_DENSITY_G_CM3.oil : 1.0));
    }

    // 3. Accumulate pairwise forces
    for (let i = 0; i < n; i++) {
      const massI = particleMassFromCode(kinds[i]!);
      fx[i] = config.gravityX * massI;
      fy[i] = config.gravityY * massI;
      fz[i] = (config.gravityZ ?? 0) * massI;
    }

    for (let i = 0; i < n; i++) {
      const xi = px[i]!;
      const yi = py[i]!;
      const zi = pz[i]!;
      const vxi = vx[i]!;
      const vyi = vy[i]!;
      const vzi = vz[i]!;
      const kindI = kinds[i]!;
      const isFluidI = kindI === 0 || kindI === 2;
      const radI = particleRadiusFromCode(kindI);

      const cx0 = coordToCellX(xi);
      const cy0 = coordToCellY(yi);
      const cz0 = coordToCellZ(zi);

      for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(GRID_NY - 1, cy0 + 1); cy++) {
        for (let cz = Math.max(0, cz0 - 1); cz <= Math.min(GRID_NZ - 1, cz0 + 1); cz++) {
          for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(GRID_NX - 1, cx0 + 1); cx++) {
            let j = cellHead[cellIndex(cx, cy, cz)]!;
            while (j !== -1) {
              if (j > i) {
                const dx = xi - px[j]!;
                const dy = yi - py[j]!;
                const dz = zi - pz[j]!;
                const r2 = dx * dx + dy * dy + dz * dz;
                const kindJ = kinds[j]!;
                const isFluidJ = kindJ === 0 || kindJ === 2;
                const radJ = particleRadiusFromCode(kindJ);
                const minDist = radI + radJ;

                if (r2 < h2 && r2 > 1e-10) {
                  const r = Math.sqrt(r2);
                  const nx = dx / r;
                  const ny = dy / r;
                  const nz = dz / r;

                  if (isFluidI && isFluidJ) {
                    const hMinusR = SMOOTHING_H - r;
                    const pAvg = 0.5 * (pressure[i]! + pressure[j]!);
                    const fPress =
                      (-spikyGradCoeff * pAvg * hMinusR * hMinusR) / density[j]!;
                    const lapW = viscLapCoeff * hMinusR;
                    const viscBoost = kindI === 2 || kindJ === 2 ? 1.5 : 1.0;
                    const fViscScale = (viscMu * viscBoost * lapW) / density[j]!;
                    const immiscible = kindI !== kindJ ? 18.0 * (SMOOTHING_H - r) : 0;

                    const totalFx = (fPress + immiscible) * nx + fViscScale * (vx[j]! - vxi);
                    const totalFy = (fPress + immiscible) * ny + fViscScale * (vy[j]! - vyi);
                    const totalFz = (fPress + immiscible) * nz + fViscScale * (vz[j]! - vzi);

                    fx[i]! += totalFx;
                    fy[i]! += totalFy;
                    fz[i]! += totalFz;
                    fx[j]! -= totalFx;
                    fy[j]! -= totalFy;
                    fz[j]! -= totalFz;

                    if (r < minDist * 0.85) {
                      const pen = minDist * 0.85 - r;
                      const rep = 85.0 * pen;
                      fx[i]! += rep * nx;
                      fy[i]! += rep * ny;
                      fz[i]! += rep * nz;
                      fx[j]! -= rep * nx;
                      fy[j]! -= rep * ny;
                      fz[j]! -= rep * nz;
                    }
                  } else if (!isFluidI && !isFluidJ) {
                    if (r < minDist) {
                      const overlap = minDist - r;
                      const rvx = vxi - vx[j]!;
                      const rvy = vyi - vy[j]!;
                      const rvz = vzi - vz[j]!;
                      const vn = rvx * nx + rvy * ny + rvz * nz;
                      const fn = Math.max(0, sandKn * overlap - sandCn * vn);

                      const tvx = rvx - vn * nx;
                      const tvy = rvy - vn * ny;
                      const tvz = rvz - vn * nz;
                      const tMag = Math.sqrt(tvx * tvx + tvy * tvy + tvz * tvz);
                      const maxFric = config.sandFriction * fn;
                      const fricScale =
                        tMag > 1e-6 ? Math.min(maxFric, tMag * 18.0) / tMag : 0;

                      const totalFx = fn * nx - fricScale * tvx;
                      const totalFy = fn * ny - fricScale * tvy;
                      const totalFz = fn * nz - fricScale * tvz;

                      fx[i]! += totalFx;
                      fy[i]! += totalFy;
                      fz[i]! += totalFz;
                      fx[j]! -= totalFx;
                      fy[j]! -= totalFy;
                      fz[j]! -= totalFz;
                    }
                  } else {
                    if (r < minDist * 1.15) {
                      const overlap = Math.max(0, minDist - r);
                      const rvx = vxi - vx[j]!;
                      const rvy = vyi - vy[j]!;
                      const rvz = vzi - vz[j]!;
                      const vn = rvx * nx + rvy * ny + rvz * nz;
                      const fn = 95.0 * overlap - 4.5 * vn;
                      const drag = 4.2 + config.viscosity * 6.0;

                      const totalFx = fn * nx - drag * rvx;
                      const totalFy = fn * ny - drag * rvy;
                      const totalFz = fn * nz - drag * rvz;

                      fx[i]! += totalFx;
                      fy[i]! += totalFy;
                      fz[i]! += totalFz;
                      fx[j]! -= totalFx;
                      fy[j]! -= totalFy;
                      fz[j]! -= totalFz;
                    }
                  }
                }
              }
              j = cellNext[j]!;
            }
          }
        }
      }

      // Optional interactive stir or magnet impulse
      if (stir && stir.active) {
        const sdx = xi - stir.x;
        const sdy = yi - stir.y;
        const sdz = zi - stir.z;
        const sd2 = sdx * sdx + sdy * sdy + sdz * sdz;
        if (stir.mode === 'magnet' && kindI === 3) {
          const dist = Math.max(0.2, Math.sqrt(sd2));
          if (dist < stir.radius * 3.5) {
            const pull = 120.0 / (0.15 + sd2);
            fx[i]! -= (sdx / dist) * pull;
            fy[i]! -= (sdy / dist) * pull;
            fz[i]! -= (sdz / dist) * pull;
          }
        } else if (stir.mode !== 'magnet' && sd2 < stir.radius * stir.radius) {
          const w = 1.0 - Math.sqrt(sd2) / stir.radius;
          const massI = particleMassFromCode(kindI);
          fx[i]! += (stir.vx - vxi) * 28.0 * w * massI;
          fy[i]! += (stir.vy - vyi) * 28.0 * w * massI;
          fz[i]! += (stir.vz - vzi) * 28.0 * w * massI;
        }
      }
    }

    // 4. Integrate & resolve tank/obstacle boundaries
    for (let i = 0; i < n; i++) {
      const kindI = kinds[i]!;
      const rad = particleRadiusFromCode(kindI);
      const invMass = 1.0 / particleMassFromCode(kindI);

      let nvx = vx[i]! + fx[i]! * invMass * subDt;
      let nvy = vy[i]! + fy[i]! * invMass * subDt;
      let nvz = vz[i]! + fz[i]! * invMass * subDt;

      // Velocity cap for numerical stability
      const speed2 = nvx * nvx + nvy * nvy + nvz * nvz;
      if (speed2 > 225.0) {
        const scale = 15.0 / Math.sqrt(speed2);
        nvx *= scale;
        nvy *= scale;
        nvz *= scale;
      }

      let npx = px[i]! + nvx * subDt;
      let npy = py[i]! + nvy * subDt;
      let npz = pz[i]! + nvz * subDt;

      const bounce = kindI === 0 ? 0.25 : 0.12;
      const wallFric = kindI === 0 ? 0.99 : Math.max(0.4, 1.0 - config.sandFriction * 0.5);

      if (npy < TANK_BOUNDS.minY + rad) {
        npy = TANK_BOUNDS.minY + rad;
        if (nvy < 0) nvy = -nvy * bounce;
        nvx *= wallFric;
        nvz *= wallFric;
      } else if (npy > TANK_BOUNDS.maxY - rad) {
        npy = TANK_BOUNDS.maxY - rad;
        if (nvy > 0) nvy = -nvy * bounce;
      }

      if (config.isGlassMode) {
        const t = Math.max(0, Math.min(1, npy / 6.6));
        const rGlass = 2.05 + (2.75 - 2.05) * t - rad;
        const radXZ = Math.hypot(npx, npz);
        if (radXZ > rGlass && radXZ > 1e-6) {
          const nx = npx / radXZ;
          const nz = npz / radXZ;
          npx = nx * rGlass;
          npz = nz * rGlass;
          const vr = nvx * nx + nvz * nz;
          if (vr > 0) {
            nvx -= (1 + bounce) * vr * nx;
            nvz -= (1 + bounce) * vr * nz;
          }
          nvy *= wallFric;
        }
      } else {
        if (npx < TANK_BOUNDS.minX + rad) {
          npx = TANK_BOUNDS.minX + rad;
          if (nvx < 0) nvx = -nvx * bounce;
        } else if (npx > TANK_BOUNDS.maxX - rad) {
          npx = TANK_BOUNDS.maxX - rad;
          if (nvx > 0) nvx = -nvx * bounce;
        }

        if (npz < TANK_BOUNDS.minZ + rad) {
          npz = TANK_BOUNDS.minZ + rad;
          if (nvz < 0) nvz = -nvz * bounce;
        } else if (npz > TANK_BOUNDS.maxZ - rad) {
          npz = TANK_BOUNDS.maxZ - rad;
          if (nvz > 0) nvz = -nvz * bounce;
        }

        // Optional tilted 3D maze/funnel/barrier obstacles
        const activeObstacles =
          obstacles.length > 0
            ? obstacles
            : config.hasObstacle
              ? [{ cx: 0, cy: 1.25, cz: 0, hx: 0.35, hy: 1.25, hz: 2.05, angleZ: 0 }]
              : [];
        for (let oi = 0; oi < activeObstacles.length; oi++) {
          const ob = activeObstacles[oi]!;
          const cosA = Math.cos(ob.angleZ);
          const sinA = Math.sin(ob.angleZ);
          const dx = npx - ob.cx;
          const dy = npy - ob.cy;
          const lx = dx * cosA + dy * sinA;
          const ly = -dx * sinA + dy * cosA;
          const lz = npz - ob.cz;
          const ex = ob.hx + rad;
          const ey = ob.hy + rad;
          const ez = ob.hz + rad;
          if (Math.abs(lx) < ex && Math.abs(ly) < ey && Math.abs(lz) < ez) {
            const pxPen = ex - Math.abs(lx);
            const pyPen = ey - Math.abs(ly);
            const pzPen = ez - Math.abs(lz);
            const lvx = nvx * cosA + nvy * sinA;
            const lvy = -nvx * sinA + nvy * cosA;
            let nlx = lx;
            let nly = ly;
            let nlvx = lvx;
            let nlvy = lvy;
            if (pyPen <= pxPen && pyPen <= pzPen) {
              nly = ly >= 0 ? ey : -ey;
              if ((ly >= 0 && lvy < 0) || (ly < 0 && lvy > 0)) nlvy = -lvy * bounce;
              nlvx *= wallFric;
              nvz *= wallFric;
            } else if (pxPen <= pzPen) {
              nlx = lx >= 0 ? ex : -ex;
              if ((lx >= 0 && lvx < 0) || (lx < 0 && lvx > 0)) nlvx = -lvx * bounce;
            } else {
              npz = ob.cz + (lz >= 0 ? ez : -ez);
              if ((lz >= 0 && nvz < 0) || (lz < 0 && nvz > 0)) nvz = -nvz * bounce;
            }
            npx = ob.cx + nlx * cosA - nly * sinA;
            npy = ob.cy + nlx * sinA + nly * cosA;
            nvx = nlvx * cosA - nlvy * sinA;
            nvy = nlvx * sinA + nlvy * cosA;
          }
        }
      }

      px[i] = npx;
      py[i] = npy;
      pz[i] = npz;
      vx[i] = nvx;
      vy[i] = nvy;
      vz[i] = nvz;
    }
  }

  state.stepCount += 1;
}

export function applyShakeImpulse(state: SandWaterSimulationState): void {
  for (let i = 0; i < state.count; i++) {
    state.vx[i]! += deterministicJitter(i + state.stepCount) * 7.5;
    state.vy[i]! += 4.5 + Math.abs(deterministicJitter(i * 3 + state.stepCount)) * 4.0;
    state.vz[i]! += deterministicJitter(i * 7 + state.stepCount) * 5.0;
  }
}

export function computeSandWaterStats(state: SandWaterSimulationState): {
  waterCount: number;
  sandCount: number;
  oilCount: number;
  ferroCount: number;
  avgSandY: number;
  avgWaterY: number;
  kineticEnergy: number;
} {
  let waterCount = 0;
  let sandCount = 0;
  let oilCount = 0;
  let ferroCount = 0;
  let sumSandY = 0;
  let sumWaterY = 0;
  let ke = 0;

  for (let i = 0; i < state.count; i++) {
    const v2 =
      state.vx[i]! * state.vx[i]! +
      state.vy[i]! * state.vy[i]! +
      state.vz[i]! * state.vz[i]!;
    const k = state.kinds[i]!;
    ke += 0.5 * particleMassFromCode(k) * v2;
    if (k === 0) {
      waterCount += 1;
      sumWaterY += state.py[i]!;
    } else if (k === 1) {
      sandCount += 1;
      sumSandY += state.py[i]!;
    } else if (k === 2) {
      oilCount += 1;
    } else {
      ferroCount += 1;
    }
  }

  return {
    waterCount,
    sandCount,
    oilCount,
    ferroCount,
    avgSandY: sandCount > 0 ? sumSandY / sandCount : 0,
    avgWaterY: waterCount > 0 ? sumWaterY / waterCount : 0,
    kineticEnergy: ke,
  };
}
