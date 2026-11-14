from __future__ import annotations

import math

import numpy as np

from app.models.contracts import (
    NuclearForceConfigInput,
    NuclearParticleInput,
    NuclearPresetDto,
    NuclearReferenceBenchmarkDto,
    NuclearSimulateRequest,
    NuclearSimulationResultDto,
    NuclearTrajectoryFrameDto,
)

NUCLEAR_COULOMB_KE_E2_MEV_FM = 1.439964547842567
NUCLEAR_DIPOLE_CONST_MEV_FM3 = 0.0159209
PROTON_MASS_MEV_C2 = 938.27208816
NEUTRON_MASS_MEV_C2 = 939.56542052
ALPHA_MASS_MEV_C2 = 3727.3794066
PROTON_MU_N = 2.792847
NEUTRON_MU_N = -1.913043
GRAVITY_MEV_FM_PER_MEV2 = 1.32379424e-42

R_SINGULARITY_FLOOR_FM = 0.08
COLLAPSE_DISTANCE_FM = 0.35


class NuclearToyAdapterError(Exception):
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


def _presets_map() -> dict[str, NuclearPresetDto]:
    c12_side = 3.05
    c12_r = c12_side / math.sqrt(3.0)
    o16_s = 3.05 / (2.0 * math.sqrt(2.0))

    default_cfg = NuclearForceConfigInput()

    presets = [
        NuclearPresetDto(
            id="be8-two-alpha",
            name="Beryllium-8 (2α)",
            subtitle="2 Alpha Clusters · Unbound Resonance",
            description="Two alpha particles starting near the shallow nuclear well with realistic relative zero-point motion.",
            particles=[
                NuclearParticleInput(
                    id="a1",
                    kind="alpha",
                    label="α1 (He-4)",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-1.7, 0.0, 0.0),
                    velocity_c=(-0.034, 0.0, 0.0),
                    dipole_direction=(1.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="a2",
                    kind="alpha",
                    label="α2 (He-4)",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(1.7, 0.0, 0.0),
                    velocity_c=(0.034, 0.0, 0.0),
                    dipole_direction=(-1.0, 0.0, 0.0),
                ),
            ],
            cluster_edges=[("a1", "a2")],
            recommended_force_config=default_cfg,
            benchmark=NuclearReferenceBenchmarkDto(
                nuclide="⁸Be (4p, 4n)",
                total_binding_energy_mev=56.5,
                cluster_binding_energy_mev=0.0918,
                stability_summary="Unbound (+0.0918 MeV above 2α threshold)",
                half_life_note="Decays into 2α in ~8.19 × 10⁻¹⁷ s",
                source="AME2020 / NNDC NuDat 3.0",
            ),
        ),
        NuclearPresetDto(
            id="c12-three-alpha",
            name="Carbon-12 (3α Lock)",
            subtitle="3 Alpha Clusters · Equilateral Triangle",
            description="Three alpha particles in an equilateral triangle (~3.05 fm side).",
            particles=[
                NuclearParticleInput(
                    id="a1",
                    kind="alpha",
                    label="α1",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(c12_r, 0.0, 0.0),
                    velocity_c=(0.0, 0.012, 0.0),
                    dipole_direction=(0.0, 1.0, 0.0),
                ),
                NuclearParticleInput(
                    id="a2",
                    kind="alpha",
                    label="α2",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-0.5 * c12_r, (math.sqrt(3.0) / 2.0) * c12_r, 0.0),
                    velocity_c=(-0.01, -0.006, 0.0),
                    dipole_direction=(-math.sqrt(3.0) / 2.0, -0.5, 0.0),
                ),
                NuclearParticleInput(
                    id="a3",
                    kind="alpha",
                    label="α3",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-0.5 * c12_r, -(math.sqrt(3.0) / 2.0) * c12_r, 0.0),
                    velocity_c=(0.01, -0.006, 0.0),
                    dipole_direction=(math.sqrt(3.0) / 2.0, -0.5, 0.0),
                ),
            ],
            cluster_edges=[("a1", "a2"), ("a2", "a3"), ("a3", "a1")],
            recommended_force_config=default_cfg,
            benchmark=NuclearReferenceBenchmarkDto(
                nuclide="¹²C Ground State (6p, 6n)",
                total_binding_energy_mev=92.162,
                cluster_binding_energy_mev=-7.275,
                stability_summary="Stable (−7.275 MeV below 3α threshold)",
                half_life_note="Stable (98.93% natural abundance)",
                source="AME2020 / NNDC NuDat 3.0",
            ),
        ),
        NuclearPresetDto(
            id="c12-hoyle-state",
            name="Carbon-12 (Hoyle State)",
            subtitle="3 Alpha Clusters · Extended Obtuse Chain",
            description="Excited 0⁺₂ state of Carbon-12 near the 3α threshold.",
            particles=[
                NuclearParticleInput(
                    id="a1",
                    kind="alpha",
                    label="α1",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-3.3, -0.35, 0.0),
                    velocity_c=(0.006, 0.005, 0.0),
                ),
                NuclearParticleInput(
                    id="a2",
                    kind="alpha",
                    label="α2",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(0.0, 0.7, 0.0),
                    velocity_c=(0.0, -0.01, 0.0),
                ),
                NuclearParticleInput(
                    id="a3",
                    kind="alpha",
                    label="α3",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(3.3, -0.35, 0.0),
                    velocity_c=(-0.006, 0.005, 0.0),
                ),
            ],
            cluster_edges=[("a1", "a2"), ("a2", "a3"), ("a3", "a1")],
            recommended_force_config=default_cfg,
            benchmark=NuclearReferenceBenchmarkDto(
                nuclide="¹²C Hoyle State (7.654 MeV 0⁺₂)",
                total_binding_energy_mev=84.508,
                cluster_binding_energy_mev=0.379,
                stability_summary="Near-threshold resonance (+0.379 MeV above 3α)",
                half_life_note="Excited state; decays via 3α or radiative γ to ¹²C ground",
                source="NNDC NuDat 3.0 / Freer & Fynbo (2014)",
            ),
        ),
        NuclearPresetDto(
            id="o16-four-alpha",
            name="Oxygen-16 (4α Tetrahedron)",
            subtitle="4 Alpha Clusters · 3D Pyramid",
            description="Four alpha clusters at the vertices of a regular tetrahedron.",
            particles=[
                NuclearParticleInput(
                    id="a1",
                    kind="alpha",
                    label="α1",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(o16_s, o16_s, o16_s),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="a2",
                    kind="alpha",
                    label="α2",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(o16_s, -o16_s, -o16_s),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="a3",
                    kind="alpha",
                    label="α3",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-o16_s, o16_s, -o16_s),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="a4",
                    kind="alpha",
                    label="α4",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-o16_s, -o16_s, o16_s),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
            ],
            cluster_edges=[
                ("a1", "a2"),
                ("a1", "a3"),
                ("a1", "a4"),
                ("a2", "a3"),
                ("a2", "a4"),
                ("a3", "a4"),
            ],
            recommended_force_config=default_cfg,
            benchmark=NuclearReferenceBenchmarkDto(
                nuclide="¹⁶O Ground State (8p, 8n)",
                total_binding_energy_mev=127.619,
                cluster_binding_energy_mev=-14.437,
                stability_summary="Stable (−14.437 MeV below 4α threshold)",
                half_life_note="Stable (99.757% natural abundance)",
                source="AME2020 / NNDC NuDat 3.0",
            ),
        ),
        NuclearPresetDto(
            id="he4-nucleons",
            name="Helium-4 (2p + 2n)",
            subtitle="4 Individual Nucleons · Core Tetrahedron",
            description="Two protons and two neutrons forming an alpha core.",
            particles=[
                NuclearParticleInput(
                    id="p1",
                    kind="proton",
                    label="p1 (+1)",
                    charge_e=1.0,
                    mass_mev_c2=PROTON_MASS_MEV_C2,
                    position_fm=(0.68, 0.68, 0.68),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="p2",
                    kind="proton",
                    label="p2 (+1)",
                    charge_e=1.0,
                    mass_mev_c2=PROTON_MASS_MEV_C2,
                    position_fm=(0.68, -0.68, -0.68),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="n1",
                    kind="neutron",
                    label="n1 (0)",
                    charge_e=0.0,
                    mass_mev_c2=NEUTRON_MASS_MEV_C2,
                    position_fm=(-0.68, 0.68, -0.68),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="n2",
                    kind="neutron",
                    label="n2 (0)",
                    charge_e=0.0,
                    mass_mev_c2=NEUTRON_MASS_MEV_C2,
                    position_fm=(-0.68, -0.68, 0.68),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
            ],
            cluster_edges=[
                ("p1", "p2"),
                ("p1", "n1"),
                ("p1", "n2"),
                ("p2", "n1"),
                ("p2", "n2"),
                ("n1", "n2"),
            ],
            recommended_force_config=NuclearForceConfigInput(
                coulomb_scale=1.0,
                nuclear_attraction_mev=42.0,
                nuclear_attraction_range_fm=1.85,
                core_repulsion_mev=140.0,
                core_repulsion_range_fm=0.85,
                gravity_enabled=True,
                gravity_log10_multiplier=0.0,
                damping_per_fc=0.0,
                timestep_fc=0.15,
                total_steps=400,
                report_interval_steps=4,
            ),
            benchmark=NuclearReferenceBenchmarkDto(
                nuclide="⁴He (2p, 2n)",
                total_binding_energy_mev=28.296,
                cluster_binding_energy_mev=-28.296,
                stability_summary="Deeply bound (−28.296 MeV vs. free 2p+2n)",
                half_life_note="Stable (α particle)",
                source="AME2020 / NNDC NuDat 3.0",
            ),
        ),
        NuclearPresetDto(
            id="b11-proton-fusion",
            name="Boron-11 + Proton (p + ¹¹B)",
            subtitle="Beam Proton + 2α/p/2n Boron Cluster Proxy",
            description="Toy cluster proxy of an incoming proton approaching ¹¹B (2α + 1p + 2n).",
            particles=[
                NuclearParticleInput(
                    id="a1",
                    kind="alpha",
                    label="α1",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-1.3, 1.5, 0.0),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="a2",
                    kind="alpha",
                    label="α2",
                    charge_e=2.0,
                    mass_mev_c2=ALPHA_MASS_MEV_C2,
                    position_fm=(-1.3, -1.5, 0.0),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="p_core",
                    kind="proton",
                    label="p(t)",
                    charge_e=1.0,
                    mass_mev_c2=PROTON_MASS_MEV_C2,
                    position_fm=(1.7, 0.0, 1.4),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="n1",
                    kind="neutron",
                    label="n1(t)",
                    charge_e=0.0,
                    mass_mev_c2=NEUTRON_MASS_MEV_C2,
                    position_fm=(1.7, 1.3, -1.0),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="n2",
                    kind="neutron",
                    label="n2(t)",
                    charge_e=0.0,
                    mass_mev_c2=NEUTRON_MASS_MEV_C2,
                    position_fm=(1.7, -1.3, -1.0),
                    velocity_c=(0.0, 0.0, 0.0),
                ),
                NuclearParticleInput(
                    id="p_in",
                    kind="proton",
                    label="p (beam)",
                    charge_e=1.0,
                    mass_mev_c2=PROTON_MASS_MEV_C2,
                    position_fm=(-6.0, 0.25, 0.0),
                    velocity_c=(0.14, 0.0, 0.0),
                ),
            ],
            cluster_edges=[
                ("a1", "a2"),
                ("a1", "p_core"),
                ("a2", "p_core"),
                ("p_core", "n1"),
                ("p_core", "n2"),
                ("n1", "n2"),
            ],
            recommended_force_config=NuclearForceConfigInput(timestep_fc=0.2),
            benchmark=NuclearReferenceBenchmarkDto(
                nuclide="p + ¹¹B → 3α",
                total_binding_energy_mev=76.205,
                cluster_binding_energy_mev=-8.590,
                stability_summary="Exothermic reaction (Q = +8.590 MeV released)",
                half_life_note="Aneutronic fusion channel yielding 3α",
                source="AME2020 / NNDC NuDat 3.0",
            ),
        ),
    ]
    return {p.id: p for p in presets}


