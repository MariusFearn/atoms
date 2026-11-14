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
    mode: Literal["rdkit-enabled", "prototype-scaffold"]


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
