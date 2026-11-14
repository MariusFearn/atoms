import type {
  Atom,
  Bond,
  BondOrder,
  ExperimentConfig,
  ExperimentJobInfo,
  ExperimentResults,
  Molecule,
  NuclearClusterPreset,
  NuclearForceConfig,
  NuclearParticle,
  NuclearParticleKind,
  NuclearSimulationResult,
  NuclearStabilityVerdict,
  QuantumJobConfig,
  QuantumJobInfo,
  QuantumModelPreset,
  QuantumResults,
  SimulationJobStatus,
  SimulationModelPreset,
} from '@matterlab/domain';

export interface ApiErrorPayload {
  code: string;
  message: string;
  field_path?: string | null;
  retryable: boolean;
}

export interface ApiAtomDto {
  id: string;
  element: string;
  isotope: number | null;
  position_angstrom: [number, number, number];
  formal_charge: number;
  aromatic: boolean;
}

export interface ApiBondDto {
  id: string;
  atom_a: string;
  atom_b: string;
  order: 1 | 2 | 3 | 'aromatic';
}

export interface ApiMoleculeInputDto {
  id: string;
  name: string;
  revision_id: string;
  atoms: ApiAtomDto[];
  bonds: ApiBondDto[];
  net_charge: number;
  spin_multiplicity?: number | null;
}

export interface ApiDiagnosticDto {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  field_path: string | null;
  atom_ids: string[];
  bond_ids: string[];
}

export interface ApiMolecularDescriptorsDto {
  explicit_formula: string;
  canonical_smiles: string | null;
  inchikey: string | null;
  atom_count: number;
  heavy_atom_count: number;
  bond_count: number;
  molecular_mass_u: number;
  exact_mass_u: number;
  rotatable_bond_count: number;
  ring_count: number;
  aromatic_atom_count: number;
  hbd_count: number;
  hba_count: number;
  tpsa_angstrom2: number;
}

export interface ApiValidationResponseDto {
  structure_revision_id: string;
  status:
    | 'valid-rdkit'
    | 'incomplete-draft'
    | 'invalid-valence'
    | 'unsupported-chemistry'
    | 'integrity-error';
  ready_for_conformer_generation: boolean;
  ready_for_md: boolean;
  engine: string;
  engine_version: string;
  assumptions: string[];
  limitations: string[];
  descriptors: ApiMolecularDescriptorsDto | null;
  diagnostics: ApiDiagnosticDto[];
}

export interface ApiConformerResponseDto {
  source_revision_id: string;
  method: string;
  engine: string;
  engine_version: string;
  random_seed: number;
  energy_minimized: boolean;
  geometry_status: 'rdkit-conformer';
  distance_unit: 'angstrom';
  assumptions: string[];
  limitations: string[];
  positions_angstrom: Record<string, [number, number, number]>;
}

export interface ApiMolImportResponseDto {
  engine: string;
  engine_version: string;
  distance_unit: 'angstrom';
  molecule: ApiMoleculeInputDto;
  warnings: string[];
}

export interface ApiMolExportResponseDto {
  structure_revision_id: string;
  engine: string;
  engine_version: string;
  format: 'mol-v2000';
  mol_block: string;
  warnings: string[];
}

export interface ApiCapabilitiesResponseDto {
  api_version: string;
  adapters: Array<{
    adapter: string;
    available: boolean;
    version: string | null;
    supported_elements: string[];
    supported_operations: string[];
    limitations: string[];
  }>;
}

// --- Domain <-> API boundary mappers ---

export function toApiMoleculeDto(molecule: Molecule): ApiMoleculeInputDto {
  return {
    id: molecule.id,
    name: molecule.name,
    revision_id: molecule.revisionId,
    net_charge: molecule.netCharge,
    spin_multiplicity: molecule.spinMultiplicity ?? null,
    atoms: molecule.atoms.map((a) => ({
      id: a.id,
      element: a.element,
      isotope: a.isotope ?? null,
      position_angstrom: [...a.positionAngstrom] as [number, number, number],
      formal_charge: a.formalCharge,
      aromatic: a.aromatic,
    })),
    bonds: molecule.bonds.map((b) => ({
      id: b.id,
      atom_a: b.atomA,
      atom_b: b.atomB,
      order: b.order,
    })),
  };
}

