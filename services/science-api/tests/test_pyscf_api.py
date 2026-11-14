from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from tests.test_rdkit_api import make_benzene, make_water


def _wait_qc_terminal(client: TestClient, job_id: str, timeout_s: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        resp = client.get(f"/api/v1/quantum/jobs/{job_id}")
        assert resp.status_code == 200
        body = resp.json()
        if body["status"] in {"completed", "cancelled", "failed", "interrupted"}:
            return body
        time.sleep(0.05)
    raise AssertionError(f"Quantum job {job_id} did not finish within {timeout_s}s")


def test_pyscf_water_rhf_631g_reference_and_distinct_fields(tmp_path: Path) -> None:
    app = create_app(jobs_db_path=tmp_path / "jobs.db")
    water = make_water()

    with TestClient(app) as client:
        presets = client.get("/api/v1/quantum/presets")
        assert presets.status_code == 200
        preset_ids = {p["id"] for p in presets.json()}
        assert {"pyscf-rhf-sto3g", "pyscf-rhf-631g", "pyscf-b3lyp-631g", "pyscf-b3lyp-def2svp"} <= preset_ids

        payload = {
            "model_preset_id": "pyscf-rhf-631g",
            "model_preset_version": "1",
            "initial_structure_revision_id": water["revision_id"],
            "molecule": water,
            "compute_fields": True,
            "idempotency_key": "qc-water-rhf-631g-001",
        }
        r1 = client.post("/api/v1/quantum/jobs", json=payload)
        assert r1.status_code == 202
        job_id = r1.json()["job_id"]

        # Idempotent retry returns same job_id
        r2 = client.post("/api/v1/quantum/jobs", json=payload)
        assert r2.status_code == 202
        assert r2.json()["job_id"] == job_id

        final_job = _wait_qc_terminal(client, job_id)
        assert final_job["status"] == "completed"
        assert final_job["converged"] is True

        res = client.get(f"/api/v1/quantum/jobs/{job_id}/results")
        assert res.status_code == 200
        body = res.json()
        assert body["engine"] == "PySCF"
        assert body["method"] == "RHF"
        assert body["basis_set"] == "6-31g"
        assert body["converged"] is True
        assert abs(body["total_energy_hartree"] - (-75.983993)) < 1e-3
        assert abs(body["dipole_magnitude_debye"] - 2.6303) < 0.05
        assert body["homo_lumo_gap_ev"] > 10.0

        # Section 12 rule #13: orbital amplitude/phase and total electron density are distinct with explicit isovalue & units
        homo_field = body["homo_orbital_field"]
        dens_field = body["electron_density_field"]
        assert homo_field["field_kind"] == "orbital-amplitude-and-phase"
        assert homo_field["unit"] == "bohr^-3/2"
        assert homo_field["isovalue"] == 0.04
        assert len(homo_field["samples"]) > 20
        assert any(s["value"] > 0 for s in homo_field["samples"])
        assert any(s["value"] < 0 for s in homo_field["samples"])

        assert dens_field["field_kind"] == "total-electron-density"
        assert dens_field["unit"] == "e/bohr^3"
        assert dens_field["isovalue"] == 0.015
        assert len(dens_field["samples"]) > 20
        assert all(s["value"] > 0 for s in dens_field["samples"])


def test_pyscf_benzene_dft_and_validation_rejections(tmp_path: Path) -> None:
    app = create_app(jobs_db_path=tmp_path / "jobs.db")
    with TestClient(app) as client:
        # Reject odd-electron open-shell O-H radical
        oh = make_water()
        oh["atoms"] = oh["atoms"][:2]
        oh["bonds"] = oh["bonds"][:1]
        r_odd = client.post(
            "/api/v1/quantum/jobs",
            json={
                "model_preset_id": "pyscf-rhf-sto3g",
                "model_preset_version": "1",
                "initial_structure_revision_id": oh["revision_id"],
                "molecule": oh,
                "compute_fields": False,
                "idempotency_key": "qc-odd-oh",
            },
        )
        assert r_odd.status_code == 422
        assert r_odd.json()["detail"]["code"] == "ODD_ELECTRON_OPEN_SHELL_DEFERRED"

        # Benzene B3LYP/6-31G single-point
        benzene = make_benzene()
        r_bz = client.post(
            "/api/v1/quantum/jobs",
            json={
                "model_preset_id": "pyscf-b3lyp-631g",
                "model_preset_version": "1",
                "initial_structure_revision_id": benzene["revision_id"],
                "molecule": benzene,
                "compute_fields": False,
                "idempotency_key": "qc-benzene-b3lyp",
            },
        )
        assert r_bz.status_code == 202
        job_id = r_bz.json()["job_id"]
        final = _wait_qc_terminal(client, job_id, timeout_s=30.0)
        assert final["status"] == "completed"
        res = client.get(f"/api/v1/quantum/jobs/{job_id}/results").json()
        assert res["converged"] is True
        assert res["method"] == "RKS-B3LYP"
        assert res["total_energy_hartree"] < -230.0
