export type MacroParticleKind = 'water' | 'sand';

export type SandWaterPresetId =
  | 'sand-into-water'
  | 'dam-break'
  | 'sand-pile'
  | 'obstacle-splash';

export interface SandWaterConfig {
  gravityY: number;
  gravityX: number;
  viscosity: number;
  sandFriction: number;
  stiffness: number;
  hasObstacle: boolean;
  paused: boolean;
}

export const DEFAULT_SAND_WATER_CONFIG: SandWaterConfig = {
  gravityY: -18.0,
  gravityX: 0.0,
  viscosity: 0.35,
  sandFriction: 0.55,
  stiffness: 1.0,
  hasObstacle: false,
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
  state.kinds[idx] = kind === 'water' ? 0 : 1;
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
): { hasObstacle: boolean } {
  state.count = 0;
  state.stepCount = 0;
  let seq = 1;

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

    // 2. Water density & pressure pass
    for (let i = 0; i < n; i++) {
      if (kinds[i] !== 0) {
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
                const massJ = kinds[j] === 0 ? 1.0 : 0.7;
                rho += massJ * poly6Coeff * diff * diff * diff;
              }
              j = cellNext[j]!;
            }
          }
        }
      }
      density[i] = Math.max(restDensity * 0.35, rho);
      pressure[i] = gasK * Math.max(0, density[i]! - restDensity);
    }

    // 3. Accumulate pairwise forces
    for (let i = 0; i < n; i++) {
      const massI = kinds[i] === 0 ? 1.0 : 2.4;
      fx[i] = config.gravityX * massI;
      fy[i] = config.gravityY * massI;
      fz[i] = 0;
    }

    for (let i = 0; i < n; i++) {
      const xi = px[i]!;
      const yi = py[i]!;
      const zi = pz[i]!;
      const vxi = vx[i]!;
      const vyi = vy[i]!;
      const vzi = vz[i]!;
      const kindI = kinds[i]!;
      const radI = kindI === 0 ? WATER_RADIUS : SAND_RADIUS;

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
                const radJ = kindJ === 0 ? WATER_RADIUS : SAND_RADIUS;
                const minDist = radI + radJ;

                if (r2 < h2 && r2 > 1e-10) {
                  const r = Math.sqrt(r2);
                  const nx = dx / r;
                  const ny = dy / r;
                  const nz = dz / r;

                  if (kindI === 0 && kindJ === 0) {
                    // Water-Water SPH pressure + viscosity
                    const hMinusR = SMOOTHING_H - r;
                    const pAvg = 0.5 * (pressure[i]! + pressure[j]!);
                    const fPress =
                      (-spikyGradCoeff * pAvg * hMinusR * hMinusR) / density[j]!;
                    const lapW = viscLapCoeff * hMinusR;
                    const fViscScale = (viscMu * lapW) / density[j]!;

                    const totalFx = fPress * nx + fViscScale * (vx[j]! - vxi);
                    const totalFy = fPress * ny + fViscScale * (vy[j]! - vyi);
                    const totalFz = fPress * nz + fViscScale * (vz[j]! - vzi);

                    fx[i]! += totalFx;
                    fy[i]! += totalFy;
                    fz[i]! += totalFz;
                    fx[j]! -= totalFx;
                    fy[j]! -= totalFy;
                    fz[j]! -= totalFz;

                    // Short-range soft core to keep water droplets well-spaced
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
                  } else if (kindI === 1 && kindJ === 1) {
                    // Sand-Sand DEM granular contact + Coulomb friction
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
                    // Sand-Water coupling: contact repulsion + fluid drag + buoyant pressure
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

      // Optional interactive stir impulse
      if (stir && stir.active) {
        const sdx = xi - stir.x;
        const sdy = yi - stir.y;
        const sdz = zi - stir.z;
        const sd2 = sdx * sdx + sdy * sdy + sdz * sdz;
        if (sd2 < stir.radius * stir.radius) {
          const w = 1.0 - Math.sqrt(sd2) / stir.radius;
          const massI = kindI === 0 ? 1.0 : 2.4;
          fx[i]! += (stir.vx - vxi) * 28.0 * w * massI;
          fy[i]! += (stir.vy - vyi) * 28.0 * w * massI;
          fz[i]! += (stir.vz - vzi) * 28.0 * w * massI;
        }
      }
    }

    // 4. Integrate & resolve tank/obstacle boundaries
    for (let i = 0; i < n; i++) {
      const kindI = kinds[i]!;
      const rad = kindI === 0 ? WATER_RADIUS : SAND_RADIUS;
      const invMass = kindI === 0 ? 1.0 : 1.0 / 2.4;

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

      if (npx < TANK_BOUNDS.minX + rad) {
        npx = TANK_BOUNDS.minX + rad;
        if (nvx < 0) nvx = -nvx * bounce;
      } else if (npx > TANK_BOUNDS.maxX - rad) {
        npx = TANK_BOUNDS.maxX - rad;
        if (nvx > 0) nvx = -nvx * bounce;
      }

      if (npy < TANK_BOUNDS.minY + rad) {
        npy = TANK_BOUNDS.minY + rad;
        if (nvy < 0) nvy = -nvy * bounce;
        nvx *= wallFric;
        nvz *= wallFric;
      } else if (npy > TANK_BOUNDS.maxY - rad) {
        npy = TANK_BOUNDS.maxY - rad;
        if (nvy > 0) nvy = -nvy * bounce;
      }

      if (npz < TANK_BOUNDS.minZ + rad) {
        npz = TANK_BOUNDS.minZ + rad;
        if (nvz < 0) nvz = -nvz * bounce;
      } else if (npz > TANK_BOUNDS.maxZ - rad) {
        npz = TANK_BOUNDS.maxZ - rad;
        if (nvz > 0) nvz = -nvz * bounce;
      }

      // Optional center barrier obstacle
      if (config.hasObstacle) {
        const oMinX = OBSTACLE_BOX.minX - rad;
        const oMaxX = OBSTACLE_BOX.maxX + rad;
        const oMaxY = OBSTACLE_BOX.maxY + rad;
        if (npx > oMinX && npx < oMaxX && npy < oMaxY) {
          const penLeft = npx - oMinX;
          const penRight = oMaxX - npx;
          const penTop = oMaxY - npy;
          if (penTop <= penLeft && penTop <= penRight) {
            npy = oMaxY;
            if (nvy < 0) nvy = -nvy * bounce;
            nvx *= wallFric;
            nvz *= wallFric;
          } else if (penLeft < penRight) {
            npx = oMinX;
            if (nvx > 0) nvx = -nvx * bounce;
          } else {
            npx = oMaxX;
            if (nvx < 0) nvx = -nvx * bounce;
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
  avgSandY: number;
  avgWaterY: number;
  kineticEnergy: number;
} {
  let waterCount = 0;
  let sandCount = 0;
  let sumSandY = 0;
  let sumWaterY = 0;
  let ke = 0;

  for (let i = 0; i < state.count; i++) {
    const v2 =
      state.vx[i]! * state.vx[i]! +
      state.vy[i]! * state.vy[i]! +
      state.vz[i]! * state.vz[i]!;
    if (state.kinds[i] === 0) {
      waterCount += 1;
      sumWaterY += state.py[i]!;
      ke += 0.5 * 1.0 * v2;
    } else {
      sandCount += 1;
      sumSandY += state.py[i]!;
      ke += 0.5 * 2.4 * v2;
    }
  }

  return {
    waterCount,
    sandCount,
    avgSandY: sandCount > 0 ? sumSandY / sandCount : 0,
    avgWaterY: waterCount > 0 ? sumWaterY / waterCount : 0,
    kineticEnergy: ke,
  };
}