export function fromApiMoleculeDto(dto: ApiMoleculeInputDto): Molecule {
  const atoms: Atom[] = dto.atoms.map((a) => {
    const atom: Atom = {
      id: a.id,
      element: a.element,
      positionAngstrom: [...a.position_angstrom] as [number, number, number],
      formalCharge: a.formal_charge,
      aromatic: a.aromatic,
    };
    if (a.isotope !== null) {
      atom.isotope = a.isotope;
    }
    return atom;
  });

  const bonds: Bond[] = dto.bonds.map((b) => ({
    id: b.id,
    atomA: b.atom_a,
    atomB: b.atom_b,
    order: b.order as BondOrder,
  }));

  const mol: Molecule = {
    id: dto.id,
    name: dto.name,
    revisionId: dto.revision_id,
    atoms,
    bonds,
    netCharge: dto.net_charge,
    provenance: {
      sourceKind: 'imported-sdf',
      summary: 'Imported from SDF/MOL via RDKit science service (coordinates in Å).',
      geometryStatus: 'user-placed',
    },
  };
  if (dto.spin_multiplicity !== undefined && dto.spin_multiplicity !== null) {
    mol.spinMultiplicity = dto.spin_multiplicity;
  }
  return mol;
}

// --- CamelCase Domain Result Models ---

export interface RdkitValidationResult {
  structureRevisionId: string;
  status: ApiValidationResponseDto['status'];
  readyForConformerGeneration: boolean;
  readyForMd: boolean;
  engine: string;
  engineVersion: string;
  assumptions: string[];
  limitations: string[];
  descriptors: {
    explicitFormula: string;
    canonicalSmiles: string | null;
    inchikey: string | null;
    atomCount: number;
    heavyAtomCount: number;
    bondCount: number;
    molecularMassU: number;
    exactMassU: number;
    rotatableBondCount: number;
    ringCount: number;
    aromaticAtomCount: number;
    hbdCount: number;
    hbaCount: number;
    tpsaAngstrom2: number;
  } | null;
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    fieldPath: string | null;
    atomIds: string[];
    bondIds: string[];
  }>;
}

export interface RdkitConformerResult {
  sourceRevisionId: string;
  method: string;
  engine: string;
  engineVersion: string;
  randomSeed: number;
  energyMinimized: boolean;
  geometryStatus: 'rdkit-conformer';
  distanceUnit: 'angstrom';
  assumptions: string[];
  limitations: string[];
  positionsAngstrom: Record<string, [number, number, number]>;
}

// --- Milestone 4 OpenMM MD API DTOs & Mappers ---

export interface ApiSimulationPresetDto {
  id: string;
  version: string;
  name: string;
  category: 'molecular-mechanics';
  engine: 'OpenMM';
  engine_version: string | null;
  force_field: string;
  integrator: string;
  ensemble: 'NVT' | 'NVE';
  constraints: string;
  boundary_conditions: string;
  supports_thermostat_target: boolean;
  default_temperature_k: number;
  default_timestep_fs: number;
  default_duration_ps: number;
  limits: {
    min_water_molecules: number;
    max_water_molecules: number;
    min_temperature_k: number;
    max_temperature_k: number;
    min_timestep_fs: number;
    max_timestep_fs: number;
    min_duration_ps: number;
    max_duration_ps: number;
  };
  assumptions: string[];
  limitations: string[];
}

export interface ApiExperimentCreateRequestDto {
  model_preset_id: string;
  model_preset_version: string;
  initial_structure_revision_id: string;
  molecule: ApiMoleculeInputDto;
  settings: {
    temperature: { value: number; unit: 'K' };
    timestep: { value: number; unit: 'fs' | 'ps' };
    duration: { value: number; unit: 'fs' | 'ps' };
    report_interval_steps: number;
    minimize_before_run: boolean;
  };
  random_seed: number;
  idempotency_key: string;
}

