import type {
  ExperimentConfig,
  ExperimentJobInfo,
  ExperimentResults,
  Molecule,
  SimulationModelPreset,
} from '@matterlab/domain';
import {
  type ApiCapabilitiesResponseDto,
  type ApiConformerResponseDto,
  type ApiErrorPayload,
  type ApiExperimentJobDto,
  type ApiExperimentResultsDto,
  type ApiMolExportResponseDto,
  type ApiMolImportResponseDto,
  type ApiSimulationPresetDto,
  type ApiValidationResponseDto,
  type RdkitConformerResult,
  type RdkitValidationResult,
  fromApiJobDto,
  fromApiMoleculeDto,
  fromApiPresetDto,
  fromApiResultsDto,
  toApiExperimentRequestDto,
  toApiMoleculeDto,
} from './contracts.js';

export class ScienceApiError extends Error {
  readonly code: string;
  readonly fieldPath: string | null;
  readonly retryable: boolean;
  readonly httpStatus: number;

  constructor(
    code: string,
    message: string,
    options: { fieldPath?: string | null; retryable?: boolean; httpStatus?: number } = {},
  ) {
    super(message);
    this.name = 'ScienceApiError';
    this.code = code;
    this.fieldPath = options.fieldPath ?? null;
    this.retryable = options.retryable ?? false;
    this.httpStatus = options.httpStatus ?? 0;
  }
}

export interface ScienceClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function getBaseUrl(options?: ScienceClientOptions): string {
  return options?.baseUrl ?? '';
}

function getFetch(options?: ScienceClientOptions): typeof fetch {
  return options?.fetchImpl ?? fetch;
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  options?: ScienceClientOptions,
): Promise<T> {
  const url = `${getBaseUrl(options)}${path}`;
  let response: Response;
  try {
    response = await getFetch(options)(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ScienceApiError(
      'SERVICE_UNAVAILABLE',
      `Unable to reach MatterLab Science API: ${err instanceof Error ? err.message : String(err)}`,
      { retryable: true, httpStatus: 0 },
    );
  }

  if (!response.ok) {
    let detail: ApiErrorPayload | undefined;
    try {
      const body = (await response.json()) as { detail?: ApiErrorPayload };
      detail = body.detail;
    } catch {
      detail = undefined;
    }
    if (detail && typeof detail.code === 'string' && typeof detail.message === 'string') {
      throw new ScienceApiError(detail.code, detail.message, {
        fieldPath: detail.field_path ?? null,
        retryable: Boolean(detail.retryable),
        httpStatus: response.status,
      });
    }
    throw new ScienceApiError(
      'HTTP_ERROR',
      `Science API request failed with HTTP ${response.status}.`,
      { retryable: response.status >= 500, httpStatus: response.status },
    );
  }

  return (await response.json()) as T;
}

export async function fetchCapabilities(
  options?: ScienceClientOptions,
): Promise<ApiCapabilitiesResponseDto> {
  return requestJson<ApiCapabilitiesResponseDto>(
    '/api/v1/capabilities',
    { method: 'GET' },
    options,
  );
}

export async function validateMoleculeWithRdkit(
  molecule: Molecule,
  options?: ScienceClientOptions,
): Promise<RdkitValidationResult> {
  const dto = await requestJson<ApiValidationResponseDto>(
    '/api/v1/molecules/validate',
    {
      method: 'POST',
      body: JSON.stringify({ molecule: toApiMoleculeDto(molecule) }),
    },
    options,
  );

  return {
    structureRevisionId: dto.structure_revision_id,
    status: dto.status,
    readyForConformerGeneration: dto.ready_for_conformer_generation,
    readyForMd: dto.ready_for_md,
    engine: dto.engine,
    engineVersion: dto.engine_version,
    assumptions: dto.assumptions,
    limitations: dto.limitations,
    descriptors: dto.descriptors
      ? {
          explicitFormula: dto.descriptors.explicit_formula,
          canonicalSmiles: dto.descriptors.canonical_smiles,
          inchikey: dto.descriptors.inchikey,
          atomCount: dto.descriptors.atom_count,
          heavyAtomCount: dto.descriptors.heavy_atom_count,
          bondCount: dto.descriptors.bond_count,
          molecularMassU: dto.descriptors.molecular_mass_u,
          exactMassU: dto.descriptors.exact_mass_u,
          rotatableBondCount: dto.descriptors.rotatable_bond_count,
          ringCount: dto.descriptors.ring_count,
          aromaticAtomCount: dto.descriptors.aromatic_atom_count,
          hbdCount: dto.descriptors.hbd_count,
          hbaCount: dto.descriptors.hba_count,
          tpsaAngstrom2: dto.descriptors.tpsa_angstrom2,
        }
      : null,
    diagnostics: dto.diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
      message: d.message,
      fieldPath: d.field_path,
      atomIds: d.atom_ids,
      bondIds: d.bond_ids,
    })),
  };
}

