from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from typing import Callable

import numpy as np
import pyscf
from pyscf import dft, gto, scf
from pyscf.dft import numint

from app.adapters.rdkit.adapter import MVP_ELEMENT_SET
from app.models.contracts import (
    QuantumElectronDensityFieldDto,
    QuantumJobCreateRequest,
    QuantumOrbitalAmplitudeFieldDto,
    QuantumOrbitalEnergyDto,
    QuantumPresetDto,
    QuantumResultsDto,
    QuantumScalarSampleDto,
)

# CODATA 2022 exact conversion constants
HARTREE_TO_KJ_MOL = 2625.4996394798254
HARTREE_TO_EV = 27.211386245988
BOHR_PER_ANGSTROM = 1.0 / 0.529177210903

ATOMIC_NUMBERS: dict[str, int] = {
    "H": 1,
    "C": 6,
    "N": 7,
    "O": 8,
    "F": 9,
    "P": 15,
    "S": 16,
    "Cl": 17,
    "Br": 35,
    "I": 53,
}


class PyScfAdapterError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        http_status: int = 422,
        field_path: str | None = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.field_path = field_path
        self.retryable = retryable


class QuantumCancelledException(Exception):
    """Raised cooperatively inside PySCF SCF callback when a job is cancelled."""


def pyscf_version() -> str:
    return pyscf.__version__


@dataclass(frozen=True)
class QuantumPresetSpec:
    dto: QuantumPresetDto
    xc: str | None  # None => RHF; string => RKS DFT functional


def _build_quantum_presets() -> dict[tuple[str, str], QuantumPresetSpec]:
    ver = pyscf_version()
    base_assumptions = [
        "Non-relativistic Born-Oppenheimer electronic structure in the gas phase (isolated molecule, 0 K electronic ground state).",
        "Closed-shell restricted singlet spin state (spin multiplicity = 1, paired electrons only).",
        "Electronic energies are reported in Hartrees (E_h) and molar whole-system kJ/mol.",
    ]
    base_limitations = [
        "Finite Gaussian basis-set approximation and single-determinant HF/KS-DFT cannot capture exact electron correlation or multireference bond dissociation.",
        "Single-point calculation at fixed input nuclear coordinates; does not optimize molecular geometry.",
        "Orbital amplitude/phase and total electron density fields are distinct quantities sampled on a finite 3D grid for visualization.",
    ]

    specs = [
        QuantumPresetSpec(
            dto=QuantumPresetDto(
                id="pyscf-rhf-sto3g",
                version="1",
                name="RHF / STO-3G (Fast Educational Baseline)",
                category="quantum-chemistry",
                engine="PySCF",
                engine_version=ver,
                method="RHF",
                basis_set="sto-3g",
                max_atoms=20,
                max_scf_cycles=60,
                assumptions=base_assumptions,
                limitations=[
                    *base_limitations,
                    "Minimal STO-3G basis set lacks polarization and diffuse functions; suitable for qualitative teaching, not quantitative energetics.",
                ],
            ),
            xc=None,
        ),
        QuantumPresetSpec(
            dto=QuantumPresetDto(
                id="pyscf-rhf-631g",
                version="1",
                name="RHF / 6-31G (Split-Valence Hartree-Fock)",
                category="quantum-chemistry",
                engine="PySCF",
                engine_version=ver,
                method="RHF",
                basis_set="6-31g",
                max_atoms=16,
                max_scf_cycles=60,
                assumptions=base_assumptions,
                limitations=[
                    *base_limitations,
                    "Hartree-Fock neglects dynamic electron correlation.",
                ],
            ),
            xc=None,
        ),
        QuantumPresetSpec(
            dto=QuantumPresetDto(
                id="pyscf-b3lyp-631g",
                version="1",
                name="B3LYP / 6-31G (Hybrid DFT)",
                category="quantum-chemistry",
                engine="PySCF",
                engine_version=ver,
                method="RKS-B3LYP",
                basis_set="6-31g",
                max_atoms=16,
                max_scf_cycles=80,
                assumptions=base_assumptions,
                limitations=[
                    *base_limitations,
                    "B3LYP is an approximate hybrid exchange-correlation functional (self-interaction and dispersion errors remain).",
                ],
            ),
            xc="b3lyp",
        ),
        QuantumPresetSpec(
            dto=QuantumPresetDto(
                id="pyscf-b3lyp-def2svp",
                version="1",
                name="B3LYP / def2-SVP (Polarized Hybrid DFT)",
                category="quantum-chemistry",
                engine="PySCF",
                engine_version=ver,
                method="RKS-B3LYP",
                basis_set="def2-svp",
                max_atoms=14,
                max_scf_cycles=80,
                assumptions=base_assumptions,
                limitations=[
                    *base_limitations,
                    "B3LYP/def2-SVP omits explicit dispersion correction and diffuse functions.",
                ],
            ),
            xc="b3lyp",
        ),
    ]
    return {(s.dto.id, s.dto.version): s for s in specs}