export interface ApiExperimentJobDto {
  job_id: string;
  status: SimulationJobStatus;
  model_preset_id: string;
  model_preset_version: string;
  initial_structure_revision_id: string;
  progress_fraction: number;
  completed_steps: number;
  total_steps: number;
  frames_recorded: number;
  created_at_iso: string;
  updated_at_iso: string;
  error_code: string | null;
  error_message: string | null;
  status_url: string;
  results_url: string;
}

export interface ApiTrajectoryFrameDto {
  frame_index: number;
  step: number;
  simulation_time_ps: number;
  kinetic_energy_kj_mol: number;
  potential_energy_kj_mol: number;
  total_energy_kj_mol: number;
  instantaneous_temperature_k: number;
  positions_angstrom: Array<[number, number, number]>;
}

export interface ApiExperimentResultsDto {
  job_id: string;
  status: SimulationJobStatus;
  is_partial: boolean;
  atom_ids: string[];
  frames: ApiTrajectoryFrameDto[];
  reproducibility: {
    input_structure_revision_id: string;
    input_structure_hash_sha256: string;
    model_preset_id: string;
    model_preset_version: string;
    force_field_source: string;
    integrator: string;
    ensemble: 'NVT' | 'NVE';
    engine: string;
    engine_version: string;
    platform_name: string;
    numerical_precision: string;
    random_seed: number;
    degrees_of_freedom: number;
    constraints_summary: string;
    resolved_settings: {
      temperature_k: number;
      timestep_fs: number;
      duration_ps: number;
      total_steps: number;
      report_interval_steps: number;
      minimize_before_run: boolean;
    };
    termination_status: SimulationJobStatus;
    energy_basis: 'mole-of-systems';
    energy_unit: 'kJ/mol';
    distance_unit: 'angstrom';
    time_unit: 'ps';
    temperature_unit: 'K';
  };
  warnings: string[];
}

export function fromApiPresetDto(dto: ApiSimulationPresetDto): SimulationModelPreset {
  return {
    id: dto.id,
    version: dto.version,
    name: dto.name,
    category: dto.category,
    engine: dto.engine,
    engineVersion: dto.engine_version,
    forceField: dto.force_field,
    integrator: dto.integrator,
    ensemble: dto.ensemble,
    constraints: dto.constraints,
    boundaryConditions: dto.boundary_conditions,
    supportsThermostatTarget: dto.supports_thermostat_target,
    defaultTemperatureK: dto.default_temperature_k,
    defaultTimestepFs: dto.default_timestep_fs,
    defaultDurationPs: dto.default_duration_ps,
    limits: {
      minWaterMolecules: dto.limits.min_water_molecules,
      maxWaterMolecules: dto.limits.max_water_molecules,
      minTemperatureK: dto.limits.min_temperature_k,
      maxTemperatureK: dto.limits.max_temperature_k,
      minTimestepFs: dto.limits.min_timestep_fs,
      maxTimestepFs: dto.limits.max_timestep_fs,
      minDurationPs: dto.limits.min_duration_ps,
      maxDurationPs: dto.limits.max_duration_ps,
    },
    assumptions: dto.assumptions,
    limitations: dto.limitations,
  };
}

export function toApiExperimentRequestDto(
  molecule: Molecule,
  config: ExperimentConfig,
  idempotencyKey: string,
): ApiExperimentCreateRequestDto {
  return {
    model_preset_id: config.modelPresetId,
    model_preset_version: config.modelPresetVersion,
    initial_structure_revision_id: config.initialStructureRevisionId,
    molecule: toApiMoleculeDto(molecule),
    settings: {
      temperature: { value: config.temperature.value, unit: config.temperature.unit },
      timestep: { value: config.timestep.value, unit: config.timestep.unit },
      duration: { value: config.duration.value, unit: config.duration.unit },
      report_interval_steps: config.reportIntervalSteps,
      minimize_before_run: config.minimizeBeforeRun,
    },
    random_seed: config.randomSeed,
    idempotency_key: idempotencyKey,
  };
}