export async function generateConformerWithRdkit(
  molecule: Molecule,
  randomSeed = 42,
  options?: ScienceClientOptions,
): Promise<RdkitConformerResult> {
  const dto = await requestJson<ApiConformerResponseDto>(
    '/api/v1/molecules/conformers',
    {
      method: 'POST',
      body: JSON.stringify({
        molecule: toApiMoleculeDto(molecule),
        random_seed: randomSeed,
      }),
    },
    options,
  );

  return {
    sourceRevisionId: dto.source_revision_id,
    method: dto.method,
    engine: dto.engine,
    engineVersion: dto.engine_version,
    randomSeed: dto.random_seed,
    energyMinimized: dto.energy_minimized,
    geometryStatus: dto.geometry_status,
    distanceUnit: dto.distance_unit,
    assumptions: dto.assumptions,
    limitations: dto.limitations,
    positionsAngstrom: dto.positions_angstrom,
  };
}

export async function importMolBlockWithRdkit(
  molText: string,
  name?: string,
  options?: ScienceClientOptions,
): Promise<{
  molecule: Molecule;
  engine: string;
  engineVersion: string;
  warnings: string[];
}> {
  const dto = await requestJson<ApiMolImportResponseDto>(
    '/api/v1/molecules/import/mol',
    {
      method: 'POST',
      body: JSON.stringify({ mol_text: molText, name: name ?? null }),
    },
    options,
  );

  return {
    molecule: fromApiMoleculeDto(dto.molecule),
    engine: dto.engine,
    engineVersion: dto.engine_version,
    warnings: dto.warnings,
  };
}

export async function exportMolBlockWithRdkit(
  molecule: Molecule,
  options?: ScienceClientOptions,
): Promise<{
  structureRevisionId: string;
  molBlock: string;
  engine: string;
  engineVersion: string;
  warnings: string[];
}> {
  const dto = await requestJson<ApiMolExportResponseDto>(
    '/api/v1/molecules/export/mol',
    {
      method: 'POST',
      body: JSON.stringify({ molecule: toApiMoleculeDto(molecule) }),
    },
    options,
  );

  return {
    structureRevisionId: dto.structure_revision_id,
    molBlock: dto.mol_block,
    engine: dto.engine,
    engineVersion: dto.engine_version,
    warnings: dto.warnings,
  };
}

export async function listSimulationPresets(
  options?: ScienceClientOptions,
): Promise<SimulationModelPreset[]> {
  const dtos = await requestJson<ApiSimulationPresetDto[]>(
    '/api/v1/experiments/presets',
    { method: 'GET' },
    options,
  );
  return dtos.map(fromApiPresetDto);
}

export async function submitExperimentJob(
  molecule: Molecule,
  config: ExperimentConfig,
  idempotencyKey: string,
  options?: ScienceClientOptions,
): Promise<ExperimentJobInfo> {
  const dto = await requestJson<ApiExperimentJobDto>(
    '/api/v1/experiments',
    {
      method: 'POST',
      body: JSON.stringify(toApiExperimentRequestDto(molecule, config, idempotencyKey)),
    },
    options,
  );
  return fromApiJobDto(dto);
}

export async function getExperimentStatus(
  jobId: string,
  options?: ScienceClientOptions,
): Promise<ExperimentJobInfo> {
  const dto = await requestJson<ApiExperimentJobDto>(
    `/api/v1/experiments/${encodeURIComponent(jobId)}`,
    { method: 'GET' },
    options,
  );
  return fromApiJobDto(dto);
}

export async function cancelExperimentJob(
  jobId: string,
  options?: ScienceClientOptions,
): Promise<ExperimentJobInfo> {
  const dto = await requestJson<ApiExperimentJobDto>(
    `/api/v1/experiments/${encodeURIComponent(jobId)}/cancel`,
    { method: 'POST' },
    options,
  );
  return fromApiJobDto(dto);
}

export async function getExperimentResults(
  jobId: string,
  options?: ScienceClientOptions,
): Promise<ExperimentResults> {
  const dto = await requestJson<ApiExperimentResultsDto>(
    `/api/v1/experiments/${encodeURIComponent(jobId)}/results`,
    { method: 'GET' },
    options,
  );
  return fromApiResultsDto(dto);
}
