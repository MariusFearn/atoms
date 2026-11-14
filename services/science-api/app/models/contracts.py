from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field, field_validator

BondOrderLiteral = Literal[1, 2, 3, "aromatic"]


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    field_path: str | None = None
    retryable: bool = False


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    mode: Literal[
        "rdkit-openmm-pyscf-enabled",
        "rdkit-openmm-enabled",
        "rdkit-enabled",
        "prototype-scaffold",
    ]


class AdapterCapability(BaseModel):
    adapter: str
    available: bool
    version: str | None
    supported_elements: list[str]
    supported_operations: list[str]
    limitations: list[str]


class CapabilitiesResponse(BaseModel):
    api_version: str
    adapters: list[AdapterCapability]


class ElementSummary(BaseModel):
    atomic_number: int
    symbol: str
    name: str
    standard_atomic_weight_u: float
    provenance: str


class AtomInput(BaseModel):
    id: str = Field(min_length=1)
    element: str = Field(min_length=1)
    isotope: int | None = None
    position_angstrom: tuple[float, float, float]
    formal_charge: int
    aromatic: bool

    @field_validator("position_angstrom")
    @classmethod
    def check_finite_coords(
        cls, coords: tuple[float, float, float]
    ) -> tuple[float, float, float]:
        for val in coords:
            if not math.isfinite(val):
                raise ValueError("Atom coordinates must be finite numbers.")
        return coords


class BondInput(BaseModel):
    id: str = Field(min_length=1)
    atom_a: str = Field(min_length=1)
    atom_b: str = Field(min_length=1)
    order: BondOrderLiteral