export function fromApiJobDto(dto: ApiExperimentJobDto): ExperimentJobInfo {
  return {
    jobId: dto.job_id,
    status: dto.status,
    modelPresetId: dto.model_preset_id,
    modelPresetVersion: dto.model_preset_version,
    initialStructureRevisionId: dto.initial_structure_revision_id,
    progressFraction: dto.progress_fraction,
    completedSteps: dto.completed_steps,
    totalSteps: dto.total_steps,
    framesRecorded: dto.frames_recorded,
    createdAtIso: dto.created_at_iso,
    updatedAtIso: dto.updated_at_iso,
    errorCode: dto.error_code,
    errorMessage: dto.error_message,
    statusUrl: dto.status_url,
    resultsUrl: dto.results_url,
  };
}

export function fromApiResultsDto(dto: ApiExperimentResultsDto): ExperimentResults {
  const rep = dto.reproducibility;
  return {
    jobId: dto.job_id,
    status: dto.status,
    isPartial: dto.is_partial,
    atomIds: dto.atom_ids,
    frames: dto.frames.map((f) => ({
      frameIndex: f.frame_index,
      step: f.step,
      simulationTimePs: f.simulation_time_ps,
      kineticEnergyKjMol: f.kinetic_energy_kj_mol,
      potentialEnergyKjMol: f.potential_energy_kj_mol,
      totalEnergyKjMol: f.total_energy_kj_mol,
      instantaneousTemperatureK: f.instantaneous_temperature_k,
      positionsAngstrom: f.positions_angstrom,
    })),
    reproducibility: {
      inputStructureRevisionId: rep.input_structure_revision_id,
      inputStructureHashSha256: rep.input_structure_hash_sha256,
      modelPresetId: rep.model_preset_id,
      modelPresetVersion: rep.model_preset_version,
      forceFieldSource: rep.force_field_source,
      integrator: rep.integrator,
      ensemble: rep.ensemble,
      engine: rep.engine,
      engineVersion: rep.engine_version,
      platformName: rep.platform_name,
      numericalPrecision: rep.numerical_precision,
      randomSeed: rep.random_seed,
      degreesOfFreedom: rep.degrees_of_freedom,
      constraintsSummary: rep.constraints_summary,
      resolvedSettings: {
        temperatureK: rep.resolved_settings.temperature_k,
        timestepFs: rep.resolved_settings.timestep_fs,
        durationPs: rep.resolved_settings.duration_ps,
        totalSteps: rep.resolved_settings.total_steps,
        reportIntervalSteps: rep.resolved_settings.report_interval_steps,
        minimizeBeforeRun: rep.resolved_settings.minimize_before_run,
      },
      terminationStatus: rep.termination_status,
      energyBasis: rep.energy_basis,
      energyUnit: rep.energy_unit,
      distanceUnit: rep.distance_unit,
      timeUnit: rep.time_unit,
      temperatureUnit: rep.temperature_unit,
    },
    warnings: dto.warnings,
  };
}

// --- Milestone 5: Quantum Chemistry (PySCF) DTOs & Mappers ---

export interface ApiQuantumPresetDto {
  id: string;
  version: string;
  name: string;
  category: 'quantum-chemistry';
  engine: 'PySCF';
  engine_version: string | null;
  method: string;
  basis_set: string;
  max_atoms: number;
  max_scf_cycles: number;
  assumptions: string[];
  limitations: string[];
}

export interface ApiQuantumJobDto {
  job_id: string;
  status: SimulationJobStatus;
  model_preset_id: string;
  model_preset_version: string;
  initial_structure_revision_id: string;
  scf_cycles_completed: number;
  max_scf_cycles: number;
  converged: boolean | null;
  created_at_iso: string;
  updated_at_iso: string;
  error_code: string | null;
  error_message: string | null;
  status_url: string;
  results_url: string;
}

