from __future__ import annotations

import hashlib
import json
from collections import deque
from dataclasses import dataclass
from typing import Callable

import openmm
import openmm.app as mm_app
import openmm.unit as mm_unit

from app.models.contracts import (
    ExperimentCreateRequest,
    MoleculeInput,
    PresetParameterLimits,
    ReproducibilityRecordDto,
    ResolvedExperimentSettingsDto,
    SimulationPresetDto,
    TrajectoryFrameDto,
)

# Exact CODATA/SI molar gas constant in kJ / (mol * K)
MOLAR_GAS_CONSTANT_KJ_MOL_K = 8.31446261815324e-3

ANGSTROM_TO_NM = 0.1
NM_TO_ANGSTROM = 10.0


class OpenMMAdapterError(Exception):
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


def openmm_version() -> str:
    return openmm.__version__


@dataclass(frozen=True)
class PresetSpec:
    dto: SimulationPresetDto
    friction_per_ps: float | None


def _build_presets() -> dict[tuple[str, str], PresetSpec]:
    ver = openmm_version()
    common_assumptions = [
        "Rigid 3-site TIP3P water model from amber14/tip3p.xml (rigidWater=True, constraints=HBonds via SETTLE).",
        "All energies are reported on a molar whole-system basis (kJ/mol of modeled system).",
        "Center-of-mass translation is removed via CMMotionRemover (3 degrees of freedom subtracted from kinetic temperature).",
        "Non-periodic vacuum boundary conditions (NoCutoff): models a finite water cluster rather than bulk liquid.",
    ]
    common_limitations = [
        "Standard classical TIP3P force field uses fixed topology and cannot model bond breaking, proton transfer, or chemical reactions.",
        "Instantaneous kinetic temperature fluctuates strongly for small finite clusters and is distinct from a thermostat target temperature.",
        "Results depend on force-field parameterization, finite timestep, initial coordinates, and random velocity seed.",
    ]

    nvt = PresetSpec(
        dto=SimulationPresetDto(
            id="tip3p-water-nvt",
            version="1",
            name="TIP3P Water Cluster — Langevin NVT",
            category="molecular-mechanics",
            engine="OpenMM",
            engine_version=ver,
            force_field="AMBER14 TIP3P (amber14/tip3p.xml)",
            integrator="LangevinMiddleIntegrator (friction 1.0 / ps)",
            ensemble="NVT",
            constraints="HBonds + rigidWater (SETTLE) + CMMotionRemover",
            boundary_conditions="Non-periodic vacuum cluster (NoCutoff)",
            supports_thermostat_target=True,
            default_temperature_k=300.0,
            default_timestep_fs=1.0,
            default_duration_ps=2.0,
            limits=PresetParameterLimits(
                min_water_molecules=2,
                max_water_molecules=64,
                min_temperature_k=50.0,
                max_temperature_k=600.0,
                min_timestep_fs=0.5,
                max_timestep_fs=2.0,
                min_duration_ps=0.1,
                max_duration_ps=20.0,
            ),
            assumptions=common_assumptions,
            limitations=[
                *common_limitations,
                "NVT Langevin thermostatting exchanges heat with a stochastic bath, so total system energy is not conserved.",
            ],
        ),
        friction_per_ps=1.0,
    )

    nve = PresetSpec(
        dto=SimulationPresetDto(
            id="tip3p-water-nve",
            version="1",
            name="TIP3P Water Cluster — Verlet NVE (Energy Conservation)",
            category="molecular-mechanics",
            engine="OpenMM",
            engine_version=ver,
            force_field="AMBER14 TIP3P (amber14/tip3p.xml)",
            integrator="VerletIntegrator (symplectic leapfrog)",
            ensemble="NVE",
            constraints="HBonds + rigidWater (SETTLE) + CMMotionRemover",
            boundary_conditions="Non-periodic vacuum cluster (NoCutoff)",
            supports_thermostat_target=False,
            default_temperature_k=300.0,
            default_timestep_fs=0.5,
            default_duration_ps=1.0,
            limits=PresetParameterLimits(
                min_water_molecules=2,
                max_water_molecules=64,
                min_temperature_k=50.0,
                max_temperature_k=600.0,
                min_timestep_fs=0.25,
                max_timestep_fs=1.0,
                min_duration_ps=0.1,
                max_duration_ps=20.0,
            ),
            assumptions=[
                *common_assumptions,
                "Initial velocities are sampled at the requested initial temperature, then integrated microcanonically (NVE) with no thermostat.",
            ],
            limitations=[
                *common_limitations,
                "Energy conservation is approximate up to finite-timestep integration drift and constraint tolerances.",
            ],
        ),
        friction_per_ps=None,
    )

    return {
        (nvt.dto.id, nvt.dto.version): nvt,
        (nve.dto.id, nve.dto.version): nve,
    }