class MoleculeInput(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    revision_id: str = Field(min_length=1)
    atoms: list[AtomInput]
    bonds: list[BondInput]
    net_charge: int
    spin_multiplicity: int | None = None


class ValidateMoleculeRequest(BaseModel):
    molecule: MoleculeInput


class ConformerRequest(BaseModel):
    molecule: MoleculeInput
    random_seed: int = Field(default=42, ge=0, le=2_147_483_647)


class MolImportRequest(BaseModel):
    mol_text: str = Field(min_length=1, max_length=524_288)
    name: str | None = None


class MolExportRequest(BaseModel):
    molecule: MoleculeInput


class DiagnosticItem(BaseModel):
    severity: Literal["error", "warning", "info"]
    code: str
    message: str
    field_path: str | None = None
    atom_ids: list[str] = Field(default_factory=list)
    bond_ids: list[str] = Field(default_factory=list)


class MolecularDescriptors(BaseModel):
    explicit_formula: str
    canonical_smiles: str | None
    inchikey: str | None
    atom_count: int
    heavy_atom_count: int
    bond_count: int
    molecular_mass_u: float
    exact_mass_u: float
    rotatable_bond_count: int
    ring_count: int
    aromatic_atom_count: int
    hbd_count: int
    hba_count: int
    tpsa_angstrom2: float


class ValidationResponse(BaseModel):
    structure_revision_id: str
    status: Literal[
        "valid-rdkit",
        "incomplete-draft",
        "invalid-valence",
        "unsupported-chemistry",
        "integrity-error",
    ]
    ready_for_conformer_generation: bool
    ready_for_md: bool
    engine: str
    engine_version: str
    assumptions: list[str]
    limitations: list[str]
    descriptors: MolecularDescriptors | None
    diagnostics: list[DiagnosticItem]


class ConformerResponse(BaseModel):
    source_revision_id: str
    method: str
    engine: str
    engine_version: str
    random_seed: int
    energy_minimized: bool
    geometry_status: Literal["rdkit-conformer"]
    distance_unit: Literal["angstrom"]
    assumptions: list[str]
    limitations: list[str]
    positions_angstrom: dict[str, tuple[float, float, float]]


class MolImportResponse(BaseModel):
    engine: str
    engine_version: str
    distance_unit: Literal["angstrom"]
    molecule: MoleculeInput
    warnings: list[str] = Field(default_factory=list)


class MolExportResponse(BaseModel):
    structure_revision_id: str
    engine: str
    engine_version: str
    format: Literal["mol-v2000"]
    mol_block: str
    warnings: list[str] = Field(default_factory=list)


# --- Milestone 4: OpenMM Molecular Dynamics Contracts ---

JobStatusLiteral = Literal[
    "queued",
    "running",
    "cancelling",
    "cancelled",
    "completed",
    "failed",
    "interrupted",
]


class PresetParameterLimits(BaseModel):
    min_water_molecules: int
    max_water_molecules: int
    min_temperature_k: float
    max_temperature_k: float
    min_timestep_fs: float
    max_timestep_fs: float
    min_duration_ps: float
    max_duration_ps: float


class SimulationPresetDto(BaseModel):
    id: str
    version: str
    name: str
    category: Literal["molecular-mechanics"]
    engine: Literal["OpenMM"]
    engine_version: str | None
    force_field: str
    integrator: str
    ensemble: Literal["NVT", "NVE"]
    constraints: str
    boundary_conditions: str
    supports_thermostat_target: bool
    default_temperature_k: float
    default_timestep_fs: float
    default_duration_ps: float
    limits: PresetParameterLimits
    assumptions: list[str]
    limitations: list[str]


class TemperatureQuantityInput(BaseModel):
    value: float
    unit: Literal["K"]

    @field_validator("value")
    @classmethod
    def check_finite_non_negative(cls, v: float) -> float:
        if not math.isfinite(v) or v < 0:
            raise ValueError("Temperature in Kelvin must be finite and non-negative.")
        return v


class TimeQuantityInput(BaseModel):
    value: float
    unit: Literal["fs", "ps"]

    @field_validator("value")
    @classmethod
    def check_finite_positive(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0:
            raise ValueError("Time quantity must be finite and positive.")
        return v


class ExperimentSettingsInput(BaseModel):
    temperature: TemperatureQuantityInput
    timestep: TimeQuantityInput
    duration: TimeQuantityInput
    report_interval_steps: int = Field(default=20, ge=1, le=5000)
    minimize_before_run: bool = True


class ExperimentCreateRequest(BaseModel):
    model_preset_id: str = Field(min_length=1)
    model_preset_version: str = Field(min_length=1)
    initial_structure_revision_id: str = Field(min_length=1)
    molecule: MoleculeInput
    settings: ExperimentSettingsInput
    random_seed: int = Field(default=42, ge=0, le=2_147_483_647)
    idempotency_key: str = Field(min_length=1, max_length=128)


class ExperimentJobDto(BaseModel):
    job_id: str
    status: JobStatusLiteral
    model_preset_id: str
    model_preset_version: str
    initial_structure_revision_id: str
    progress_fraction: float
    completed_steps: int
    total_steps: int
    frames_recorded: int
    created_at_iso: str
    updated_at_iso: str
    error_code: str | None = None
    error_message: str | None = None
    status_url: str
    results_url: str


class TrajectoryFrameDto(BaseModel):
    frame_index: int
    step: int
    simulation_time_ps: float
    kinetic_energy_kj_mol: float
    potential_energy_kj_mol: float
    total_energy_kj_mol: float
    instantaneous_temperature_k: float
    positions_angstrom: list[tuple[float, float, float]]


class ResolvedExperimentSettingsDto(BaseModel):
    temperature_k: float
    timestep_fs: float
    duration_ps: float
    total_steps: int
    report_interval_steps: int
    minimize_before_run: bool


class ReproducibilityRecordDto(BaseModel):
    input_structure_revision_id: str
    input_structure_hash_sha256: str
    model_preset_id: str
    model_preset_version: str
    force_field_source: str
    integrator: str
    ensemble: Literal["NVT", "NVE"]
    engine: str
    engine_version: str
    platform_name: str
    numerical_precision: str
    random_seed: int
    degrees_of_freedom: int
    constraints_summary: str
    resolved_settings: ResolvedExperimentSettingsDto
    termination_status: JobStatusLiteral
    energy_basis: Literal["mole-of-systems"]
    energy_unit: Literal["kJ/mol"]
    distance_unit: Literal["angstrom"]
    time_unit: Literal["ps"]
    temperature_unit: Literal["K"]


class ExperimentResultsDto(BaseModel):
    job_id: str
    status: JobStatusLiteral
    is_partial: bool
    atom_ids: list[str]
    frames: list[TrajectoryFrameDto]
    reproducibility: ReproducibilityRecordDto
    warnings: list[str] = Field(default_factory=list)


# --- Milestone 5: Quantum Chemistry (PySCF) Contracts ---


class QuantumPresetDto(BaseModel):
    id: str
    version: str
    name: str
    category: Literal["quantum-chemistry"]
    engine: Literal["PySCF"]
    engine_version: str | None
    method: str
    basis_set: str
    max_atoms: int
    max_scf_cycles: int
    assumptions: list[str]
    limitations: list[str]


class QuantumJobCreateRequest(BaseModel):
    model_preset_id: str = Field(min_length=1)
    model_preset_version: str = Field(min_length=1)
    initial_structure_revision_id: str = Field(min_length=1)
    molecule: MoleculeInput
    compute_fields: bool = True
    idempotency_key: str = Field(min_length=1, max_length=128)


class QuantumJobDto(BaseModel):
    job_id: str
    status: JobStatusLiteral
    model_preset_id: str
    model_preset_version: str
    initial_structure_revision_id: str
    scf_cycles_completed: int
    max_scf_cycles: int
    converged: bool | None = None
    created_at_iso: str
    updated_at_iso: str
    error_code: str | None = None
    error_message: str | None = None
    status_url: str
    results_url: str


class QuantumScalarSampleDto(BaseModel):
    position_angstrom: tuple[float, float, float]
    value: float


class QuantumOrbitalAmplitudeFieldDto(BaseModel):
    field_kind: Literal["orbital-amplitude-and-phase"]
    orbital_label: str
    orbital_index: int
    isovalue: float
    unit: Literal["bohr^-3/2"]
    samples: list[QuantumScalarSampleDto]


class QuantumElectronDensityFieldDto(BaseModel):
    field_kind: Literal["total-electron-density"]
    isovalue: float
    unit: Literal["e/bohr^3"]
    samples: list[QuantumScalarSampleDto]


class QuantumOrbitalEnergyDto(BaseModel):
    index: int
    label: str
    occupancy: float
    energy_hartree: float
    energy_ev: float


class QuantumResultsDto(BaseModel):
    job_id: str
    status: JobStatusLiteral
    engine: Literal["PySCF"]
    engine_version: str
    method: str
    basis_set: str
    charge_e: int
    spin_multiplicity: int
    converged: bool
    scf_cycles: int
    total_energy_hartree: float | None = None
    total_energy_kj_mol: float | None = None
    energy_basis: Literal["mole-of-systems"]
    homo_energy_hartree: float | None = None
    lumo_energy_hartree: float | None = None
    homo_lumo_gap_ev: float | None = None
    dipole_moment_debye: tuple[float, float, float] | None = None
    dipole_magnitude_debye: float | None = None
    orbitals: list[QuantumOrbitalEnergyDto] = Field(default_factory=list)
    homo_orbital_field: QuantumOrbitalAmplitudeFieldDto | None = None
    electron_density_field: QuantumElectronDensityFieldDto | None = None
    input_structure_revision_id: str
    input_structure_hash_sha256: str
    assumptions: list[str]
    limitations: list[str]
    warnings: list[str] = Field(default_factory=list)


# --- Exploratory Nuclear Cluster & Force Sandbox (Toy Model) ---

NuclearParticleKindLiteral = Literal["proton", "neutron", "alpha"]
NuclearStabilityVerdictLiteral = Literal[
    "bound-oscillating",
    "unbound-dissociated",
    "collapsed-core",
]


class NuclearParticleInput(BaseModel):
    id: str = Field(min_length=1, max_length=32)
    kind: NuclearParticleKindLiteral
    label: str = Field(min_length=1, max_length=64)
    charge_e: float = Field(ge=-2.0, le=10.0)
    mass_mev_c2: float = Field(gt=0.0, le=50000.0)
    position_fm: tuple[float, float, float]
    velocity_c: tuple[float, float, float]
    dipole_direction: tuple[float, float, float] = (0.0, 0.0, 1.0)

    @field_validator("position_fm", "velocity_c", "dipole_direction")
    @classmethod
    def check_finite_vec3(
        cls, vec: tuple[float, float, float]
    ) -> tuple[float, float, float]:
        for val in vec:
            if not math.isfinite(val):
                raise ValueError("Particle vector components must be finite numbers.")
        return vec


class NuclearForceConfigInput(BaseModel):
    coulomb_scale: float = Field(default=1.0, ge=0.0, le=5.0)
    nuclear_attraction_mev: float = Field(default=84.0, ge=0.0, le=300.0)
    nuclear_attraction_range_fm: float = Field(default=2.11, ge=0.5, le=6.0)
    core_repulsion_mev: float = Field(default=475.0, ge=0.0, le=1500.0)
    core_repulsion_range_fm: float = Field(default=1.43, ge=0.3, le=3.5)
    gravity_enabled: bool = True
    gravity_log10_multiplier: float = Field(default=0.0, ge=0.0, le=38.0)
    dipole_enabled: bool = False
    dipole_log10_multiplier: float = Field(default=0.0, ge=0.0, le=4.0)
    alpha_toy_dipole_mu: float = Field(default=2.5, ge=0.0, le=5.0)
    damping_per_fc: float = Field(default=0.0, ge=0.0, le=0.5)
    timestep_fc: float = Field(default=0.25, ge=0.02, le=0.5)
    total_steps: int = Field(default=400, ge=10, le=2000)
    report_interval_steps: int = Field(default=4, ge=1, le=50)

    @field_validator(
        "coulomb_scale",
        "nuclear_attraction_mev",
        "nuclear_attraction_range_fm",
        "core_repulsion_mev",
        "core_repulsion_range_fm",
        "gravity_log10_multiplier",
        "dipole_log10_multiplier",
        "alpha_toy_dipole_mu",
        "damping_per_fc",
        "timestep_fc",
    )
    @classmethod
    def check_finite_scalar(cls, val: float) -> float:
        if not math.isfinite(val):
            raise ValueError("Force parameter must be finite.")
        return val


class NuclearReferenceBenchmarkDto(BaseModel):
    nuclide: str
    total_binding_energy_mev: float
    cluster_binding_energy_mev: float
    stability_summary: str
    half_life_note: str
    source: str


class NuclearPresetDto(BaseModel):
    id: str
    name: str
    subtitle: str
    description: str
    particles: list[NuclearParticleInput]
    cluster_edges: list[tuple[str, str]]
    recommended_force_config: NuclearForceConfigInput
    benchmark: NuclearReferenceBenchmarkDto


class NuclearSimulateRequest(BaseModel):
    preset_id: str = Field(min_length=1, max_length=64)
    particles: list[NuclearParticleInput] = Field(min_length=2, max_length=32)
    force_config: NuclearForceConfigInput


class NuclearTrajectoryFrameDto(BaseModel):
    frame_index: int
    step: int
    time_fc: float
    kinetic_energy_mev: float
    coulomb_energy_mev: float
    nuclear_energy_mev: float
    gravity_energy_mev: float
    dipole_energy_mev: float = 0.0
    potential_energy_mev: float
    total_energy_mev: float
    min_pair_distance_fm: float
    max_pair_distance_fm: float
    positions_fm: list[tuple[float, float, float]]
    force_vectors_mev_fm: list[tuple[float, float, float]]


class NuclearSimulationResultDto(BaseModel):
    preset_id: str
    model_label: str
    disclaimer: str
    assumptions: list[str]
    limitations: list[str]
    particle_ids: list[str]
    particle_kinds: list[NuclearParticleKindLiteral]
    stability_verdict: NuclearStabilityVerdictLiteral
    verdict_explanation: str
    initial_total_energy_mev: float
    final_total_energy_mev: float
    energy_drift_mev: float
    final_cluster_energy_mev: float
    reference_benchmark: NuclearReferenceBenchmarkDto | None = None
    frames: list[NuclearTrajectoryFrameDto]