export interface ApiQuantumResultsDto {
  job_id: string;
  status: SimulationJobStatus;
  engine: 'PySCF';
  engine_version: string;
  method: string;
  basis_set: string;
  charge_e: number;
  spin_multiplicity: number;
  converged: boolean;
  scf_cycles: number;
  total_energy_hartree: number | null;
  total_energy_kj_mol: number | null;
  energy_basis: 'mole-of-systems';
  homo_energy_hartree: number | null;
  lumo_energy_hartree: number | null;
  homo_lumo_gap_ev: number | null;
  dipole_moment_debye: [number, number, number] | null;
  dipole_magnitude_debye: number | null;
  orbitals: Array<{
    index: number;
    label: string;
    occupancy: number;
    energy_hartree: number;
    energy_ev: number;
  }>;
  homo_orbital_field: {
    field_kind: 'orbital-amplitude-and-phase';
    orbital_label: string;
    orbital_index: number;
    isovalue: number;
    unit: 'bohr^-3/2';
    samples: Array<{ position_angstrom: [number, number, number]; value: number }>;
  } | null;
  electron_density_field: {
    field_kind: 'total-electron-density';
    isovalue: number;
    unit: 'e/bohr^3';
    samples: Array<{ position_angstrom: [number, number, number]; value: number }>;
  } | null;
  input_structure_revision_id: string;
  input_structure_hash_sha256: string;
  assumptions: string[];
  limitations: string[];
  warnings: string[];
}

export function fromApiQuantumPresetDto(dto: ApiQuantumPresetDto): QuantumModelPreset {
  return {
    id: dto.id,
    version: dto.version,
    name: dto.name,
    category: dto.category,
    engine: dto.engine,
    engineVersion: dto.engine_version,
    method: dto.method,
    basisSet: dto.basis_set,
    maxAtoms: dto.max_atoms,
    maxScfCycles: dto.max_scf_cycles,
    assumptions: dto.assumptions,
    limitations: dto.limitations,
  };
}

export function toApiQuantumJobRequestDto(
  molecule: Molecule,
  config: QuantumJobConfig,
  idempotencyKey: string,
) {
  return {
    model_preset_id: config.modelPresetId,
    model_preset_version: config.modelPresetVersion,
    initial_structure_revision_id: config.initialStructureRevisionId,
    molecule: toApiMoleculeDto(molecule),
    compute_fields: config.computeFields,
    idempotency_key: idempotencyKey,
  };
}

export function fromApiQuantumJobDto(dto: ApiQuantumJobDto): QuantumJobInfo {
  return {
    jobId: dto.job_id,
    status: dto.status,
    modelPresetId: dto.model_preset_id,
    modelPresetVersion: dto.model_preset_version,
    initialStructureRevisionId: dto.initial_structure_revision_id,
    scfCyclesCompleted: dto.scf_cycles_completed,
    maxScfCycles: dto.max_scf_cycles,
    converged: dto.converged,
    createdAtIso: dto.created_at_iso,
    updatedAtIso: dto.updated_at_iso,
    errorCode: dto.error_code,
    errorMessage: dto.error_message,
    statusUrl: dto.status_url,
    resultsUrl: dto.results_url,
  };
}

export function fromApiQuantumResultsDto(dto: ApiQuantumResultsDto): QuantumResults {
  return {
    jobId: dto.job_id,
    status: dto.status,
    engine: dto.engine,
    engineVersion: dto.engine_version,
    method: dto.method,
    basisSet: dto.basis_set,
    chargeE: dto.charge_e,
    spinMultiplicity: dto.spin_multiplicity,
    converged: dto.converged,
    scfCycles: dto.scf_cycles,
    totalEnergyHartree: dto.total_energy_hartree,
    totalEnergyKjMol: dto.total_energy_kj_mol,
    energyBasis: dto.energy_basis,
    homoEnergyHartree: dto.homo_energy_hartree,
    lumoEnergyHartree: dto.lumo_energy_hartree,
    homoLumoGapEv: dto.homo_lumo_gap_ev,
    dipoleMomentDebye: dto.dipole_moment_debye,
    dipoleMagnitudeDebye: dto.dipole_magnitude_debye,
    orbitals: dto.orbitals.map((o) => ({
      index: o.index,
      label: o.label,
      occupancy: o.occupancy,
      energyHartree: o.energy_hartree,
      energyEv: o.energy_ev,
    })),
    homoOrbitalField: dto.homo_orbital_field
      ? {
          fieldKind: dto.homo_orbital_field.field_kind,
          orbitalLabel: dto.homo_orbital_field.orbital_label,
          orbitalIndex: dto.homo_orbital_field.orbital_index,
          isovalue: dto.homo_orbital_field.isovalue,
          unit: dto.homo_orbital_field.unit,
          samples: dto.homo_orbital_field.samples.map((s) => ({
            positionAngstrom: s.position_angstrom,
            value: s.value,
          })),
        }
      : null,
    electronDensityField: dto.electron_density_field
      ? {
          fieldKind: dto.electron_density_field.field_kind,
          isovalue: dto.electron_density_field.isovalue,
          unit: dto.electron_density_field.unit,
          samples: dto.electron_density_field.samples.map((s) => ({
            positionAngstrom: s.position_angstrom,
            value: s.value,
          })),
        }
      : null,
    inputStructureRevisionId: dto.input_structure_revision_id,
    inputStructureHashSha256: dto.input_structure_hash_sha256,
    assumptions: dto.assumptions,
    limitations: dto.limitations,
    warnings: dto.warnings,
  };
}