def list_presets() -> list[SimulationPresetDto]:
    return [spec.dto for spec in _build_presets().values()]


def get_preset(preset_id: str, preset_version: str) -> PresetSpec:
    presets = _build_presets()
    spec = presets.get((preset_id, preset_version))
    if spec is None:
        raise OpenMMAdapterError(
            "UNKNOWN_MODEL_PRESET",
            f"Unsupported model preset '{preset_id}' version '{preset_version}'.",
            http_status=422,
            field_path="model_preset_id",
        )
    return spec


def _time_to_fs(value: float, unit: str) -> float:
    return value if unit == "fs" else value * 1000.0


def _time_to_ps(value: float, unit: str) -> float:
    return value * 0.001 if unit == "fs" else value


@dataclass
class ValidatedWaterSetup:
    preset: PresetSpec
    atom_ids: list[str]
    topology: mm_app.Topology
    positions_nm: list[openmm.Vec3]
    temperature_k: float
    timestep_fs: float
    duration_ps: float
    total_steps: int
    report_interval_steps: int
    minimize_before_run: bool
    random_seed: int
    input_hash_sha256: str


def validate_experiment_request(req: ExperimentCreateRequest) -> ValidatedWaterSetup:
    preset = get_preset(req.model_preset_id, req.model_preset_version)
    limits = preset.dto.limits

    if req.initial_structure_revision_id != req.molecule.revision_id:
        raise OpenMMAdapterError(
            "REVISION_ID_MISMATCH",
            "initial_structure_revision_id does not match molecule.revision_id.",
            field_path="initial_structure_revision_id",
        )

    temperature_k = float(req.settings.temperature.value)
    if not (limits.min_temperature_k <= temperature_k <= limits.max_temperature_k):
        raise OpenMMAdapterError(
            "TEMPERATURE_OUT_OF_RANGE",
            f"Temperature {temperature_k} K is outside preset range [{limits.min_temperature_k}, {limits.max_temperature_k}] K.",
            field_path="settings.temperature.value",
        )

    timestep_fs = _time_to_fs(req.settings.timestep.value, req.settings.timestep.unit)
    if not (limits.min_timestep_fs <= timestep_fs <= limits.max_timestep_fs):
        raise OpenMMAdapterError(
            "TIMESTEP_OUT_OF_RANGE",
            f"Timestep {timestep_fs} fs is outside preset range [{limits.min_timestep_fs}, {limits.max_timestep_fs}] fs.",
            field_path="settings.timestep",
        )

    duration_ps = _time_to_ps(req.settings.duration.value, req.settings.duration.unit)
    if not (limits.min_duration_ps <= duration_ps <= limits.max_duration_ps):
        raise OpenMMAdapterError(
            "DURATION_OUT_OF_RANGE",
            f"Duration {duration_ps} ps is outside preset range [{limits.min_duration_ps}, {limits.max_duration_ps}] ps.",
            field_path="settings.duration",
        )

    total_steps = max(1, round((duration_ps * 1000.0) / timestep_fs))
    if total_steps > 40_000:
        raise OpenMMAdapterError(
            "STEP_BUDGET_EXCEEDED",
            f"Requested {total_steps} steps exceeds the single-job limit of 40,000 steps.",
            field_path="settings.duration",
        )

    mol = req.molecule
    if not mol.atoms:
        raise OpenMMAdapterError(
            "EMPTY_STRUCTURE",
            "Cannot run molecular dynamics on an empty structure.",
            field_path="molecule.atoms",
        )

    atom_by_id = {a.id: a for a in mol.atoms}
    if len(atom_by_id) != len(mol.atoms):
        raise OpenMMAdapterError(
            "DUPLICATE_ATOM_ID",
            "Structure contains duplicate atom IDs.",
            field_path="molecule.atoms",
        )

    if mol.net_charge != 0 or any(a.formal_charge != 0 for a in mol.atoms):
        raise OpenMMAdapterError(
            "UNSUPPORTED_SYSTEM_FOR_PRESET",
            "TIP3P water preset requires neutral water molecules (zero formal and net charge).",
            field_path="molecule.net_charge",
        )

    if any(a.isotope is not None for a in mol.atoms):
        raise OpenMMAdapterError(
            "ISOTOPE_OVERRIDE_UNSUPPORTED_FOR_PRESET",
            "TIP3P AMBER14 preset uses fixed standard O/H masses and does not support custom isotope mass overrides.",
            field_path="molecule.atoms",
        )

    if mol.spin_multiplicity is not None and mol.spin_multiplicity != 1:
        raise OpenMMAdapterError(
            "UNSUPPORTED_SYSTEM_FOR_PRESET",
            "Classical TIP3P molecular dynamics supports closed-shell water molecules only.",
            field_path="molecule.spin_multiplicity",
        )

    adj: dict[str, list[tuple[str, object]]] = {a.id: [] for a in mol.atoms}
    seen_pairs: set[tuple[str, str]] = set()
    for b in mol.bonds:
        if b.atom_a not in atom_by_id or b.atom_b not in atom_by_id:
            raise OpenMMAdapterError(
                "DANGLING_BOND_REF",
                f"Bond '{b.id}' references missing atom.",
                field_path="molecule.bonds",
            )
        if b.atom_a == b.atom_b:
            raise OpenMMAdapterError(
                "SELF_BOND",
                f"Bond '{b.id}' cannot be a self-bond.",
                field_path="molecule.bonds",
            )
        pair = (b.atom_a, b.atom_b) if b.atom_a < b.atom_b else (b.atom_b, b.atom_a)
        if pair in seen_pairs:
            raise OpenMMAdapterError(
                "DUPLICATE_BOND_PAIR",
                f"Duplicate bond between '{b.atom_a}' and '{b.atom_b}'.",
                field_path="molecule.bonds",
            )
        seen_pairs.add(pair)
        if b.order != 1:
            raise OpenMMAdapterError(
                "UNSUPPORTED_SYSTEM_FOR_PRESET",
                "TIP3P water preset only supports single O–H bonds.",
                field_path="molecule.bonds",
            )
        adj[b.atom_a].append((b.atom_b, b))
        adj[b.atom_b].append((b.atom_a, b))

    # Group connected components and verify each is an intact H2O molecule
    visited: set[str] = set()
    water_components: list[tuple[str, str, str]] = []
    for atom in mol.atoms:
        if atom.id in visited:
            continue
        comp: list[str] = []
        queue: deque[str] = deque([atom.id])
        visited.add(atom.id)
        while queue:
            curr = queue.popleft()
            comp.append(curr)
            for nbr, _ in adj[curr]:
                if nbr not in visited:
                    visited.add(nbr)
                    queue.append(nbr)

        if len(comp) != 3:
            raise OpenMMAdapterError(
                "UNSUPPORTED_SYSTEM_FOR_PRESET",
                f"Preset '{preset.dto.id}' only supports pure H2O molecules; found a {len(comp)}-atom component.",
                field_path="molecule",
            )

        oxygens = [cid for cid in comp if atom_by_id[cid].element == "O"]
        hydrogens = [cid for cid in comp if atom_by_id[cid].element == "H"]
        if len(oxygens) != 1 or len(hydrogens) != 2:
            raise OpenMMAdapterError(
                "UNSUPPORTED_SYSTEM_FOR_PRESET",
                f"Preset '{preset.dto.id}' requires H2O stoichiometry (1 O, 2 H per molecule).",
                field_path="molecule",
            )
        o_id = oxygens[0]
        h1_id, h2_id = hydrogens[0], hydrogens[1]
        o_neighbors = {nbr for nbr, _ in adj[o_id]}
        if o_neighbors != {h1_id, h2_id} or len(adj[h1_id]) != 1 or len(adj[h2_id]) != 1:
            raise OpenMMAdapterError(
                "UNSUPPORTED_SYSTEM_FOR_PRESET",
                f"Water molecule containing '{o_id}' must have exactly two O–H single bonds.",
                field_path="molecule.bonds",
            )
        water_components.append((o_id, h1_id, h2_id))

    num_waters = len(water_components)
    if num_waters < limits.min_water_molecules:
        raise OpenMMAdapterError(
            "INSUFFICIENT_ENSEMBLE_SIZE",
            (
                f"Preset '{preset.dto.id}' requires at least {limits.min_water_molecules} H2O molecules "
                f"(found {num_waters}). Load 'Water Cluster (8 H₂O)' or add another water molecule so "
                "ensemble temperature and intermolecular interactions are physically meaningful."
            ),
            field_path="molecule.atoms",
        )
    if num_waters > limits.max_water_molecules:
        raise OpenMMAdapterError(
            "SYSTEM_TOO_LARGE_FOR_PRESET",
            f"System has {num_waters} H2O molecules; preset maximum is {limits.max_water_molecules}.",
            field_path="molecule.atoms",
        )

    # Build OpenMM Topology in exact atom submission order so returned positions align 1:1
    topology = mm_app.Topology()
    chain = topology.addChain()
    mm_atom_by_id: dict[str, mm_app.Atom] = {}
    atom_index_by_id = {a.id: idx for idx, a in enumerate(mol.atoms)}

    # Add residues per water molecule, while recording exact input index mapping
    # Note: OpenMM positions array must match topology atom order; so let's keep topology order = water_components order
    # and reorder output positions back into `mol.atoms` order!
    ordered_input_indices: list[int] = []
    positions_nm: list[openmm.Vec3] = []

    for o_id, h1_id, h2_id in water_components:
        res = topology.addResidue("HOH", chain)
        mm_o = topology.addAtom("O", mm_app.element.oxygen, res)
        mm_h1 = topology.addAtom("H1", mm_app.element.hydrogen, res)
        mm_h2 = topology.addAtom("H2", mm_app.element.hydrogen, res)
        topology.addBond(mm_o, mm_h1)
        topology.addBond(mm_o, mm_h2)
        mm_atom_by_id[o_id] = mm_o
        mm_atom_by_id[h1_id] = mm_h1
        mm_atom_by_id[h2_id] = mm_h2

        for aid in (o_id, h1_id, h2_id):
            ordered_input_indices.append(atom_index_by_id[aid])
            px, py, pz = atom_by_id[aid].position_angstrom
            positions_nm.append(
                openmm.Vec3(px * ANGSTROM_TO_NM, py * ANGSTROM_TO_NM, pz * ANGSTROM_TO_NM)
            )

    # Reorder atom_ids to match topology order (or store topology-order atom_ids)
    topo_atom_ids = [mol.atoms[idx].id for idx in ordered_input_indices]

    canonical_payload = json.dumps(
        {
            "preset_id": preset.dto.id,
            "preset_version": preset.dto.version,
            "molecule": mol.model_dump(),
            "temperature_k": temperature_k,
            "timestep_fs": timestep_fs,
            "duration_ps": duration_ps,
            "report_interval_steps": req.settings.report_interval_steps,
            "minimize_before_run": req.settings.minimize_before_run,
            "random_seed": req.random_seed,
        },
        sort_keys=True,
    )
    input_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

    return ValidatedWaterSetup(
        preset=preset,
        atom_ids=topo_atom_ids,
        topology=topology,
        positions_nm=positions_nm,
        temperature_k=temperature_k,
        timestep_fs=timestep_fs,
        duration_ps=duration_ps,
        total_steps=total_steps,
        report_interval_steps=req.settings.report_interval_steps,
        minimize_before_run=req.settings.minimize_before_run,
        random_seed=req.random_seed,
        input_hash_sha256=input_hash,
    )


