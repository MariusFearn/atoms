import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAND_WATER_CONFIG,
  TANK_BOUNDS,
  applyShakeImpulse,
  computeSandWaterStats,
  createSandWaterState,
  getObstaclesForPreset,
  loadSandWaterPreset,
  stepSandWaterSimulation,
} from '../src/granularFluid.js';

describe('Sand & Water SPH+DEM Macroscopic Sandbox', () => {
  it('simulates sand sinking below water without NaNs and respects tank bounds', () => {
    const state = createSandWaterState();
    loadSandWaterPreset(state, 'sand-into-water');
    const startStats = computeSandWaterStats(state);
    expect(startStats.waterCount).toBeGreaterThan(200);
    expect(startStats.sandCount).toBeGreaterThan(100);
    expect(startStats.avgSandY).toBeGreaterThan(startStats.avgWaterY);

    for (let s = 0; s < 140; s++) {
      stepSandWaterSimulation(state, DEFAULT_SAND_WATER_CONFIG, 1 / 60);
    }

    const endStats = computeSandWaterStats(state);
    expect(Number.isFinite(endStats.kineticEnergy)).toBe(true);
    // Denser sand (2.4x) sinks below the displaced water
    expect(endStats.avgSandY).toBeLessThan(endStats.avgWaterY);

    for (let i = 0; i < state.count; i++) {
      expect(state.px[i]!).toBeGreaterThanOrEqual(TANK_BOUNDS.minX);
      expect(state.px[i]!).toBeLessThanOrEqual(TANK_BOUNDS.maxX);
      expect(state.py[i]!).toBeGreaterThanOrEqual(TANK_BOUNDS.minY);
      expect(state.py[i]!).toBeLessThanOrEqual(TANK_BOUNDS.maxY);
    }
  });

  it('supports dam-break, obstacle, and shake impulse', () => {
    const state = createSandWaterState();
    const { hasObstacle } = loadSandWaterPreset(state, 'obstacle-splash');
    expect(hasObstacle).toBe(true);

    const cfg = { ...DEFAULT_SAND_WATER_CONFIG, hasObstacle };
    for (let s = 0; s < 40; s++) {
      stepSandWaterSimulation(state, cfg, 1 / 60);
    }
    applyShakeImpulse(state);
    const stats = computeSandWaterStats(state);
    expect(stats.kineticEnergy).toBeGreaterThan(10);
  });

  it('supports 4-material density tower and 3D cascade maze obstacles', () => {
    const state = createSandWaterState();
    loadSandWaterPreset(state, 'density-tower', false);
    const towerStats = computeSandWaterStats(state);
    expect(towerStats.waterCount).toBeGreaterThan(0);
    expect(towerStats.sandCount).toBeGreaterThan(0);
    expect(towerStats.oilCount).toBeGreaterThan(0);
    expect(towerStats.ferroCount).toBeGreaterThan(0);

    const mazeObs = getObstaclesForPreset('cascade-maze', true, false);
    expect(mazeObs.length).toBeGreaterThanOrEqual(5);
    loadSandWaterPreset(state, 'cascade-maze', false);
    for (let s = 0; s < 20; s++) {
      stepSandWaterSimulation(state, DEFAULT_SAND_WATER_CONFIG, 1 / 60, undefined, mazeObs);
    }
    expect(Number.isFinite(computeSandWaterStats(state).kineticEnergy)).toBe(true);
  });
});