// --- Exploratory Nuclear Cluster & Force Sandbox DTOs & Mappers ---

export interface ApiNuclearParticleDto {
  id: string;
  kind: NuclearParticleKind;
  label: string;
  charge_e: number;
  mass_mev_c2: number;
  position_fm: [number, number, number];
  velocity_c: [number, number, number];
}

export interface ApiNuclearForceConfigDto {
  coulomb_scale: number;
  nuclear_attraction_mev: number;
  nuclear_attraction_range_fm: number;
  core_repulsion_mev: number;
  core_repulsion_range_fm: number;
  gravity_enabled: boolean;
  gravity_log10_multiplier: number;
  damping_per_fc: number;
  timestep_fc: number;
  total_steps: number;
  report_interval_steps: number;
}

export interface ApiNuclearReferenceBenchmarkDto {
  nuclide: string;
  total_binding_energy_mev: number;
  cluster_binding_energy_mev: number;
  stability_summary: string;
  half_life_note: string;
  source: string;
}

export interface ApiNuclearPresetDto {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  particles: ApiNuclearParticleDto[];
  cluster_edges: Array<[string, string]>;
  recommended_force_config: ApiNuclearForceConfigDto;
  benchmark: ApiNuclearReferenceBenchmarkDto;
}

export interface ApiNuclearSimulationResultDto {
  preset_id: string;
  model_label: string;
  disclaimer: string;
  assumptions: string[];
  limitations: string[];
  particle_ids: string[];
  particle_kinds: NuclearParticleKind[];
  stability_verdict: NuclearStabilityVerdict;
  verdict_explanation: string;
  initial_total_energy_mev: number;
  final_total_energy_mev: number;
  energy_drift_mev: number;
  final_cluster_energy_mev: number;
  reference_benchmark: ApiNuclearReferenceBenchmarkDto | null;
  frames: Array<{
    frame_index: number;
    step: number;
    time_fc: number;
    kinetic_energy_mev: number;
    coulomb_energy_mev: number;
    nuclear_energy_mev: number;
    gravity_energy_mev: number;
    potential_energy_mev: number;
    total_energy_mev: number;
    min_pair_distance_fm: number;
    max_pair_distance_fm: number;
    positions_fm: Array<[number, number, number]>;
    force_vectors_mev_fm: Array<[number, number, number]>;
  }>;
}

export function toApiNuclearParticleDto(p: NuclearParticle): ApiNuclearParticleDto {
  return {
    id: p.id,
    kind: p.kind,
    label: p.label,
    charge_e: p.chargeE,
    mass_mev_c2: p.massMevC2,
    position_fm: [...p.positionFm] as [number, number, number],
    velocity_c: [...p.velocityC] as [number, number, number],
  };
}

export function fromApiNuclearParticleDto(dto: ApiNuclearParticleDto): NuclearParticle {
  return {
    id: dto.id,
    kind: dto.kind,
    label: dto.label,
    chargeE: dto.charge_e,
    massMevC2: dto.mass_mev_c2,
    positionFm: [...dto.position_fm] as [number, number, number],
    velocityC: [...dto.velocity_c] as [number, number, number],
  };
}