def _select_platform() -> openmm.Platform:
    names = [openmm.Platform.getPlatform(i).getName() for i in range(openmm.Platform.getNumPlatforms())]
    if "CPU" in names:
        return openmm.Platform.getPlatformByName("CPU")
    return openmm.Platform.getPlatformByName("Reference")


def run_water_simulation(
    setup: ValidatedWaterSetup,
    *,
    cancel_requested: Callable[[], bool],
    on_frame: Callable[[TrajectoryFrameDto, int], None],
    on_initialized: Callable[[int, str, str], None] | None = None,
) -> tuple[ReproducibilityRecordDto, str]:
    ff = mm_app.ForceField("amber14/tip3p.xml")
    system = ff.createSystem(
        setup.topology,
        nonbondedMethod=mm_app.NoCutoff,
        constraints=mm_app.HBonds,
        rigidWater=True,
    )

    has_cm_remover = any(
        isinstance(system.getForce(i), openmm.CMMotionRemover)
        for i in range(system.getNumForces())
    )
    dof = 3 * system.getNumParticles() - system.getNumConstraints() - (3 if has_cm_remover else 0)
    if dof <= 0:
        raise OpenMMAdapterError(
            "INVALID_DEGREES_OF_FREEDOM",
            f"Computed non-positive degrees of freedom ({dof}).",
            http_status=422,
        )

    dt_ps = setup.timestep_fs * 0.001
    if setup.preset.dto.ensemble == "NVT":
        integrator: openmm.Integrator = openmm.LangevinMiddleIntegrator(
            setup.temperature_k * mm_unit.kelvin,
            (setup.preset.friction_per_ps or 1.0) / mm_unit.picosecond,
            dt_ps * mm_unit.picoseconds,
        )
        integrator.setRandomNumberSeed(setup.random_seed)
    else:
        integrator = openmm.VerletIntegrator(dt_ps * mm_unit.picoseconds)

    platform = _select_platform()
    simulation = mm_app.Simulation(setup.topology, system, integrator, platform)
    precision = "mixed"
    try:
        precision = str(platform.getPropertyValue(simulation.context, "Precision"))
    except Exception:
        precision = "default"
    if on_initialized is not None:
        on_initialized(dof, platform.getName(), precision)
    simulation.context.setPositions(setup.positions_nm * mm_unit.nanometers)

    if setup.minimize_before_run:
        simulation.minimizeEnergy(maxIterations=150)

    simulation.context.setVelocitiesToTemperature(
        setup.temperature_k * mm_unit.kelvin,
        setup.random_seed,
    )
    if has_cm_remover:
        vels = simulation.context.getState(getVelocities=True).getVelocities(asNumpy=False)
        masses = [
            system.getParticleMass(i).value_in_unit(mm_unit.dalton)
            for i in range(system.getNumParticles())
        ]
        total_mass = sum(masses)
        if total_mass > 0:
            com_vel = (
                sum(
                    (v * m for v, m in zip(vels, masses)),
                    openmm.Vec3(0.0, 0.0, 0.0) * mm_unit.nanometer / mm_unit.picosecond,
                )
                / total_mass
            )
            simulation.context.setVelocities([v - com_vel for v in vels])
            simulation.context.applyVelocityConstraints(1e-6)

    def _capture_frame(frame_index: int, step_num: int) -> TrajectoryFrameDto:
        state = simulation.context.getState(getPositions=True, getEnergy=True)
        ke = float(state.getKineticEnergy().value_in_unit(mm_unit.kilojoules_per_mole))
        pe = float(state.getPotentialEnergy().value_in_unit(mm_unit.kilojoules_per_mole))
        pos_nm = state.getPositions(asNumpy=False)
        pos_angstrom: list[tuple[float, float, float]] = [
            (
                round(float(v.x * NM_TO_ANGSTROM), 5),
                round(float(v.y * NM_TO_ANGSTROM), 5),
                round(float(v.z * NM_TO_ANGSTROM), 5),
            )
            for v in pos_nm
        ]
        inst_temp = (2.0 * ke) / (dof * MOLAR_GAS_CONSTANT_KJ_MOL_K)
        return TrajectoryFrameDto(
            frame_index=frame_index,
            step=step_num,
            simulation_time_ps=round(step_num * dt_ps, 6),
            kinetic_energy_kj_mol=round(ke, 4),
            potential_energy_kj_mol=round(pe, 4),
            total_energy_kj_mol=round(ke + pe, 4),
            instantaneous_temperature_k=round(inst_temp, 2),
            positions_angstrom=pos_angstrom,
        )

    frame_idx = 0
    on_frame(_capture_frame(frame_idx, 0), 0)

    completed_steps = 0
    termination_status = "completed"
    interval = setup.report_interval_steps

    while completed_steps < setup.total_steps:
        if cancel_requested():
            termination_status = "cancelled"
            break
        chunk = min(interval, setup.total_steps - completed_steps)
        simulation.step(chunk)
        completed_steps += chunk
        frame_idx += 1
        on_frame(_capture_frame(frame_idx, completed_steps), completed_steps)
        if cancel_requested() and completed_steps < setup.total_steps:
            termination_status = "cancelled"
            break

    precision = "mixed"
    try:
        precision = platform.getPropertyValue(simulation.context, "Precision")
    except Exception:
        precision = "default"

    repro = ReproducibilityRecordDto(
        input_structure_revision_id=setup.atom_ids[0] and "",  # overwritten by manager with exact revision_id
        input_structure_hash_sha256=setup.input_hash_sha256,
        model_preset_id=setup.preset.dto.id,
        model_preset_version=setup.preset.dto.version,
        force_field_source=setup.preset.dto.force_field,
        integrator=setup.preset.dto.integrator,
        ensemble=setup.preset.dto.ensemble,
        engine="OpenMM",
        engine_version=openmm_version(),
        platform_name=platform.getName(),
        numerical_precision=str(precision),
        random_seed=setup.random_seed,
        degrees_of_freedom=dof,
        constraints_summary=setup.preset.dto.constraints,
        resolved_settings=ResolvedExperimentSettingsDto(
            temperature_k=setup.temperature_k,
            timestep_fs=setup.timestep_fs,
            duration_ps=setup.duration_ps,
            total_steps=setup.total_steps,
            report_interval_steps=setup.report_interval_steps,
            minimize_before_run=setup.minimize_before_run,
        ),
        termination_status=termination_status,  # type: ignore[arg-type]
        energy_basis="mole-of-systems",
        energy_unit="kJ/mol",
        distance_unit="angstrom",
        time_unit="ps",
        temperature_unit="K",
    )
    return repro, termination_status
