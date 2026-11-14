import { describe, expect, it, vi } from 'vitest';
import { EXAMPLE_MOLECULES } from '@matterlab/domain';
import {
  ScienceApiError,
  fromApiMoleculeDto,
  toApiMoleculeDto,
  validateMoleculeWithRdkit,
} from '../src/index.js';

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
});
