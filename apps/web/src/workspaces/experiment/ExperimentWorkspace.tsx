import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Square,
  Table as TableIcon,
} from 'lucide-react';
import { type TrajectoryFrame, computeFormula } from '@matterlab/domain';
import { LabSceneViewport } from '../../scene/LabSceneViewport';
import { useLabStore } from '../../state/useLabStore';

interface ExperimentWorkspaceProps {
  onRequestProtectedAction: (title: string, message: string, action: () => void) => void;
}

function buildPolylinePoints(
  frames: TrajectoryFrame[],
  accessor: (f: TrajectoryFrame) => number,
  width: number,
  height: number,
  minY: number,
  maxY: number,
): string {
  if (frames.length === 0) return '';
  const spanY = Math.max(1e-6, maxY - minY);
  return frames
    .map((f, idx) => {
      const x =
        frames.length === 1 ? width / 2 : (idx / (frames.length - 1)) * width;
      const y = height - ((accessor(f) - minY) / spanY) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export const ExperimentWorkspace: React.FC<ExperimentWorkspaceProps> = ({
  onRequestProtectedAction,
}) => {
  const [showDataTable, setShowDataTable] = useState(false);
  const [playbackFps, setPlaybackFps] = useState<number>(30);

  const molecule = useLabStore((s) => s.molecule);
  const serviceStatus = useLabStore((s) => s.serviceStatus);
  const simulationPresets = useLabStore((s) => s.simulationPresets);
  const experimentConfig = useLabStore((s) => s.experimentConfig);
  const activeJob = useLabStore((s) => s.activeJob);
  const activeResults = useLabStore((s) => s.activeResults);
  const experimentConnectionLost = useLabStore((s) => s.experimentConnectionLost);
  const playbackFrameIndex = useLabStore((s) => s.playbackFrameIndex);
  const isPlayingTrajectory = useLabStore((s) => s.isPlayingTrajectory);

  const loadExample = useLabStore((s) => s.loadExample);
  const selectSimulationPreset = useLabStore((s) => s.selectSimulationPreset);
  const updateExperimentConfig = useLabStore((s) => s.updateExperimentConfig);
  const runExperiment = useLabStore((s) => s.runExperiment);
  const cancelActiveExperiment = useLabStore((s) => s.cancelActiveExperiment);
  const reconnectActiveExperiment = useLabStore((s) => s.reconnectActiveExperiment);
  const resetExperimentInputs = useLabStore((s) => s.resetExperimentInputs);
  const setPlaybackFrameIndex = useLabStore((s) => s.setPlaybackFrameIndex);
  const stepTrajectory = useLabStore((s) => s.stepTrajectory);
  const toggleTrajectoryPlayback = useLabStore((s) => s.toggleTrajectoryPlayback);
  const resetTrajectoryPlayback = useLabStore((s) => s.resetTrajectoryPlayback);

  // Advance playback timer without mutating simulation state
  useEffect(() => {
    if (!isPlayingTrajectory || !activeResults || activeResults.frames.length <= 1) {
      return;
    }
    const intervalMs = Math.max(16, Math.round(1000 / playbackFps));
    const timer = setInterval(() => {
      const st = useLabStore.getState();
      const count = st.activeResults?.frames.length ?? 0;
      if (count <= 1) return;
      const next = (st.playbackFrameIndex + 1) % count;
      st.setPlaybackFrameIndex(next);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlayingTrajectory, activeResults, playbackFps]);

  const selectedPreset =
    simulationPresets.find((p) => p.id === experimentConfig.modelPresetId) ??
    simulationPresets[0];

  const jobIsActive =
    activeJob?.status === 'queued' ||
    activeJob?.status === 'running' ||
    activeJob?.status === 'cancelling';

  const frames = activeResults?.frames ?? [];
  const currentFrame = frames[playbackFrameIndex] ?? frames[0];

  // Quick pre-flight check for pure multi-water cluster
  const isPureWaterCandidate =
    molecule.atoms.length >= 6 &&
    molecule.atoms.length % 3 === 0 &&
    molecule.atoms.every((a) => a.element === 'O' || a.element === 'H');

  const exportResultsJson = () => {
    if (!activeResults) return;
    const blob = new Blob([JSON.stringify(activeResults, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeResults.jobId}-trajectory.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportObservablesCsv = () => {
    if (!activeResults) return;
    const header =
      'frame_index,step,simulation_time_ps,kinetic_energy_kj_mol,potential_energy_kj_mol,total_energy_kj_mol,instantaneous_temperature_k';
    const rows = activeResults.frames.map(
      (f) =>
        `${f.frameIndex},${f.step},${f.simulationTimePs},${f.kineticEnergyKjMol},${f.potentialEnergyKjMol},${f.totalEnergyKjMol},${f.instantaneousTemperatureK}`,
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeResults.jobId}-observables.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const energyMin = frames.length
    ? Math.min(
        ...frames.flatMap((f) => [
          f.totalEnergyKjMol,
          f.potentialEnergyKjMol,
          f.kineticEnergyKjMol,
        ]),
      )
    : -100;
  const energyMax = frames.length
    ? Math.max(
        ...frames.flatMap((f) => [
          f.totalEnergyKjMol,
          f.potentialEnergyKjMol,
          f.kineticEnergyKjMol,
        ]),
      )
    : 100;

  return (
    <div className="experiment-shell">
      <aside className="sidebar sidebar-left experiment-sidebar" aria-label="Experiment Configuration">
        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">System Input</h2>
            <span className="badge badge-muted mono">{computeFormula(molecule)}</span>
          </div>
          <p className="muted small-text">
            Active structure: <strong>{molecule.name}</strong> ({molecule.atoms.length} atoms,{' '}
            rev <code>{molecule.revisionId}</code>). Editing in Molecule Editor creates a new revision
            and never mutates a running job.
          </p>
          {!isPureWaterCandidate && (
            <div className="warning-box">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>
                OpenMM TIP3P presets require 2–64 intact H₂O molecules. Load the curated 8-water
                cluster to run right away:
              </span>
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={() =>
              onRequestProtectedAction(
                'Load TIP3P Water Cluster (8 H₂O)',
                'You have unsaved edits. Loading the 8-water cluster will replace the current structure in the editor.',
                () => loadExample('water-cluster-8'),
              )
            }
          >
            Load Water Cluster (8 H₂O)
          </button>
        </section>

        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">Versioned Model Preset</h2>
            <span className={`badge ${serviceStatus.openmmAvailable ? 'badge-ok' : 'badge-warn'}`}>
              {serviceStatus.openmmAvailable
                ? `OpenMM ${serviceStatus.openmmVersion ?? ''}`.trim()
                : 'Offline'}
            </span>
          </div>

          <label className="field-label" htmlFor="preset-select">
            Model Preset
          </label>
          <select
            id="preset-select"
            className="inspector-input full-width"
            value={experimentConfig.modelPresetId}
            disabled={!serviceStatus.openmmAvailable || jobIsActive}
            onChange={(e) => selectSimulationPreset(e.target.value)}
          >
            {simulationPresets.length === 0 ? (
              <option value={experimentConfig.modelPresetId}>
                Connect Science API to load OpenMM presets
              </option>
            ) : (
              simulationPresets.map((preset) => (
                <option key={`${preset.id}-${preset.version}`} value={preset.id}>
                  {preset.name} (v{preset.version})
                </option>
              ))
            )}
          </select>

          {selectedPreset && (
            <div className="preset-meta-grid">
              <span className="field-label">Force Field</span>
              <span className="inspector-value small-text">{selectedPreset.forceField}</span>
              <span className="field-label">Integrator</span>
              <span className="inspector-value small-text">{selectedPreset.integrator}</span>
              <span className="field-label">Ensemble</span>
              <span className="inspector-value mono">{selectedPreset.ensemble}</span>
              <span className="field-label">Boundaries</span>
              <span className="inspector-value small-text">{selectedPreset.boundaryConditions}</span>
            </div>
          )}
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">Validated Settings</h2>
          <div className="inspector-grid">
            <label className="field-label" htmlFor="exp-temp-input">
              {selectedPreset?.supportsThermostatTarget
                ? 'Thermostat Target (K)'
                : 'Initial Velocity Temp (K)'}
            </label>
            <input
              id="exp-temp-input"
              className="inspector-input mono"
              type="number"
              step={10}
              min={selectedPreset?.limits.minTemperatureK ?? 50}
              max={selectedPreset?.limits.maxTemperatureK ?? 600}
              value={experimentConfig.temperature.value}
              disabled={jobIsActive}
              onChange={(e) =>
                updateExperimentConfig({ temperatureK: Number(e.target.value) })
              }
            />

            <label className="field-label" htmlFor="exp-dt-input">
              Timestep (fs)
            </label>
            <input
              id="exp-dt-input"
              className="inspector-input mono"
              type="number"
              step={0.1}
              min={selectedPreset?.limits.minTimestepFs ?? 0.25}
              max={selectedPreset?.limits.maxTimestepFs ?? 2.0}
              value={experimentConfig.timestep.value}
              disabled={jobIsActive}
              onChange={(e) =>
                updateExperimentConfig({ timestepFs: Number(e.target.value) })
              }
            />

            <label className="field-label" htmlFor="exp-dur-input">
              Duration (ps)
            </label>
            <input
              id="exp-dur-input"
              className="inspector-input mono"
              type="number"
              step={0.5}
              min={selectedPreset?.limits.minDurationPs ?? 0.1}
              max={selectedPreset?.limits.maxDurationPs ?? 20.0}
              value={experimentConfig.duration.value}
              disabled={jobIsActive}
              onChange={(e) =>
                updateExperimentConfig({ durationPs: Number(e.target.value) })
              }
            />

            <label className="field-label" htmlFor="exp-interval-input">
              Report Interval (steps)
            </label>
            <input
              id="exp-interval-input"
              className="inspector-input mono"
              type="number"
              step={10}
              min={1}
              max={5000}
              value={experimentConfig.reportIntervalSteps}
              disabled={jobIsActive}
              onChange={(e) =>
                updateExperimentConfig({
                  reportIntervalSteps: Number.parseInt(e.target.value, 10),
                })
              }
            />

            <label className="field-label" htmlFor="exp-seed-input">
              Random Seed
            </label>
            <input
              id="exp-seed-input"
              className="inspector-input mono"
              type="number"
              step={1}
              min={0}
              value={experimentConfig.randomSeed}
              disabled={jobIsActive}
              onChange={(e) =>
                updateExperimentConfig({
                  randomSeed: Number.parseInt(e.target.value, 10),
                })
              }
            />

            <label className="field-label" htmlFor="exp-min-checkbox">
              Minimize First
            </label>
            <input
              id="exp-min-checkbox"
              type="checkbox"
              checked={experimentConfig.minimizeBeforeRun}
              disabled={jobIsActive}
              onChange={(e) =>
                updateExperimentConfig({ minimizeBeforeRun: e.target.checked })
              }
            />
          </div>

          <div className="exp-action-stack">
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={!serviceStatus.openmmAvailable || jobIsActive}
              onClick={() => void runExperiment()}
            >
              <Play size={14} aria-hidden="true" />
              <span>{jobIsActive ? 'Simulation Running…' : 'Run OpenMM Simulation'}</span>
            </button>

            <div className="exp-action-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!jobIsActive || activeJob?.status === 'cancelling'}
                onClick={() => void cancelActiveExperiment()}
              >
                <Square size={13} aria-hidden="true" />
                <span>Cancel Job</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={resetExperimentInputs}
                title="Restores captured starting revision & preset defaults without starting or cancelling a job"
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span>Reset Inputs</span>
              </button>
            </div>

            {experimentConnectionLost && activeJob && (
              <button
                type="button"
                className="btn btn-primary btn-full"
                onClick={() => void reconnectActiveExperiment()}
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>Reconnect Job ({activeJob.jobId})</span>
              </button>
            )}
          </div>
        </section>

        {selectedPreset && (
          <section className="panel-section">
            <h2 className="panel-heading">Model Assumptions &amp; Limits</h2>
            <ul className="limitation-list">
              {selectedPreset.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
              {selectedPreset.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <div className="experiment-main-column">
        <div className="experiment-viewport-wrap">
          <LabSceneViewport />
        </div>

        <section className="experiment-bottom-panel" aria-label="Simulation Trajectory and Observables">
          <div className="playback-bar">
            <div className="playback-controls" role="group" aria-label="Trajectory Playback">
              <span className="panel-heading">Trajectory Playback</span>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={frames.length <= 1}
                onClick={toggleTrajectoryPlayback}
                aria-label={isPlayingTrajectory ? 'Pause trajectory playback' : 'Play trajectory playback'}
              >
                {isPlayingTrajectory ? <Pause size={12} /> : <Play size={12} />}
                <span>{isPlayingTrajectory ? 'Pause' : 'Play'}</span>
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={frames.length === 0 || playbackFrameIndex <= 0}
                onClick={() => stepTrajectory(-1)}
                aria-label="Step back one trajectory frame"
              >
                <SkipBack size={12} />
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={frames.length === 0 || playbackFrameIndex >= frames.length - 1}
                onClick={() => stepTrajectory(1)}
                aria-label="Step forward one trajectory frame"
              >
                <SkipForward size={12} />
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={frames.length === 0}
                onClick={resetTrajectoryPlayback}
                title="Reset playback to frame 0"
              >
                Reset Playback
              </button>
              <label className="sr-only" htmlFor="playback-fps-select">
                Playback frame rate
              </label>
              <select
                id="playback-fps-select"
                className="compact-select"
                value={playbackFps}
                onChange={(e) => setPlaybackFps(Number(e.target.value))}
                aria-label="Playback speed"
                title="Trajectory playback frame rate (independent of MD timestep)"
              >
                <option value={10}>10 FPS</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
            </div>

            <div className="playback-scrubber">
              <input
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                value={playbackFrameIndex}
                disabled={frames.length <= 1}
                aria-label="Trajectory frame scrubber"
                onChange={(e) => setPlaybackFrameIndex(Number(e.target.value))}
              />
              <span className="mono small-text">
                Frame {frames.length ? playbackFrameIndex + 1 : 0}/{frames.length} ·{' '}
                {currentFrame ? `${currentFrame.simulationTimePs.toFixed(3)} ps (step ${currentFrame.step})` : '—'}
              </span>
            </div>

            <div className="playback-exports">
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={frames.length === 0}
                onClick={() => setShowDataTable((v) => !v)}
              >
                <TableIcon size={12} aria-hidden="true" />
                <span>{showDataTable ? 'Chart' : 'Table'}</span>
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={!activeResults}
                onClick={exportResultsJson}
              >
                <Download size={12} aria-hidden="true" />
                <span>JSON</span>
              </button>
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={!activeResults}
                onClick={exportObservablesCsv}
              >
                <Download size={12} aria-hidden="true" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="observables-grid">
            <div className="observables-stats">
              <div className="stat-card">
                <span className="field-label">Job Status</span>
                <span className="mono stat-val">
                  {experimentConnectionLost
                    ? 'connection-lost'
                    : activeJob?.status ?? 'idle'}
                  {activeResults?.isPartial ? ' (partial)' : ''}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Total Energy (molar)</span>
                <span className="mono stat-val">
                  {currentFrame ? `${currentFrame.totalEnergyKjMol.toFixed(3)} kJ/mol` : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Potential / Kinetic</span>
                <span className="mono stat-val">
                  {currentFrame
                    ? `${currentFrame.potentialEnergyKjMol.toFixed(2)} / ${currentFrame.kineticEnergyKjMol.toFixed(2)} kJ/mol`
                    : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Instantaneous Kinetic Temp</span>
                <span className="mono stat-val">
                  {currentFrame
                    ? `${currentFrame.instantaneousTemperatureK.toFixed(1)} K`
                    : '—'}
                  {activeResults
                    ? ` (DOF=${activeResults.reproducibility.degreesOfFreedom})`
                    : ''}
                </span>
              </div>
              {activeResults && (
                <div className="stat-card stat-card-wide">
                  <span className="field-label">Reproducibility</span>
                  <span className="mono small-text">
                    {activeResults.reproducibility.engine} {activeResults.reproducibility.engineVersion} ·{' '}
                    {activeResults.reproducibility.platformName} · rev{' '}
                    {activeResults.reproducibility.inputStructureRevisionId} · seed{' '}
                    {activeResults.reproducibility.randomSeed} · hash{' '}
                    {activeResults.reproducibility.inputStructureHashSha256.slice(0, 12)}…
                  </span>
                </div>
              )}
            </div>

            <div className="observables-visual">
              {frames.length === 0 ? (
                <div className="empty-chart-msg">
                  Run an OpenMM simulation to view energy (kJ/mol, whole-system molar basis) and
                  instantaneous kinetic temperature trajectories. Playback pause/step does not alter
                  engine integration.
                </div>
              ) : showDataTable ? (
                <div className="table-scroll" role="region" aria-label="Observables Data Table">
                  <table className="obs-table">
                    <thead>
                      <tr>
                        <th>Frame</th>
                        <th>t (ps)</th>
                        <th>PE (kJ/mol)</th>
                        <th>KE (kJ/mol)</th>
                        <th>E_tot (kJ/mol)</th>
                        <th>T_kin (K)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frames.map((f) => (
                        <tr
                          key={f.frameIndex}
                          className={f.frameIndex === playbackFrameIndex ? 'is-current' : ''}
                        >
                          <td>{f.frameIndex}</td>
                          <td>{f.simulationTimePs.toFixed(3)}</td>
                          <td>{f.potentialEnergyKjMol.toFixed(3)}</td>
                          <td>{f.kineticEnergyKjMol.toFixed(3)}</td>
                          <td>{f.totalEnergyKjMol.toFixed(3)}</td>
                          <td>{f.instantaneousTemperatureK.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="chart-box">
                  <svg
                    viewBox="0 0 460 115"
                    className="energy-svg"
                    role="img"
                    aria-label="System Energy Trajectory Chart in kJ/mol"
                  >
                    <polyline
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="1.6"
                      points={buildPolylinePoints(
                        frames,
                        (f) => f.potentialEnergyKjMol,
                        460,
                        105,
                        energyMin,
                        energyMax,
                      )}
                    />
                    <polyline
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.6"
                      points={buildPolylinePoints(
                        frames,
                        (f) => f.kineticEnergyKjMol,
                        460,
                        105,
                        energyMin,
                        energyMax,
                      )}
                    />
                    <polyline
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="2.2"
                      points={buildPolylinePoints(
                        frames,
                        (f) => f.totalEnergyKjMol,
                        460,
                        105,
                        energyMin,
                        energyMax,
                      )}
                    />
                    {frames.length > 1 && (
                      <line
                        x1={(playbackFrameIndex / (frames.length - 1)) * 460}
                        x2={(playbackFrameIndex / (frames.length - 1)) * 460}
                        y1={0}
                        y2={115}
                        stroke="#facc15"
                        strokeDasharray="3,3"
                        strokeWidth="1.2"
                      />
                    )}
                  </svg>
                  <div className="chart-legend small-text">
                    <span className="legend-tot">● Total Energy</span>
                    <span className="legend-pe">● Potential Energy</span>
                    <span className="legend-ke">● Kinetic Energy</span>
                    <span className="muted">
                      Range: [{energyMin.toFixed(1)}, {energyMax.toFixed(1)}] kJ/mol
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
