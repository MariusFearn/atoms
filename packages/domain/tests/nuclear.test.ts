import { describe, expect, it } from 'vitest';
import {
  ALPHA_MASS_MEV_C2,
  GRAVITY_MEV_FM_PER_MEV2,
  NUCLEAR_COULOMB_KE_E2_MEV_FM,
  NUCLEAR_GUIDED_EXPERIMENTS,
  NUCLEAR_PRESETS,
  computeHydrogenTransition,
  evaluateHydrogenicPsi,
  evaluateMassDefectGravityHypothesis,
  getNuclearPresetById,
  mevToAtomicMassU,
} from '../src/index.js';

describe('Nuclear cluster sandbox domain data', () => {
  it('provides valid finite presets with consistent cluster edges', () => {
    expect(NUCLEAR_PRESETS.length).toBeGreaterThanOrEqual(5);
    for (const preset of NUCLEAR_PRESETS) {
      const ids = new Set(preset.particles.map((p) => p.id));
      expect(ids.size).toBe(preset.particles.length);

      for (const p of preset.particles) {
        expect(p.massMevC2).toBeGreaterThan(0);
        for (const coord of p.positionFm) {
          expect(Number.isFinite(coord)).toBe(true);
        }
        for (const vel of p.velocityC) {
          expect(Number.isFinite(vel)).toBe(true);
        }
      }

      for (const [a, b] of preset.clusterEdges) {
        expect(ids.has(a)).toBe(true);
        expect(ids.has(b)).toBe(true);
        expect(a).not.toBe(b);
      }
    }
  });

  it('keeps Coulomb vs real gravity ratio at ~10^36 for two alpha particles', () => {
    const coulombAt1Fm = NUCLEAR_COULOMB_KE_E2_MEV_FM * 2 * 2;
    const gravityAt1Fm = GRAVITY_MEV_FM_PER_MEV2 * ALPHA_MASS_MEV_C2 * ALPHA_MASS_MEV_C2;
    const ratio = coulombAt1Fm / gravityAt1Fm;
    expect(ratio).toBeGreaterThan(1e35);
    expect(ratio).toBeLessThan(1e37);
  });

  it('references existing presets from all guided experiments and converts MeV to u', () => {
    for (const exp of NUCLEAR_GUIDED_EXPERIMENTS) {
      const preset = getNuclearPresetById(exp.presetId);
      expect(preset.id).toBe(exp.presetId);
    }
    expect(mevToAtomicMassU(931.49410242)).toBeCloseTo(1.0, 6);
    expect(getNuclearPresetById('b11-proton-fusion').particles).toHaveLength(6);
  });

  it('evaluates hydrogenic standing-wave nodes and Balmer-alpha spectral line accurately', () => {
    // 2s has a radial node at r = 2 a0
    expect(evaluateHydrogenicPsi('2s', 2.0, 0, 0)).toBeCloseTo(0, 8);
    // 2pz has an xy nodal plane at z = 0
    expect(evaluateHydrogenicPsi('2pz', 1.5, 1.5, 0)).toBeCloseTo(0, 8);
    expect(evaluateHydrogenicPsi('2pz', 0, 0, 2.0)).toBeGreaterThan(0);
    expect(evaluateHydrogenicPsi('2pz', 0, 0, -2.0)).toBeLessThan(0);

    const hAlpha = computeHydrogenTransition(3, 2, 'H-1');
    expect(hAlpha.seriesName).toBe('Balmer series');
    expect(hAlpha.wavelengthNm).toBeCloseTo(656.47, 1);

    const dAlpha = computeHydrogenTransition(3, 2, 'H-2');
    expect(dAlpha.shiftFromProtiumNm).toBeCloseTo(-0.1786, 3);
  });

  it('quantifies Equivalence Principle violations under mass-defect gravity hypothesis', () => {
    const res100 = evaluateMassDefectGravityHypothesis('H-1', 'Fe-56', 1.0);
    expect(res100.predictedDeltaGOverG).toBeCloseTo(2.0, 4);
    expect(res100.violationRatio).toBeGreaterThan(1e14);

    const res0 = evaluateMassDefectGravityHypothesis('H-1', 'Fe-56', 0.0);
    expect(res0.predictedDeltaGOverG).toBe(0);
  });
});
