import { describe, expect, it, vi } from 'vitest';
import { EXAMPLE_MOLECULES } from '@matterlab/domain';
import {
  ScienceApiError,
  fromApiMoleculeDto,
  runNuclearSandboxSimulation,
  toApiMoleculeDto,
  toApiNuclearForceConfigDto,
  toApiNuclearParticleDto,
  validateMoleculeWithRdkit,
} from '../src/index.js';
import { NUCLEAR_PRESETS } from '@matterlab/domain';

describe('simulation-client boundary mapping and error handling', () => {
  it('maps camelCase Molecule to snake_case DTO and back cleanly', () => {
    const benzene = EXAMPLE_MOLECULES.find((e) => e.id === 'benzene')!.molecule;
    const dto = toApiMoleculeDto(benzene);

    expect(dto.revision_id).toBe(benzene.revisionId);
    expect(dto.net_charge).toBe(0);
    expect(dto.atoms[0]?.position_angstrom).toEqual(benzene.atoms[0]?.positionAngstrom);
    expect(dto.bonds[0]?.atom_a).toBe(benzene.bonds[0]?.atomA);

    const roundTripped = fromApiMoleculeDto(dto);
    expect(roundTripped.atoms).toHaveLength(12);
    expect(roundTripped.bonds).toHaveLength(12);
    expect(roundTripped.atoms[0]?.aromatic).toBe(true);
    expect(roundTripped.bonds[0]?.order).toBe('aromatic');
  });

  it('surfaces typed ScienceApiError from structured FastAPI error responses', async () => {
    const water = EXAMPLE_MOLECULES[0]!.molecule;
    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          detail: {
            code: 'UNSUPPORTED_ELEMENT',
            message: 'Element Fe is outside approved baseline.',
            field_path: 'molecule.atoms[0].element',
            retryable: false,
          },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    await expect(
      validateMoleculeWithRdkit(water, { fetchImpl: mockFetch }),
    ).rejects.toMatchObject({
      name: 'ScienceApiError',
      code: 'UNSUPPORTED_ELEMENT',
      fieldPath: 'molecule.atoms[0].element',
      retryable: false,
      httpStatus: 422,
    } satisfies Partial<ScienceApiError>);
  });

  it('maps nuclear sandbox request/response contracts cleanly', async () => {
    const c12 = NUCLEAR_PRESETS.find((p) => p.id === 'c12-three-alpha')!;
    const pDto = toApiNuclearParticleDto(c12.particles[0]!);
    const fDto = toApiNuclearForceConfigDto(c12.recommendedForceConfig);
    expect(pDto.position_fm).toEqual(c12.particles[0]!.positionFm);
    expect(fDto.nuclear_attraction_mev).toBe(c12.recommendedForceConfig.nuclearAttractionMev);

    const mockFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          preset_id: 'c12-three-alpha',
          model_label: 'Exploratory Toy Classical N-Body Model (Not Quantum Nuclear Physics)',
          disclaimer: 'Exploratory toy model',
          assumptions: ['Classical point particles'],
          limitations: ['Not quantum nuclear physics'],
          particle_ids: ['a1', 'a2', 'a3'],
          particle_kinds: ['alpha', 'alpha', 'alpha'],
          stability_verdict: 'bound-oscillating',
          verdict_explanation: 'Stayed bound',
          initial_total_energy_mev: -9.3,
          final_total_energy_mev: -9.3,
          energy_drift_mev: 0.0,
          final_cluster_energy_mev: -9.3,
          reference_benchmark: null,
          frames: [
            {
              frame_index: 0,
              step: 0,
              time_fc: 0,
              kinetic_energy_mev: 0.8,
              coulomb_energy_mev: 5.6,
              nuclear_energy_mev: -15.7,
              gravity_energy_mev: -1e-35,
              potential_energy_mev: -10.1,
              total_energy_mev: -9.3,
              min_pair_distance_fm: 3.05,
              max_pair_distance_fm: 3.05,
              positions_fm: c12.particles.map((p) => p.positionFm),
              force_vectors_mev_fm: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const result = await runNuclearSandboxSimulation(
      c12.id,
      c12.particles,
      c12.recommendedForceConfig,
      { fetchImpl: mockFetch },
    );
    expect(result.stabilityVerdict).toBe('bound-oscillating');
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]!.coulombEnergyMev).toBeCloseTo(5.6, 5);
  });
});