def list_nuclear_presets() -> list[NuclearPresetDto]:
    return list(_presets_map().values())


def _compute_forces_and_energies(
    positions: np.ndarray,
    charges: np.ndarray,
    masses: np.ndarray,
    dipole_moments: np.ndarray,
    cfg: NuclearForceConfigInput,
) -> tuple[np.ndarray, float, float, float, float, float, float]:
    n = positions.shape[0]
    forces = np.zeros((n, 3), dtype=np.float64)
    coulomb_e = 0.0
    nuclear_e = 0.0
    gravity_e = 0.0
    dipole_e = 0.0
    min_dist = float("inf")
    max_dist = 0.0

    g_mult = (10.0 ** cfg.gravity_log10_multiplier) if cfg.gravity_enabled else 0.0
    dip_mult = (10.0 ** cfg.dipole_log10_multiplier) if cfg.dipole_enabled else 0.0
    inv_ra2 = 1.0 / (cfg.nuclear_attraction_range_fm ** 2)
    inv_rc2 = 1.0 / (cfg.core_repulsion_range_fm ** 2)

    for i in range(n):
        for j in range(i + 1, n):
            diff = positions[i] - positions[j]
            r = float(np.linalg.norm(diff))
            min_dist = min(min_dist, r)
            max_dist = max(max_dist, r)

            r_safe = max(r, R_SINGULARITY_FLOOR_FM)
            unit = diff / r_safe if r > 1e-12 else np.array([1.0, 0.0, 0.0])

            q_prod = charges[i] * charges[j]
            coul_pair = cfg.coulomb_scale * NUCLEAR_COULOMB_KE_E2_MEV_FM * q_prod / r_safe
            coulomb_e += coul_pair
            f_coul_mag = (
                cfg.coulomb_scale
                * NUCLEAR_COULOMB_KE_E2_MEV_FM
                * q_prod
                / (r_safe * r_safe)
            )

            exp_core = math.exp(-(r * r) * inv_rc2)
            exp_attr = math.exp(-(r * r) * inv_ra2)
            nuc_pair = (
                cfg.core_repulsion_mev * exp_core
                - cfg.nuclear_attraction_mev * exp_attr
            )
            nuclear_e += nuc_pair
            f_nuc_mag = (
                2.0 * cfg.core_repulsion_mev * r * inv_rc2 * exp_core
                - 2.0 * cfg.nuclear_attraction_mev * r * inv_ra2 * exp_attr
            )

            f_grav_mag = 0.0
            if g_mult > 0.0:
                m_prod = masses[i] * masses[j]
                grav_pair = -g_mult * GRAVITY_MEV_FM_PER_MEV2 * m_prod / r_safe
                gravity_e += grav_pair
                f_grav_mag = (
                    -g_mult * GRAVITY_MEV_FM_PER_MEV2 * m_prod / (r_safe * r_safe)
                )

            f_vec = (f_coul_mag + f_nuc_mag + f_grav_mag) * unit

            if dip_mult > 0.0:
                mu1 = dipole_moments[i]
                mu2 = dipole_moments[j]
                k_eff = dip_mult * NUCLEAR_DIPOLE_CONST_MEV_FM3
                m1_dot_m2 = float(np.dot(mu1, mu2))
                m1_r = float(np.dot(mu1, unit))
                m2_r = float(np.dot(mu2, unit))
                dipole_e += (k_eff / (r_safe ** 3)) * (m1_dot_m2 - 3.0 * m1_r * m2_r)
                f_dip = (3.0 * k_eff / (r_safe ** 4)) * (
                    (m1_dot_m2 - 5.0 * m1_r * m2_r) * unit
                    + m2_r * mu1
                    + m1_r * mu2
                )
                f_vec = f_vec + f_dip

            forces[i] += f_vec
            forces[j] -= f_vec

    return forces, coulomb_e, nuclear_e, gravity_e, dipole_e, min_dist, max_dist


