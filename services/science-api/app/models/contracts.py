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
