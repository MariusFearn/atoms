from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from app.adapters.pyscf.adapter import (
    PyScfAdapterError,
    QuantumCancelledException,
    ValidatedQuantumSetup,
    pyscf_version,
    run_quantum_calculation,
    validate_quantum_request,
)
from app.models.contracts import (
    QuantumJobCreateRequest,
    QuantumJobDto,
    QuantumResultsDto,
)

MAX_ACTIVE_OR_QUEUED_QC_JOBS = 12


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_db_path() -> Path:
    override = os.environ.get("MATTERLAB_JOBS_DB_PATH")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "data" / "jobs.db"


class QuantumJobManager:
    def __init__(self, db_path: Path | None = None, *, max_workers: int = 2) -> None:
        self._db_path = db_path or _default_db_path()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._cancel_flags: dict[str, threading.Event] = {}
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="pyscf-worker"
        )
        self._init_db()
        self._mark_unfinished_as_interrupted()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS quantum_jobs (
                    job_id TEXT PRIMARY KEY,
                    idempotency_key TEXT UNIQUE NOT NULL,
                    request_hash TEXT NOT NULL,
                    status TEXT NOT NULL,
                    model_preset_id TEXT NOT NULL,
                    model_preset_version TEXT NOT NULL,
                    initial_structure_revision_id TEXT NOT NULL,
                    scf_cycles_completed INTEGER NOT NULL,
                    max_scf_cycles INTEGER NOT NULL,
                    converged INTEGER,
                    results_json TEXT NOT NULL,
                    error_code TEXT,
                    error_message TEXT,
                    created_at_iso TEXT NOT NULL,
                    updated_at_iso TEXT NOT NULL
                );
                """
            )

    def _mark_unfinished_as_interrupted(self) -> None:
        now = _utc_now_iso()
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT job_id, results_json FROM quantum_jobs WHERE status IN ('queued', 'running', 'cancelling')"
            ).fetchall()
            for row in rows:
                res = json.loads(row["results_json"])
                res["status"] = "interrupted"
                res.setdefault("warnings", []).append(
                    "Service restarted before quantum chemistry job completed; execution was interrupted."
                )
                conn.execute(
                    """
                    UPDATE quantum_jobs
                    SET status = 'interrupted',
                        error_code = 'SERVICE_INTERRUPTED',
                        error_message = 'Science service restarted before calculation completed.',
                        results_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (json.dumps(res), now, row["job_id"]),
                )

    def _row_to_dto(self, row: sqlite3.Row) -> QuantumJobDto:
        conv_raw = row["converged"]
        converged = None if conv_raw is None else bool(conv_raw)
        return QuantumJobDto(
            job_id=row["job_id"],
            status=row["status"],
            model_preset_id=row["model_preset_id"],
            model_preset_version=row["model_preset_version"],
            initial_structure_revision_id=row["initial_structure_revision_id"],
            scf_cycles_completed=int(row["scf_cycles_completed"]),
            max_scf_cycles=int(row["max_scf_cycles"]),
            converged=converged,
            created_at_iso=row["created_at_iso"],
            updated_at_iso=row["updated_at_iso"],
            error_code=row["error_code"],
            error_message=row["error_message"],
            status_url=f"/api/v1/quantum/jobs/{row['job_id']}",
            results_url=f"/api/v1/quantum/jobs/{row['job_id']}/results",
        )

    def submit_job(self, req: QuantumJobCreateRequest) -> QuantumJobDto:
        setup = validate_quantum_request(req)

        with self._lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM quantum_jobs WHERE idempotency_key = ?",
                (req.idempotency_key,),
            ).fetchone()
            if existing is not None:
                if existing["request_hash"] != setup.input_hash_sha256:
                    raise PyScfAdapterError(
                        "IDEMPOTENCY_CONFLICT",
                        f"Idempotency key '{req.idempotency_key}' was already used for a different quantum job.",
                        http_status=409,
                        field_path="idempotency_key",
                    )
                return self._row_to_dto(existing)

            active_count = conn.execute(
                "SELECT COUNT(*) AS cnt FROM quantum_jobs WHERE status IN ('queued', 'running', 'cancelling')"
            ).fetchone()["cnt"]
            if int(active_count) >= MAX_ACTIVE_OR_QUEUED_QC_JOBS:
                raise PyScfAdapterError(
                    "QUEUE_FULL",
                    f"Quantum job queue capacity ({MAX_ACTIVE_OR_QUEUED_QC_JOBS}) reached.",
                    http_status=429,
                    retryable=True,
                )

            job_id = f"qc-{uuid.uuid4().hex[:12]}"
            now = _utc_now_iso()
            initial_results = QuantumResultsDto(
                job_id=job_id,
                status="queued",
                engine="PySCF",
                engine_version=pyscf_version(),
                method=setup.preset.dto.method,
                basis_set=setup.preset.dto.basis_set,
                charge_e=setup.charge_e,
                spin_multiplicity=setup.spin_multiplicity,
                converged=False,
                scf_cycles=0,
                energy_basis="mole-of-systems",
                input_structure_revision_id=setup.input_revision_id,
                input_structure_hash_sha256=setup.input_hash_sha256,
                assumptions=setup.preset.dto.assumptions,
                limitations=setup.preset.dto.limitations,
                warnings=[],
            )

            conn.execute(
                """
                INSERT INTO quantum_jobs (
                    job_id, idempotency_key, request_hash, status,
                    model_preset_id, model_preset_version, initial_structure_revision_id,
                    scf_cycles_completed, max_scf_cycles, converged,
                    results_json, error_code, error_message, created_at_iso, updated_at_iso
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    req.idempotency_key,
                    setup.input_hash_sha256,
                    "queued",
                    setup.preset.dto.id,
                    setup.preset.dto.version,
                    req.initial_structure_revision_id,
                    0,
                    setup.preset.dto.max_scf_cycles,
                    None,
                    initial_results.model_dump_json(),
                    None,
                    None,
                    now,
                    now,
                ),
            )
            self._cancel_flags[job_id] = threading.Event()
            row = conn.execute(
                "SELECT * FROM quantum_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()

        self._executor.submit(self._run_job, job_id, setup)
        return self._row_to_dto(row)

    def _run_job(self, job_id: str, setup: ValidatedQuantumSetup) -> None:
        cancel_event = self._cancel_flags.get(job_id) or threading.Event()

        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT status FROM quantum_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if row is None or row["status"] == "cancelled" or cancel_event.is_set():
                conn.execute(
                    "UPDATE quantum_jobs SET status = 'cancelled', updated_at_iso = ? WHERE job_id = ?",
                    (_utc_now_iso(), job_id),
                )
                return
            conn.execute(
                "UPDATE quantum_jobs SET status = 'running', updated_at_iso = ? WHERE job_id = ?",
                (_utc_now_iso(), job_id),
            )

        def on_scf_cycle(cycle: int) -> None:
            with self._lock, self._connect() as conn:
                conn.execute(
                    "UPDATE quantum_jobs SET scf_cycles_completed = ?, updated_at_iso = ? WHERE job_id = ?",
                    (cycle, _utc_now_iso(), job_id),
                )

        try:
            results = run_quantum_calculation(
                setup,
                cancel_requested=cancel_event.is_set,
                on_scf_cycle=on_scf_cycle,
            )
            results.job_id = job_id
            with self._lock, self._connect() as conn:
                conn.execute(
                    """
                    UPDATE quantum_jobs
                    SET status = 'completed',
                        scf_cycles_completed = ?,
                        converged = ?,
                        results_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (
                        results.scf_cycles,
                        1 if results.converged else 0,
                        results.model_dump_json(),
                        _utc_now_iso(),
                        job_id,
                    ),
                )
        except QuantumCancelledException:
            with self._lock, self._connect() as conn:
                row_c = conn.execute(
                    "SELECT results_json, scf_cycles_completed FROM quantum_jobs WHERE job_id = ?",
                    (job_id,),
                ).fetchone()
                res_dict = json.loads(row_c["results_json"]) if row_c else {}
                res_dict["status"] = "cancelled"
                res_dict["scf_cycles"] = int(row_c["scf_cycles_completed"]) if row_c else 0
                res_dict.setdefault("warnings", []).append(
                    "Quantum calculation was cancelled by user request during SCF."
                )
                conn.execute(
                    """
                    UPDATE quantum_jobs
                    SET status = 'cancelled',
                        results_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (json.dumps(res_dict), _utc_now_iso(), job_id),
                )
        except Exception as exc:
            with self._lock, self._connect() as conn:
                row_f = conn.execute(
                    "SELECT results_json FROM quantum_jobs WHERE job_id = ?",
                    (job_id,),
                ).fetchone()
                res_dict = json.loads(row_f["results_json"]) if row_f else {}
                res_dict["status"] = "failed"
                res_dict.setdefault("warnings", []).append(f"PySCF error: {exc}")
                conn.execute(
                    """
                    UPDATE quantum_jobs
                    SET status = 'failed',
                        error_code = 'PYSCF_EXECUTION_ERROR',
                        error_message = ?,
                        results_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (str(exc), json.dumps(res_dict), _utc_now_iso(), job_id),
                )

    def get_job(self, job_id: str) -> QuantumJobDto:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM quantum_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if row is None:
                raise PyScfAdapterError(
                    "QUANTUM_JOB_NOT_FOUND",
                    f"Quantum job '{job_id}' was not found.",
                    http_status=404,
                    field_path="job_id",
                )
            return self._row_to_dto(row)

    def cancel_job(self, job_id: str) -> QuantumJobDto:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM quantum_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if row is None:
                raise PyScfAdapterError(
                    "QUANTUM_JOB_NOT_FOUND",
                    f"Quantum job '{job_id}' was not found.",
                    http_status=404,
                    field_path="job_id",
                )
            flag = self._cancel_flags.setdefault(job_id, threading.Event())
            flag.set()
            status = row["status"]
            if status == "queued":
                res = json.loads(row["results_json"])
                res["status"] = "cancelled"
                res.setdefault("warnings", []).append("Cancelled while queued.")
                conn.execute(
                    "UPDATE quantum_jobs SET status = 'cancelled', results_json = ?, updated_at_iso = ? WHERE job_id = ?",
                    (json.dumps(res), _utc_now_iso(), job_id),
                )
            elif status == "running":
                conn.execute(
                    "UPDATE quantum_jobs SET status = 'cancelling', updated_at_iso = ? WHERE job_id = ?",
                    (_utc_now_iso(), job_id),
                )
            updated = conn.execute(
                "SELECT * FROM quantum_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            return self._row_to_dto(updated)

    def get_results(self, job_id: str) -> QuantumResultsDto:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM quantum_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if row is None:
                raise PyScfAdapterError(
                    "QUANTUM_JOB_NOT_FOUND",
                    f"Quantum job '{job_id}' was not found.",
                    http_status=404,
                    field_path="job_id",
                )
            return QuantumResultsDto.model_validate_json(row["results_json"])

    def shutdown(self, wait: bool = True) -> None:
        self._executor.shutdown(wait=wait)