def run_nuclear_toy_simulation(req: NuclearSimulateRequest) -> NuclearSimulationResultDto:
    seen_ids: set[str] = set()
    for p in req.particles:
        if p.id in seen_ids:
            raise NuclearToyAdapterError(
                "DUPLICATE_PARTICLE_ID",
                f"Duplicate particle id '{p.id}'.",
                field_path="particles",
            )
        seen_ids.add(p.id)

    n = len(req.particles)
    positions = np.array([p.position_fm for p in req.particles], dtype=np.float64)
    velocities = np.array([p.velocity_c for p in req.particles], dtype=np.float64)
    charges = np.array([p.charge_e for p in req.particles], dtype=np.float64)
    masses = np.array([p.mass_mev_c2 for p in req.particles], dtype=np.float64)

    for i in range(n):
        for j in range(i + 1, n):
            if float(np.linalg.norm(positions[i] - positions[j])) < 0.15:
                raise NuclearToyAdapterError(
                    "OVERLAPPING_PARTICLES",
                    f"Particles '{req.particles[i].id}' and '{req.particles[j].id}' start closer than 0.15 fm.",
                    field_path="particles",
                )

    cfg = req.force_config
    dt = cfg.timestep_fc
    gamma = cfg.damping_per_fc

    dip_vecs: list[list[float]] = []
    for p in req.particles:
        d = np.array(p.dipole_direction, dtype=np.float64)
        d_norm = float(np.linalg.norm(d))
        d_unit = d / d_norm if d_norm > 1e-12 else np.array([0.0, 0.0, 1.0])
        mu_mag = (
            PROTON_MU_N
            if p.kind == "proton"
            else NEUTRON_MU_N
            if p.kind == "neutron"
            else cfg.alpha_toy_dipole_mu
        )
        dip_vecs.append((d_unit * mu_mag).tolist())
    dipole_moments = np.array(dip_vecs, dtype=np.float64)

    forces, coul_e, nuc_e, grav_e, dip_e, min_d, max_d = _compute_forces_and_energies(
        positions, charges, masses, dipole_moments, cfg
    )
    initial_max_d = max_d
    collapsed = min_d < COLLAPSE_DISTANCE_FM

    def make_frame(
        frame_idx: int,
        step_num: int,
        pos_arr: np.ndarray,
        vel_arr: np.ndarray,
        f_arr: np.ndarray,
        c_e: float,
        n_e: float,
        g_e: float,
        d_e: float,
        d_min: float,
        d_max: float,
    ) -> NuclearTrajectoryFrameDto:
        ke = float(0.5 * np.sum(masses[:, None] * (vel_arr * vel_arr)))
        pe = c_e + n_e + g_e + d_e
        tot = ke + pe
        return NuclearTrajectoryFrameDto(
            frame_index=frame_idx,
            step=step_num,
            time_fc=round(step_num * dt, 4),
            kinetic_energy_mev=round(ke, 6),
            coulomb_energy_mev=round(c_e, 6),
            nuclear_energy_mev=round(n_e, 6),
            gravity_energy_mev=float(f"{g_e:.6e}"),
            dipole_energy_mev=round(d_e, 6),
            potential_energy_mev=round(pe, 6),
            total_energy_mev=round(tot, 6),
            min_pair_distance_fm=round(d_min, 4),
            max_pair_distance_fm=round(d_max, 4),
            positions_fm=[
                (round(float(r[0]), 5), round(float(r[1]), 5), round(float(r[2]), 5))
                for r in pos_arr
            ],
            force_vectors_mev_fm=[
                (round(float(f[0]), 5), round(float(f[1]), 5), round(float(f[2]), 5))
                for f in f_arr
            ],
        )

    frames: list[NuclearTrajectoryFrameDto] = [
        make_frame(0, 0, positions, velocities, forces, coul_e, nuc_e, grav_e, dip_e, min_d, max_d)
    ]

    acc = forces / masses[:, None]
    damp_half = math.exp(-0.5 * gamma * dt) if gamma > 0.0 else 1.0

    for step in range(1, cfg.total_steps + 1):
        vel_half = velocities * damp_half + 0.5 * acc * dt
        positions = positions + vel_half * dt

        forces, coul_e, nuc_e, grav_e, dip_e, min_d, max_d = _compute_forces_and_energies(
            positions, charges, masses, dipole_moments, cfg
        )
        if min_d < COLLAPSE_DISTANCE_FM:
            collapsed = True

        acc_new = forces / masses[:, None]
        velocities = (vel_half + 0.5 * acc_new * dt) * damp_half
        acc = acc_new

        if step % cfg.report_interval_steps == 0 or step == cfg.total_steps:
            frames.append(
                make_frame(
                    len(frames),
                    step,
                    positions,
                    velocities,
                    forces,
                    coul_e,
                    nuc_e,
                    grav_e,
                    dip_e,
                    min_d,
                    max_d,
                )
            )

    initial_tot = frames[0].total_energy_mev
    final_frame = frames[-1]
    final_tot = final_frame.total_energy_mev
    drift = final_tot - initial_tot

    dissociated = (
        final_frame.max_pair_distance_fm > max(12.0, initial_max_d * 2.4)
        or (final_tot > 0.0 and final_frame.max_pair_distance_fm > initial_max_d * 1.45)
    )

    if collapsed:
        verdict = "collapsed-core"
        explanation = (
            f"Particles collapsed inside {COLLAPSE_DISTANCE_FM:.2f} fm (min separation {final_frame.min_pair_distance_fm:.2f} fm). "
            "Without a short-range repulsive core bumper, an attractive 1/r² force pulls particles into a singularity at r → 0."
        )
    elif dissociated:
        verdict = "unbound-dissociated"
        explanation = (
            f"Cluster broke apart: max pair distance grew from {initial_max_d:.2f} fm to {final_frame.max_pair_distance_fm:.2f} fm "
            f"(final total energy {final_tot:+.3f} MeV)."
        )
    else:
        verdict = "bound-oscillating"
        explanation = (
            f"Cluster stayed bound (max separation {final_frame.max_pair_distance_fm:.2f} fm, "
            f"final total energy {final_tot:+.3f} MeV)."
        )

    benchmark = _presets_map().get(req.preset_id)
    ref_benchmark = benchmark.benchmark if benchmark is not None else None

    return NuclearSimulationResultDto(
        preset_id=req.preset_id,
        model_label="Exploratory Toy Classical N-Body Model (Not Quantum Nuclear Physics)",
        disclaimer=(
            "Exploratory toy classical simulation at femtometer scale. Uses phenomenological pairwise forces "
            "(not quantum wavefunctions, spin-orbit coupling, or QCD) so you can test ideas and compare against AME2020 benchmarks."
        ),
        assumptions=[
            "Particles are treated as classical point centers with effective alpha-alpha or nucleon pairwise potentials.",
            "Natural nuclear units: distance in fm (10⁻¹⁵ m), energy in MeV, mass in MeV/c², time in fm/c (~3.336 × 10⁻²⁴ s).",
            "Initial velocities in Be-8/C-12 approximate quantum zero-point kinetic energy that classical resting balls lack.",
            "A 0.08 fm floor prevents division by zero if a user disables the repulsive core.",
        ],
        limitations=[
            "Real nuclei obey quantum mechanics (tunneling, Pauli exclusion, spin-isospin forces), not classical Newton trajectories.",
            "Amplified gravity multipliers test hypothetical 1/r² scaling and do not correspond to real General Relativity.",
        ],
        particle_ids=[p.id for p in req.particles],
        particle_kinds=[p.kind for p in req.particles],
        stability_verdict=verdict,
        verdict_explanation=explanation,
        initial_total_energy_mev=initial_tot,
        final_total_energy_mev=final_tot,
        energy_drift_mev=round(drift, 6),
        final_cluster_energy_mev=final_tot,
        reference_benchmark=ref_benchmark,
        frames=frames,
    )