export function toApiNuclearForceConfigDto(
  cfg: NuclearForceConfig,
): ApiNuclearForceConfigDto {
  return {
    coulomb_scale: cfg.coulombScale,
    nuclear_attraction_mev: cfg.nuclearAttractionMev,
    nuclear_attraction_range_fm: cfg.nuclearAttractionRangeFm,
    core_repulsion_mev: cfg.coreRepulsionMev,
    core_repulsion_range_fm: cfg.coreRepulsionRangeFm,
    gravity_enabled: cfg.gravityEnabled,
    gravity_log10_multiplier: cfg.gravityLog10Multiplier,
    damping_per_fc: cfg.dampingPerFc,
    timestep_fc: cfg.timestepFc,
    total_steps: cfg.totalSteps,
    report_interval_steps: cfg.reportIntervalSteps,
  };
}

export function fromApiNuclearForceConfigDto(
  dto: ApiNuclearForceConfigDto,
): NuclearForceConfig {
  return {
    coulombScale: dto.coulomb_scale,
    nuclearAttractionMev: dto.nuclear_attraction_mev,
    nuclearAttractionRangeFm: dto.nuclear_attraction_range_fm,
    coreRepulsionMev: dto.core_repulsion_mev,
    coreRepulsionRangeFm: dto.core_repulsion_range_fm,
    gravityEnabled: dto.gravity_enabled,
    gravityLog10Multiplier: dto.gravity_log10_multiplier,
    dampingPerFc: dto.damping_per_fc,
    timestepFc: dto.timestep_fc,
    totalSteps: dto.total_steps,
    reportIntervalSteps: dto.report_interval_steps,
  };
}

export function fromApiNuclearPresetDto(dto: ApiNuclearPresetDto): NuclearClusterPreset {
  return {
    id: dto.id,
    name: dto.name,
    subtitle: dto.subtitle,
    description: dto.description,
    particles: dto.particles.map(fromApiNuclearParticleDto),
    clusterEdges: dto.cluster_edges,
    recommendedForceConfig: fromApiNuclearForceConfigDto(dto.recommended_force_config),
    benchmark: {
      nuclide: dto.benchmark.nuclide,
      totalBindingEnergyMev: dto.benchmark.total_binding_energy_mev,
      clusterBindingEnergyMev: dto.benchmark.cluster_binding_energy_mev,
      stabilitySummary: dto.benchmark.stability_summary,
      halfLifeNote: dto.benchmark.half_life_note,
      source: dto.benchmark.source,
    },
  };
}

export function fromApiNuclearSimulationResultDto(
  dto: ApiNuclearSimulationResultDto,
): NuclearSimulationResult {
  return {
    presetId: dto.preset_id,
    modelLabel: dto.model_label,
    disclaimer: dto.disclaimer,
    assumptions: dto.assumptions,
    limitations: dto.limitations,
    particleIds: dto.particle_ids,
    particleKinds: dto.particle_kinds,
    stabilityVerdict: dto.stability_verdict,
    verdictExplanation: dto.verdict_explanation,
    initialTotalEnergyMev: dto.initial_total_energy_mev,
    finalTotalEnergyMev: dto.final_total_energy_mev,
    energyDriftMev: dto.energy_drift_mev,
    finalClusterEnergyMev: dto.final_cluster_energy_mev,
    referenceBenchmark: dto.reference_benchmark
      ? {
          nuclide: dto.reference_benchmark.nuclide,
          totalBindingEnergyMev: dto.reference_benchmark.total_binding_energy_mev,
          clusterBindingEnergyMev: dto.reference_benchmark.cluster_binding_energy_mev,
          stabilitySummary: dto.reference_benchmark.stability_summary,
          halfLifeNote: dto.reference_benchmark.half_life_note,
          source: dto.reference_benchmark.source,
        }
      : null,
    frames: dto.frames.map((f) => ({
      frameIndex: f.frame_index,
      step: f.step,
      timeFc: f.time_fc,
      kineticEnergyMev: f.kinetic_energy_mev,
      coulombEnergyMev: f.coulomb_energy_mev,
      nuclearEnergyMev: f.nuclear_energy_mev,
      gravityEnergyMev: f.gravity_energy_mev,
      potentialEnergyMev: f.potential_energy_mev,
      totalEnergyMev: f.total_energy_mev,
      minPairDistanceFm: f.min_pair_distance_fm,
      maxPairDistanceFm: f.max_pair_distance_fm,
      positionsFm: f.positions_fm,
      forceVectorsMevFm: f.force_vectors_mev_fm,
    })),
  };
}
