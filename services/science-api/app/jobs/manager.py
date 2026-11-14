from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from app.adapters.openmm.adapter import (
    OpenMMAdapterError,
    ValidatedWaterSetup,
    openmm_version,
    run_water_simulation,
    validate_experiment_request,
)
from app.models.contracts import (
    ExperimentCreateRequest,
    ExperimentJobDto,
    ExperimentResultsDto,
    ReproducibilityRecordDto,
    ResolvedExperimentSettingsDto,
    TrajectoryFrameDto,
)

MAX_ACTIVE_OR_QUEUED_JOBS = 16


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _default_db_path() -> Path:
    override = os.environ.get("MATTERLAB_JOBS_DB_PATH")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "data" / "jobs.db"


class JobManager:
    def __init__(self, db_path: Path | None = None, *, max_workers: int = 2) -> None:
        self._db_path = db_path or _default_db_path()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._cancel_flags: dict[str, threading.Event] = {}
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="openmm-worker")
        self._init_db()
        self._mark_unfinished_as_interrupted()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    idempotency_key TEXT UNIQUE NOT NULL,
                    request_hash TEXT NOT NULL,
                    status TEXT NOT NULL,
                    model_preset_id TEXT NOT NULL,
                    model_preset_version TEXT NOT NULL,
                    initial_structure_revision_id TEXT NOT NULL,
                    total_steps INTEGER NOT NULL,
                    completed_steps INTEGER NOT NULL,
                    frames_recorded INTEGER NOT NULL,
                    atom_ids_json TEXT NOT NULL,
                    reproducibility_json TEXT NOT NULL,
                    warnings_json TEXT NOT NULL,
                    error_code TEXT,
                    error_message TEXT,
                    created_at_iso TEXT NOT NULL,
                    updated_at_iso TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS job_frames (
                    job_id TEXT NOT NULL,
                    frame_index INTEGER NOT NULL,
                    step INTEGER NOT NULL,
                    simulation_time_ps REAL NOT NULL,
                    kinetic_energy_kj_mol REAL NOT NULL,
                    potential_energy_kj_mol REAL NOT NULL,
                    total_energy_kj_mol REAL NOT NULL,
                    instantaneous_temperature_k REAL NOT NULL,
                    positions_json TEXT NOT NULL,
                    PRIMARY KEY (job_id, frame_index),
                    FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
                );
                """
            )

    def _mark_unfinished_as_interrupted(self) -> None:
        now = _utc_now_iso()
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT job_id, warnings_json, reproducibility_json FROM jobs WHERE status IN ('queued', 'running', 'cancelling')"
            ).fetchall()
            for row in rows:
                warnings = json.loads(row["warnings_json"])
                warnings.append(
                    "Service restarted before simulation completed; execution was interrupted and any recorded frames/metadata were preserved."
                )
                repro = json.loads(row["reproducibility_json"])
                repro["termination_status"] = "interrupted"
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = 'interrupted',
                        error_code = 'SERVICE_INTERRUPTED',
                        error_message = 'Science service restarted before job completed.',
                        warnings_json = ?,
                        reproducibility_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (json.dumps(warnings), json.dumps(repro), now, row["job_id"]),
                )

    def _row_to_job_dto(self, row: sqlite3.Row) -> ExperimentJobDto:
        total_steps = max(1, int(row["total_steps"]))
        completed_steps = int(row["completed_steps"])
        progress = min(1.0, max(0.0, completed_steps / total_steps))
        return ExperimentJobDto(
            job_id=row["job_id"],
            status=row["status"],
            model_preset_id=row["model_preset_id"],
            model_preset_version=row["model_preset_version"],
            initial_structure_revision_id=row["initial_structure_revision_id"],
            progress_fraction=round(progress, 4),
            completed_steps=completed_steps,
            total_steps=total_steps,
            frames_recorded=int(row["frames_recorded"]),
            created_at_iso=row["created_at_iso"],
            updated_at_iso=row["updated_at_iso"],
            error_code=row["error_code"],
            error_message=row["error_message"],
            status_url=f"/api/v1/experiments/{row['job_id']}",
            results_url=f"/api/v1/experiments/{row['job_id']}/results",
        )

    def submit_experiment(self, req: ExperimentCreateRequest) -> ExperimentJobDto:
        setup = validate_experiment_request(req)

        with self._lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM jobs WHERE idempotency_key = ?",
                (req.idempotency_key,),
            ).fetchone()
            if existing is not None:
                if existing["request_hash"] != setup.input_hash_sha256:
                    raise OpenMMAdapterError(
                        "IDEMPOTENCY_CONFLICT",
                        f"Idempotency key '{req.idempotency_key}' was already used for a different experiment configuration or structure.",
                        http_status=409,
                        field_path="idempotency_key",
                    )
                return self._row_to_job_dto(existing)

            active_count = conn.execute(
                "SELECT COUNT(*) AS cnt FROM jobs WHERE status IN ('queued', 'running', 'cancelling')"
            ).fetchone()["cnt"]
            if int(active_count) >= MAX_ACTIVE_OR_QUEUED_JOBS:
                raise OpenMMAdapterError(
                    "QUEUE_FULL",
                    f"Job queue capacity ({MAX_ACTIVE_OR_QUEUED_JOBS} active/queued jobs) reached. Try again shortly.",
                    http_status=429,
                    retryable=True,
                )

            job_id = f"md-{uuid.uuid4().hex[:12]}"
            now = _utc_now_iso()
            initial_repro = ReproducibilityRecordDto(
                input_structure_revision_id=req.initial_structure_revision_id,
                input_structure_hash_sha256=setup.input_hash_sha256,
                model_preset_id=setup.preset.dto.id,
                model_preset_version=setup.preset.dto.version,
                force_field_source=setup.preset.dto.force_field,
                integrator=setup.preset.dto.integrator,
                ensemble=setup.preset.dto.ensemble,
                engine="OpenMM",
                engine_version=openmm_version(),
                platform_name="pending",
                numerical_precision="pending",
                random_seed=setup.random_seed,
                degrees_of_freedom=0,
                constraints_summary=setup.preset.dto.constraints,
                resolved_settings=ResolvedExperimentSettingsDto(
                    temperature_k=setup.temperature_k,
                    timestep_fs=setup.timestep_fs,
                    duration_ps=setup.duration_ps,
                    total_steps=setup.total_steps,
                    report_interval_steps=setup.report_interval_steps,
                    minimize_before_run=setup.minimize_before_run,
                ),
                termination_status="queued",
                energy_basis="mole-of-systems",
                energy_unit="kJ/mol",
                distance_unit="angstrom",
                time_unit="ps",
                temperature_unit="K",
            )

            conn.execute(
                """
                INSERT INTO jobs (
                    job_id, idempotency_key, request_hash, status,
                    model_preset_id, model_preset_version, initial_structure_revision_id,
                    total_steps, completed_steps, frames_recorded,
                    atom_ids_json, reproducibility_json, warnings_json,
                    error_code, error_message, created_at_iso, updated_at_iso
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    req.idempotency_key,
                    setup.input_hash_sha256,
                    "queued",
                    setup.preset.dto.id,
                    setup.preset.dto.version,
                    req.initial_structure_revision_id,
                    setup.total_steps,
                    0,
                    0,
                    json.dumps(setup.atom_ids),
                    initial_repro.model_dump_json(),
                    json.dumps([]),
                    None,
                    None,
                    now,
                    now,
                ),
            )
            self._cancel_flags[job_id] = threading.Event()
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()

        self._executor.submit(
            self._run_job,
            job_id,
            req.initial_structure_revision_id,
            setup,
        )
        return self._row_to_job_dto(row)

    def _run_job(
        self,
        job_id: str,
        initial_revision_id: str,
        setup: ValidatedWaterSetup,
    ) -> None:
        cancel_event = self._cancel_flags.get(job_id) or threading.Event()

        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT status FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if row is None or row["status"] == "cancelled" or cancel_event.is_set():
                conn.execute(
                    "UPDATE jobs SET status = 'cancelled', updated_at_iso = ? WHERE job_id = ?",
                    (_utc_now_iso(), job_id),
                )
                return
            conn.execute(
                "UPDATE jobs SET status = 'running', updated_at_iso = ? WHERE job_id = ?",
                (_utc_now_iso(), job_id),
            )

        def on_initialized(dof: int, platform_name: str, precision: str) -> None:
            with self._lock, self._connect() as conn:
                row_init = conn.execute(
                    "SELECT reproducibility_json FROM jobs WHERE job_id = ?",
                    (job_id,),
                ).fetchone()
                if row_init is None:
                    return
                repro_dict = json.loads(row_init["reproducibility_json"])
                repro_dict["degrees_of_freedom"] = dof
                repro_dict["platform_name"] = platform_name
                repro_dict["numerical_precision"] = precision
                repro_dict["termination_status"] = "running"
                conn.execute(
                    "UPDATE jobs SET reproducibility_json = ?, updated_at_iso = ? WHERE job_id = ?",
                    (json.dumps(repro_dict), _utc_now_iso(), job_id),
                )

        def on_frame(frame: TrajectoryFrameDto, completed_steps: int) -> None:
            with self._lock, self._connect() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO job_frames (
                        job_id, frame_index, step, simulation_time_ps,
                        kinetic_energy_kj_mol, potential_energy_kj_mol, total_energy_kj_mol,
                        instantaneous_temperature_k, positions_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        job_id,
                        frame.frame_index,
                        frame.step,
                        frame.simulation_time_ps,
                        frame.kinetic_energy_kj_mol,
                        frame.potential_energy_kj_mol,
                        frame.total_energy_kj_mol,
                        frame.instantaneous_temperature_k,
                        json.dumps(frame.positions_angstrom),
                    ),
                )
                conn.execute(
                    """
                    UPDATE jobs
                    SET completed_steps = ?,
                        frames_recorded = frames_recorded + 1,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (completed_steps, _utc_now_iso(), job_id),
                )

        try:
            repro, termination = run_water_simulation(
                setup,
                cancel_requested=cancel_event.is_set,
                on_frame=on_frame,
                on_initialized=on_initialized,
            )
            repro.input_structure_revision_id = initial_revision_id
            warnings: list[str] = []
            if termination == "cancelled":
                warnings.append(
                    "Simulation was cancelled by user request; partial trajectory frames are preserved."
                )

            with self._lock, self._connect() as conn:
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = ?,
                        reproducibility_json = ?,
                        warnings_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (
                        termination,
                        repro.model_dump_json(),
                        json.dumps(warnings),
                        _utc_now_iso(),
                        job_id,
                    ),
                )
        except Exception as exc:
            with self._lock, self._connect() as conn:
                row = conn.execute(
                    "SELECT reproducibility_json, warnings_json FROM jobs WHERE job_id = ?",
                    (job_id,),
                ).fetchone()
                repro_dict = json.loads(row["reproducibility_json"]) if row else {}
                repro_dict["termination_status"] = "failed"
                warnings = json.loads(row["warnings_json"]) if row else []
                warnings.append(f"OpenMM execution failed: {exc}")
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = 'failed',
                        error_code = 'OPENMM_EXECUTION_ERROR',
                        error_message = ?,
                        reproducibility_json = ?,
                        warnings_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (
                        str(exc),
                        json.dumps(repro_dict),
                        json.dumps(warnings),
                        _utc_now_iso(),
                        job_id,
                    ),
                )

    def get_job(self, job_id: str) -> ExperimentJobDto:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if row is None:
                raise OpenMMAdapterError(
                    "JOB_NOT_FOUND",
                    f"Experiment job '{job_id}' was not found.",
                    http_status=404,
                    field_path="job_id",
                )
            return self._row_to_job_dto(row)

    def cancel_job(self, job_id: str) -> ExperimentJobDto:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if row is None:
                raise OpenMMAdapterError(
                    "JOB_NOT_FOUND",
                    f"Experiment job '{job_id}' was not found.",
                    http_status=404,
                    field_path="job_id",
                )

            status = row["status"]
            flag = self._cancel_flags.setdefault(job_id, threading.Event())
            flag.set()

            if status == "queued":
                repro = json.loads(row["reproducibility_json"])
                repro["termination_status"] = "cancelled"
                warnings = json.loads(row["warnings_json"])
                warnings.append("Job was cancelled while queued before integration started.")
                conn.execute(
                    """
                    UPDATE jobs
                    SET status = 'cancelled',
                        reproducibility_json = ?,
                        warnings_json = ?,
                        updated_at_iso = ?
                    WHERE job_id = ?
                    """,
                    (json.dumps(repro), json.dumps(warnings), _utc_now_iso(), job_id),
                )
            elif status == "running":
                conn.execute(
                    "UPDATE jobs SET status = 'cancelling', updated_at_iso = ? WHERE job_id = ?",
                    (_utc_now_iso(), job_id),
                )

            updated = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            return self._row_to_job_dto(updated)

    def get_results(self, job_id: str) -> ExperimentResultsDto:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if row is None:
                raise OpenMMAdapterError(
                    "JOB_NOT_FOUND",
                    f"Experiment job '{job_id}' was not found.",
                    http_status=404,
                    field_path="job_id",
                )

            frame_rows = conn.execute(
                "SELECT * FROM job_frames WHERE job_id = ? ORDER BY frame_index ASC",
                (job_id,),
            ).fetchall()

            frames = [
                TrajectoryFrameDto(
                    frame_index=int(fr["frame_index"]),
                    step=int(fr["step"]),
                    simulation_time_ps=float(fr["simulation_time_ps"]),
                    kinetic_energy_kj_mol=float(fr["kinetic_energy_kj_mol"]),
                    potential_energy_kj_mol=float(fr["potential_energy_kj_mol"]),
                    total_energy_kj_mol=float(fr["total_energy_kj_mol"]),
                    instantaneous_temperature_k=float(fr["instantaneous_temperature_k"]),
                    positions_angstrom=[tuple(p) for p in json.loads(fr["positions_json"])],  # type: ignore[misc]
                )
                for fr in frame_rows
            ]

            status = row["status"]
            repro = ReproducibilityRecordDto.model_validate_json(row["reproducibility_json"])
            return ExperimentResultsDto(
                job_id=row["job_id"],
                status=status,
                is_partial=status in {"queued", "running", "cancelling", "cancelled", "failed", "interrupted"},
                atom_ids=json.loads(row["atom_ids_json"]),
                frames=frames,
                reproducibility=repro,
                warnings=json.loads(row["warnings_json"]),
            )

    def shutdown(self, wait: bool = True) -> None:
        self._executor.shutdown(wait=wait)