def list_quantum_presets() -> list[QuantumPresetDto]:
    return [s.dto for s in _build_quantum_presets().values()]


def get_quantum_preset(preset_id: str, preset_version: str) -> QuantumPresetSpec:
    spec = _build_quantum_presets().get((preset_id, preset_version))
    if spec is None:
        raise PyScfAdapterError(
            "UNKNOWN_QUANTUM_PRESET",
            f"Unsupported quantum chemistry preset '{preset_id}' version '{preset_version}'.",
            field_path="model_preset_id",
        )
    return spec


@dataclass
class ValidatedQuantumSetup:
    preset: QuantumPresetSpec
    atom_spec: list[tuple[str, tuple[float, float, float]]]
    charge_e: int
    spin_multiplicity: int
    compute_fields: bool
    input_revision_id: str
    input_hash_sha256: str


def validate_quantum_request(req: QuantumJobCreateRequest) -> ValidatedQuantumSetup:
    preset = get_quantum_preset(req.model_preset_id, req.model_preset_version)
    mol = req.molecule

    if req.initial_structure_revision_id != mol.revision_id:
        raise PyScfAdapterError(
            "REVISION_ID_MISMATCH",
            "initial_structure_revision_id does not match molecule.revision_id.",
            field_path="initial_structure_revision_id",
        )

    if not mol.atoms:
        raise PyScfAdapterError(
            "EMPTY_STRUCTURE",
            "Cannot run quantum chemistry calculation on an empty structure.",
            field_path="molecule.atoms",
        )

    if len(mol.atoms) > preset.dto.max_atoms:
        raise PyScfAdapterError(
            "SYSTEM_TOO_LARGE_FOR_QUANTUM_PRESET",
            f"Structure has {len(mol.atoms)} atoms; preset '{preset.dto.id}' supports up to {preset.dto.max_atoms} atoms for responsive execution.",
            field_path="molecule.atoms",
        )

    sum_formal = sum(a.formal_charge for a in mol.atoms)
    if mol.net_charge != sum_formal:
        raise PyScfAdapterError(
            "NET_CHARGE_MISMATCH",
            f"Molecular net charge ({mol.net_charge}) does not equal sum of atom formal charges ({sum_formal}).",
            field_path="molecule.net_charge",
        )

    if mol.spin_multiplicity is not None and mol.spin_multiplicity != 1:
        raise PyScfAdapterError(
            "OPEN_SHELL_DEFERRED",
            f"Spin multiplicity {mol.spin_multiplicity} is deferred; closed-shell singlet (spin_multiplicity=1) only.",
            field_path="molecule.spin_multiplicity",
        )

    total_nuclear_charge = 0
    atom_spec: list[tuple[str, tuple[float, float, float]]] = []
    for idx, atom in enumerate(mol.atoms):
        if atom.element not in MVP_ELEMENT_SET:
            raise PyScfAdapterError(
                "UNSUPPORTED_ELEMENT",
                f"Element '{atom.element}' is outside the approved MVP chemistry baseline.",
                field_path=f"molecule.atoms[{idx}].element",
            )
        total_nuclear_charge += ATOMIC_NUMBERS[atom.element]
        atom_spec.append((atom.element, atom.position_angstrom))

    electron_count = total_nuclear_charge - mol.net_charge
    if electron_count <= 0:
        raise PyScfAdapterError(
            "INVALID_ELECTRON_COUNT",
            f"Computed non-positive electron count ({electron_count}).",
            field_path="molecule.net_charge",
        )
    if electron_count % 2 != 0:
        raise PyScfAdapterError(
            "ODD_ELECTRON_OPEN_SHELL_DEFERRED",
            f"Structure has {electron_count} electrons (odd count / radical). Restricted closed-shell RHF/RKS requires an even electron count.",
            field_path="molecule",
        )

    # Check overlapping nuclei to avoid nuclear repulsion singularity
    for i in range(len(mol.atoms)):
        for j in range(i + 1, len(mol.atoms)):
            ax, ay, az = mol.atoms[i].position_angstrom
            bx, by, bz = mol.atoms[j].position_angstrom
            dist = math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
            if dist < 0.25:
                raise PyScfAdapterError(
                    "NUCLEAR_OVERLAP",
                    f"Atoms '{mol.atoms[i].id}' and '{mol.atoms[j].id}' are too close ({dist:.3f} Å < 0.25 Å).",
                    field_path="molecule.atoms",
                )

    canonical_payload = json.dumps(
        {
            "preset_id": preset.dto.id,
            "preset_version": preset.dto.version,
            "molecule": mol.model_dump(),
            "compute_fields": req.compute_fields,
        },
        sort_keys=True,
    )
    input_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

    return ValidatedQuantumSetup(
        preset=preset,
        atom_spec=atom_spec,
        charge_e=mol.net_charge,
        spin_multiplicity=1,
        compute_fields=req.compute_fields,
        input_revision_id=mol.revision_id,
        input_hash_sha256=input_hash,
    )


