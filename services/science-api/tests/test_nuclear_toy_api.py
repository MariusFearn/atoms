from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_nuclear_presets_endpoint() -> None:
    response = client.get("/api/v1/sandbox/nuclear/presets")
    assert response.status_code == 200
    presets = response.json()
    ids = {p["id"] for p in presets}
    assert {
        "be8-two-alpha",
        "c12-three-alpha",
        "c12-hoyle-state",
        "o16-four-alpha",
        "he4-nucleons",
        "b11-proton-fusion",
    } <= ids


def test_b11_proton_fusion_proxy_runs_cleanly() -> None:
    presets = {p["id"]: p for p in client.get("/api/v1/sandbox/nuclear/presets").json()}
    b11 = presets["b11-proton-fusion"]
    resp = client.post(
        "/api/v1/sandbox/nuclear/simulate",
        json={
            "preset_id": "b11-proton-fusion",
            "particles": b11["particles"],
            "force_config": b11["recommended_force_config"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert abs(data["energy_drift_mev"]) < 0.05
    assert data["reference_benchmark"]["nuclide"] == "p + ¹¹B → 3α"


def test_c12_three_alpha_binds_and_conserves_energy() -> None:
    presets = {p["id"]: p for p in client.get("/api/v1/sandbox/nuclear/presets").json()}
    c12 = presets["c12-three-alpha"]

    response = client.post(
        "/api/v1/sandbox/nuclear/simulate",
        json={
            "preset_id": "c12-three-alpha",
            "particles": c12["particles"],
            "force_config": c12["recommended_force_config"],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["stability_verdict"] == "bound-oscillating"
    assert abs(data["energy_drift_mev"]) < 1e-2
    assert data["final_cluster_energy_mev"] < 0.0
    assert data["reference_benchmark"]["nuclide"].startswith("¹²C")


def test_be8_dissociates_under_default_and_real_gravity() -> None:
    presets = {p["id"]: p for p in client.get("/api/v1/sandbox/nuclear/presets").json()}
    be8 = presets["be8-two-alpha"]

    # Default nuclear toy: shallow resonance + zero-point KE breaks apart
    resp_default = client.post(
        "/api/v1/sandbox/nuclear/simulate",
        json={
            "preset_id": "be8-two-alpha",
            "particles": be8["particles"],
            "force_config": be8["recommended_force_config"],
        },
    )
    assert resp_default.status_code == 200
    assert resp_default.json()["stability_verdict"] == "unbound-dissociated"

    # Real gravity only (nuclear Velcro off): blasts apart and gravity << Coulomb by ~10^35+
    cfg = dict(be8["recommended_force_config"])
    cfg["nuclear_attraction_mev"] = 0.0
    cfg["core_repulsion_mev"] = 0.0
    cfg["gravity_enabled"] = True
    cfg["gravity_log10_multiplier"] = 0.0

    resp_grav = client.post(
        "/api/v1/sandbox/nuclear/simulate",
        json={
            "preset_id": "be8-two-alpha",
            "particles": be8["particles"],
            "force_config": cfg,
        },
    )
    assert resp_grav.status_code == 200
    grav_data = resp_grav.json()
    assert grav_data["stability_verdict"] == "unbound-dissociated"
    f0 = grav_data["frames"][0]
    assert f0["coulomb_energy_mev"] > 1.0
    assert abs(f0["gravity_energy_mev"]) < 1e-30


def test_amplified_inverse_square_gravity_without_core_collapses() -> None:
    presets = {p["id"]: p for p in client.get("/api/v1/sandbox/nuclear/presets").json()}
    c12 = presets["c12-three-alpha"]
    cfg = dict(c12["recommended_force_config"])
    cfg["nuclear_attraction_mev"] = 0.0
    cfg["core_repulsion_mev"] = 0.0
    cfg["gravity_enabled"] = True
    cfg["gravity_log10_multiplier"] = 37.0

    resp = client.post(
        "/api/v1/sandbox/nuclear/simulate",
        json={
            "preset_id": "c12-three-alpha",
            "particles": c12["particles"],
            "force_config": cfg,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["stability_verdict"] == "collapsed-core"


def test_rejects_duplicate_particle_ids() -> None:
    presets = {p["id"]: p for p in client.get("/api/v1/sandbox/nuclear/presets").json()}
    be8 = presets["be8-two-alpha"]
    bad_particles = [be8["particles"][0], dict(be8["particles"][0], position_fm=[2.0, 0.0, 0.0])]
    resp = client.post(
        "/api/v1/sandbox/nuclear/simulate",
        json={
            "preset_id": "be8-two-alpha",
            "particles": bad_particles,
            "force_config": be8["recommended_force_config"],
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "DUPLICATE_PARTICLE_ID"
