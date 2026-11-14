from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.jobs.manager import JobManager
from app.main import create_app


def make_water_cluster(count: int = 8) -> dict:
    atoms = []
    bonds = []
    idx = 1
    for i in range(count):
        ix = i % 2
        iy = (i // 2) % 2
        iz = i // 4
        ox = round(ix * 3.1 - 1.55, 4)
        oy = round(iy * 3.1 - 1.55, 4)
        oz = round(iz * 3.1 - 1.55, 4)
        o_id = f"O{idx}"
        h1_id = f"H{idx * 2 - 1}"
        h2_id = f"H{idx * 2}"
        atoms.extend(
            [
                {"id": o_id, "element": "O", "isotope": None, "position_angstrom": [ox, oy, oz], "formal_charge": 0, "aromatic": False},
                {"id": h1_id, "element": "H", "isotope": None, "position_angstrom": [round(ox + 0.757, 4), round(oy + 0.586, 4), oz], "formal_charge": 0, "aromatic": False},
                {"id": h2_id, "element": "H", "isotope": None, "position_angstrom": [round(ox - 0.757, 4), round(oy + 0.586, 4), oz], "formal_charge": 0, "aromatic": False},
            ]
        )
        bonds.extend(
            [
                {"id": f"bw{idx}a", "atom_a": o_id, "atom_b": h1_id, "order": 1},
                {"id": f"bw{idx}b", "atom_a": o_id, "atom_b": h2_id, "order": 1},
            ]
        )
        idx += 1
    return {
        "id": "example-water-cluster-8",
        "name": f"Water Cluster ({count} H2O)",
        "revision_id": "example-water-cluster-8-r1",
        "net_charge": 0,
        "atoms": atoms,
        "bonds": bonds,
    }


def _wait_terminal(client: TestClient, job_id: str, timeout_s: float = 15.0) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        resp = client.get(f"/api/v1/experiments/{job_id}")
        assert resp.status_code == 200
        body = resp.json()
        if body["status"] in {"completed", "cancelled", "failed", "interrupted"}:
            return body
        time.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not reach terminal state within {timeout_s}s")


def test_presets_and_input_validation(tmp_path: Path) -> None:
    app = create_app(jobs_db_path=tmp_path / "jobs.db")
    with TestClient(app) as client:
        presets = client.get("/api/v1/experiments/presets")
        assert presets.status_code == 200
        ids = {p["id"] for p in presets.json()}
        assert ids == {"tip3p-water-nvt", "tip3p-water-nve"}

        # Reject 1 water molecule (ensemble temperature requires >= 2)
        single_water = make_water_cluster(1)
        resp_small = client.post(
            "/api/v1/experiments",
            json={
                "model_preset_id": "tip3p-water-nvt",
                "model_preset_version": "1",
                "initial_structure_revision_id": single_water["revision_id"],
                "molecule": single_water,
                "settings": {
                    "temperature": {"value": 300, "unit": "K"},
                    "timestep": {"value": 1.0, "unit": "fs"},
                    "duration": {"value": 0.5, "unit": "ps"},
                    "report_interval_steps": 50,
                    "minimize_before_run": True,
                },
                "random_seed": 42,
                "idempotency_key": "too-small-1",
            },
        )
        assert resp_small.status_code == 422
        assert resp_small.json()["detail"]["code"] == "INSUFFICIENT_ENSEMBLE_SIZE"

        # Reject out-of-range timestep
        cluster = make_water_cluster(8)
        resp_dt = client.post(
            "/api/v1/experiments",
            json={
                "model_preset_id": "tip3p-water-nve",
                "model_preset_version": "1",
                "initial_structure_revision_id": cluster["revision_id"],
                "molecule": cluster,
                "settings": {
                    "temperature": {"value": 300, "unit": "K"},
                    "timestep": {"value": 5.0, "unit": "fs"},
                    "duration": {"value": 0.5, "unit": "ps"},
                    "report_interval_steps": 50,
                    "minimize_before_run": True,
                },
                "random_seed": 42,
                "idempotency_key": "bad-dt-1",
            },
        )
        assert resp_dt.status_code == 422
        assert resp_dt.json()["detail"]["code"] == "TIMESTEP_OUT_OF_RANGE"


def test_nve_energy_conservation_and_idempotency(tmp_path: Path) -> None:
    app = create_app(jobs_db_path=tmp_path / "jobs.db")
    cluster = make_water_cluster(8)
    payload = {
        "model_preset_id": "tip3p-water-nve",
        "model_preset_version": "1",
        "initial_structure_revision_id": cluster["revision_id"],
        "molecule": cluster,
        "settings": {
            "temperature": {"value": 300, "unit": "K"},
            "timestep": {"value": 0.5, "unit": "fs"},
            "duration": {"value": 0.5, "unit": "ps"},
            "report_interval_steps": 100,
            "minimize_before_run": True,
        },
        "random_seed": 12345,
        "idempotency_key": "nve-conserve-001",
    }

    with TestClient(app) as client:
        r1 = client.post("/api/v1/experiments", json=payload)
        assert r1.status_code == 202
        job_id = r1.json()["job_id"]

        # Duplicate submission with same idempotency_key returns same job_id
        r2 = client.post("/api/v1/experiments", json=payload)
        assert r2.status_code == 202
        assert r2.json()["job_id"] == job_id

        # Conflicting payload with same idempotency_key returns 409
        conflict = {**payload, "random_seed": 999}
        r_conflict = client.post("/api/v1/experiments", json=conflict)
        assert r_conflict.status_code == 409
        assert r_conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

        final_job = _wait_terminal(client, job_id)
        assert final_job["status"] == "completed"

        res = client.get(f"/api/v1/experiments/{job_id}/results")
        assert res.status_code == 200
        body = res.json()
        assert body["is_partial"] is False
        frames = body["frames"]
        assert len(frames) == 11  # step 0 + 10 intervals of 100 steps = 1000 steps (0.5 ps)
        assert body["reproducibility"]["degrees_of_freedom"] == 45
        assert body["reproducibility"]["energy_basis"] == "mole-of-systems"
        assert body["reproducibility"]["energy_unit"] == "kJ/mol"

        # Scientific validation: NVE total energy should be conserved within 0.5 kJ/mol over 0.5 ps at dt=0.5 fs
        totals = [f["total_energy_kj_mol"] for f in frames]
        drift = max(totals) - min(totals)
        assert drift < 0.5, f"NVE total energy drift too large: {drift} kJ/mol"


def test_cancellation_preserves_partial_results_and_restart_marks_interrupted(tmp_path: Path) -> None:
    db_path = tmp_path / "jobs.db"
    app = create_app(jobs_db_path=db_path)
    cluster = make_water_cluster(8)

    with TestClient(app) as client:
        # Longer run so we can cancel mid-flight
        r = client.post(
            "/api/v1/experiments",
            json={
                "model_preset_id": "tip3p-water-nvt",
                "model_preset_version": "1",
                "initial_structure_revision_id": cluster["revision_id"],
                "molecule": cluster,
                "settings": {
                    "temperature": {"value": 300, "unit": "K"},
                    "timestep": {"value": 1.0, "unit": "fs"},
                    "duration": {"value": 15.0, "unit": "ps"},
                    "report_interval_steps": 100,
                    "minimize_before_run": True,
                },
                "random_seed": 7,
                "idempotency_key": "cancel-test-001",
            },
        )
        assert r.status_code == 202
        job_id = r.json()["job_id"]

        # Wait until at least 1 frame is recorded, then cancel
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            st = client.get(f"/api/v1/experiments/{job_id}").json()
            if st["frames_recorded"] >= 1:
                break
            time.sleep(0.02)

        cancel_resp = client.post(f"/api/v1/experiments/{job_id}/cancel")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] in {"cancelling", "cancelled"}

        final_job = _wait_terminal(client, job_id)
        assert final_job["status"] == "cancelled"

        res = client.get(f"/api/v1/experiments/{job_id}/results").json()
        assert res["status"] == "cancelled"
        assert res["is_partial"] is True
        assert len(res["frames"]) >= 1

    # Simulate service restart with a leftover 'running' row in SQLite
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE jobs SET status = 'running' WHERE job_id = ?", (job_id,))

    recovered_manager = JobManager(db_path=db_path)
    try:
        recovered_job = recovered_manager.get_job(job_id)
        assert recovered_job.status == "interrupted"
        assert recovered_job.error_code == "SERVICE_INTERRUPTED"
        recovered_results = recovered_manager.get_results(job_id)
        assert recovered_results.status == "interrupted"
        assert recovered_results.is_partial is True
        assert len(recovered_results.frames) >= 1
    finally:
        recovered_manager.shutdown(wait=True)