def _downsample_indices(indices: np.ndarray, max_points: int) -> np.ndarray:
    if len(indices) <= max_points:
        return indices
    step = len(indices) / max_points
    picked = [indices[int(i * step)] for i in range(max_points)]
    return np.array(picked, dtype=indices.dtype)


def run_quantum_calculation(
    setup: ValidatedQuantumSetup,
    *,
    cancel_requested: Callable[[], bool],
    on_scf_cycle: Callable[[int], None],
) -> QuantumResultsDto:
    mol = gto.M(
        atom=setup.atom_spec,
        basis=setup.preset.dto.basis_set,
        charge=setup.charge_e,
        spin=0,
        unit="Angstrom",
        verbose=0,
    )

    if setup.preset.xc is None:
        mf: scf.hf.SCF = scf.RHF(mol)
    else:
        mf_ks = dft.RKS(mol)
        mf_ks.xc = setup.preset.xc
        mf = mf_ks

    mf.max_cycle = setup.preset.dto.max_scf_cycles
    mf.conv_tol = 1e-8

    cycle_counter = 0

    def _scf_callback(_envs: dict) -> None:
        nonlocal cycle_counter
        cycle_counter += 1
        on_scf_cycle(cycle_counter)
        if cancel_requested():
            raise QuantumCancelledException()

    mf.callback = _scf_callback
    total_energy_eh = float(mf.kernel())
    converged = bool(mf.converged)

    warnings: list[str] = []
    if not converged:
        warnings.append(
            f"SCF did not converge within {setup.preset.dto.max_scf_cycles} cycles; reported energy and orbitals are unconverged approximations."
        )

    mo_energy = np.asarray(mf.mo_energy, dtype=float)
    mo_occ = np.asarray(mf.mo_occ, dtype=float)
    occ_indices = np.where(mo_occ > 0.0)[0]
    virt_indices = np.where(mo_occ == 0.0)[0]

    homo_idx = int(occ_indices[-1]) if len(occ_indices) > 0 else None
    lumo_idx = int(virt_indices[0]) if len(virt_indices) > 0 else None

    homo_eh = float(mo_energy[homo_idx]) if homo_idx is not None else None
    lumo_eh = float(mo_energy[lumo_idx]) if lumo_idx is not None else None
    gap_ev = (
        round((lumo_eh - homo_eh) * HARTREE_TO_EV, 4)
        if homo_eh is not None and lumo_eh is not None
        else None
    )

    # Window up to 16 orbitals around HOMO-LUMO
    if homo_idx is not None:
        start_orb = max(0, homo_idx - 7)
        end_orb = min(len(mo_energy), homo_idx + 9)
    else:
        start_orb = 0
        end_orb = min(len(mo_energy), 16)

    orbitals: list[QuantumOrbitalEnergyDto] = []
    for i in range(start_orb, end_orb):
        if i == homo_idx:
            label = "HOMO"
        elif homo_idx is not None and i < homo_idx:
            label = f"HOMO-{homo_idx - i}"
        elif i == lumo_idx:
            label = "LUMO"
        elif lumo_idx is not None and i > lumo_idx:
            label = f"LUMO+{i - lumo_idx}"
        else:
            label = f"MO {i + 1}"
        e_eh = float(mo_energy[i])
        orbitals.append(
            QuantumOrbitalEnergyDto(
                index=i,
                label=label,
                occupancy=float(mo_occ[i]),
                energy_hartree=round(e_eh, 6),
                energy_ev=round(e_eh * HARTREE_TO_EV, 4),
            )
        )

    dip_vec = mf.dip_moment(unit="Debye", verbose=0)
    dipole = (round(float(dip_vec[0]), 4), round(float(dip_vec[1]), 4), round(float(dip_vec[2]), 4))
    dipole_mag = round(math.sqrt(dipole[0] ** 2 + dipole[1] ** 2 + dipole[2] ** 2), 4)

    homo_field: QuantumOrbitalAmplitudeFieldDto | None = None
    density_field: QuantumElectronDensityFieldDto | None = None

    if setup.compute_fields and not cancel_requested():
        coords_ang = np.array([pos for _, pos in setup.atom_spec], dtype=float)
        pad = 2.2
        mins = coords_ang.min(axis=0) - pad
        maxs = coords_ang.max(axis=0) + pad
        n_pts = 22
        xs = np.linspace(mins[0], maxs[0], n_pts)
        ys = np.linspace(mins[1], maxs[1], n_pts)
        zs = np.linspace(mins[2], maxs[2], n_pts)
        grid_ang = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), axis=-1).reshape(-1, 3)

        ao = numint.eval_ao(mol, grid_ang * BOHR_PER_ANGSTROM)
        dm = mf.make_rdm1()
        rho = numint.eval_rho(mol, ao, dm)

        rho_iso = 0.015
        rho_mask = np.where((rho >= rho_iso) & (rho <= 0.35))[0]
        rho_mask = _downsample_indices(rho_mask, 2200)
        density_field = QuantumElectronDensityFieldDto(
            field_kind="total-electron-density",
            isovalue=rho_iso,
            unit="e/bohr^3",
            samples=[
                QuantumScalarSampleDto(
                    position_angstrom=(
                        round(float(grid_ang[idx, 0]), 3),
                        round(float(grid_ang[idx, 1]), 3),
                        round(float(grid_ang[idx, 2]), 3),
                    ),
                    value=round(float(rho[idx]), 5),
                )
                for idx in rho_mask
            ],
        )

        if homo_idx is not None:
            homo_iso = 0.04
            mo_coeff = np.asarray(mf.mo_coeff, dtype=float)
            psi = ao @ mo_coeff[:, homo_idx]
            psi_mask = np.where(np.abs(psi) >= homo_iso)[0]
            psi_mask = _downsample_indices(psi_mask, 2200)
            homo_field = QuantumOrbitalAmplitudeFieldDto(
                field_kind="orbital-amplitude-and-phase",
                orbital_label="HOMO",
                orbital_index=homo_idx,
                isovalue=homo_iso,
                unit="bohr^-3/2",
                samples=[
                    QuantumScalarSampleDto(
                        position_angstrom=(
                            round(float(grid_ang[idx, 0]), 3),
                            round(float(grid_ang[idx, 1]), 3),
                            round(float(grid_ang[idx, 2]), 3),
                        ),
                        value=round(float(psi[idx]), 5),
                    )
                    for idx in psi_mask
                ],
            )

    return QuantumResultsDto(
        job_id="",  # populated by QuantumJobManager
        status="completed",
        engine="PySCF",
        engine_version=pyscf_version(),
        method=setup.preset.dto.method,
        basis_set=setup.preset.dto.basis_set,
        charge_e=setup.charge_e,
        spin_multiplicity=setup.spin_multiplicity,
        converged=converged,
        scf_cycles=cycle_counter,
        total_energy_hartree=round(total_energy_eh, 8),
        total_energy_kj_mol=round(total_energy_eh * HARTREE_TO_KJ_MOL, 4),
        energy_basis="mole-of-systems",
        homo_energy_hartree=round(homo_eh, 6) if homo_eh is not None else None,
        lumo_energy_hartree=round(lumo_eh, 6) if lumo_eh is not None else None,
        homo_lumo_gap_ev=gap_ev,
        dipole_moment_debye=dipole,
        dipole_magnitude_debye=dipole_mag,
        orbitals=orbitals,
        homo_orbital_field=homo_field,
        electron_density_field=density_field,
        input_structure_revision_id=setup.input_revision_id,
        input_structure_hash_sha256=setup.input_hash_sha256,
        assumptions=setup.preset.dto.assumptions,
        limitations=setup.preset.dto.limitations,
        warnings=warnings,
    )
