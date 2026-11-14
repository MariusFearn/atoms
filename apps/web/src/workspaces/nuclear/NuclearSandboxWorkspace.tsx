import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Table as TableIcon,
} from 'lucide-react';
import {
  NUCLEAR_GUIDED_EXPERIMENTS,
  type NuclearTrajectoryFrame,
  getNuclearPresetById,
} from '@matterlab/domain';
import { useLabStore } from '../../state/useLabStore';
import { NuclearSceneViewport } from './NuclearSceneViewport';

function buildNuclearPolyline(
  frames: NuclearTrajectoryFrame[],
  accessor: (f: NuclearTrajectoryFrame) => number,
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

export const NuclearSandboxWorkspace: React.FC = () => {
  const [showDataTable, setShowDataTable] = useState(false);

  const serviceStatus = useLabStore((s) => s.serviceStatus);
  const isScienceBusy = useLabStore((s) => s.isScienceBusy);
  const nuclearPresets = useLabStore((s) => s.nuclearPresets);
  const nuclearPresetId = useLabStore((s) => s.nuclearPresetId);
  const nuclearParticles = useLabStore((s) => s.nuclearParticles);
  const selectedNuclearParticleId = useLabStore((s) => s.selectedNuclearParticleId);
  const nuclearForceConfig = useLabStore((s) => s.nuclearForceConfig);
  const nuclearResult = useLabStore((s) => s.nuclearResult);
  const nuclearPlaybackFrameIndex = useLabStore((s) => s.nuclearPlaybackFrameIndex);
  const isPlayingNuclear = useLabStore((s) => s.isPlayingNuclear);
  const nuclearGuidedExperimentId = useLabStore((s) => s.nuclearGuidedExperimentId);
  const showNuclearEdges = useLabStore((s) => s.showNuclearEdges);
  const showNuclearForceArrows = useLabStore((s) => s.showNuclearForceArrows);

  const selectNuclearPreset = useLabStore((s) => s.selectNuclearPreset);
  const selectNuclearParticle = useLabStore((s) => s.selectNuclearParticle);
  const addNuclearParticle = useLabStore((s) => s.addNuclearParticle);
  const updateNuclearParticle = useLabStore((s) => s.updateNuclearParticle);
  const deleteNuclearParticle = useLabStore((s) => s.deleteNuclearParticle);
  const resetNuclearPresetParticles = useLabStore((s) => s.resetNuclearPresetParticles);
  const updateNuclearForceConfig = useLabStore((s) => s.updateNuclearForceConfig);
  const applyNuclearGuidedExperiment = useLabStore((s) => s.applyNuclearGuidedExperiment);
  const runNuclearSimulation = useLabStore((s) => s.runNuclearSimulation);
  const setNuclearPlaybackFrameIndex = useLabStore((s) => s.setNuclearPlaybackFrameIndex);
  const stepNuclearPlayback = useLabStore((s) => s.stepNuclearPlayback);
  const toggleNuclearPlayback = useLabStore((s) => s.toggleNuclearPlayback);
  const resetNuclearPlayback = useLabStore((s) => s.resetNuclearPlayback);
  const toggleNuclearEdges = useLabStore((s) => s.toggleNuclearEdges);
  const toggleNuclearForceArrows = useLabStore((s) => s.toggleNuclearForceArrows);
  const triggerCameraReset = useLabStore((s) => s.triggerCameraReset);

  useEffect(() => {
    if (!isPlayingNuclear || !nuclearResult || nuclearResult.frames.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      const st = useLabStore.getState();
      const count = st.nuclearResult?.frames.length ?? 0;
      if (count <= 1) return;
      st.setNuclearPlaybackFrameIndex((st.nuclearPlaybackFrameIndex + 1) % count);
    }, 85);
    return () => clearInterval(timer);
  }, [isPlayingNuclear, nuclearResult]);

  const preset = getNuclearPresetById(nuclearPresetId);
  const selectedParticle =
    nuclearParticles.find((p) => p.id === selectedNuclearParticleId) ??
    nuclearParticles[0] ??
    null;
  const activeGuided = NUCLEAR_GUIDED_EXPERIMENTS.find(
    (e) => e.id === nuclearGuidedExperimentId,
  );
  const frames = nuclearResult?.frames ?? [];
  const currentFrame = frames[nuclearPlaybackFrameIndex] ?? frames[0];

  const energyMin = frames.length
    ? Math.min(
        ...frames.flatMap((f) => [
          f.totalEnergyMev,
          f.nuclearEnergyMev,
          f.coulombEnergyMev,
          f.kineticEnergyMev,
        ]),
      )
    : -15;
  const energyMax = frames.length
    ? Math.max(
        ...frames.flatMap((f) => [
          f.totalEnergyMev,
          f.nuclearEnergyMev,
          f.coulombEnergyMev,
          f.kineticEnergyMev,
        ]),
      )
    : 15;

  const exportNuclearJson = () => {
    if (!nuclearResult) return;
    const blob = new Blob([JSON.stringify(nuclearResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nuclearResult.presetId}-nuclear-toy.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportNuclearCsv = () => {
    if (!nuclearResult) return;
    const header =
      'frame_index,step,time_fc,kinetic_mev,coulomb_mev,nuclear_mev,gravity_mev,total_mev,min_dist_fm,max_dist_fm';
    const rows = nuclearResult.frames.map(
      (f) =>
        `${f.frameIndex},${f.step},${f.timeFc},${f.kineticEnergyMev},${f.coulombEnergyMev},${f.nuclearEnergyMev},${f.gravityEnergyMev},${f.totalEnergyMev},${f.minPairDistanceFm},${f.maxPairDistanceFm}`,
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nuclearResult.presetId}-nuclear-toy.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="experiment-shell">
      <aside className="sidebar sidebar-left experiment-sidebar" aria-label="Nuclear Toy Sandbox Controls">
        <section className="panel-section">
          <div className="warning-box">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>
              <strong>Exploratory Toy Model:</strong> Classical N-body playground at
              femtometer scale. Not validated quantum nuclear physics.
            </span>
          </div>

          <div className="panel-heading-row">
            <h2 className="panel-heading">Cluster Preset</h2>
            <span className="badge badge-warn">fm · MeV</span>
          </div>
          <select
            aria-label="Nuclear cluster preset"
            className="inspector-input full-width"
            value={nuclearPresetId}
            onChange={(e) => selectNuclearPreset(e.target.value)}
          >
            {nuclearPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="muted small-text">{preset.description}</p>
        </section>

        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">Guided Tests</h2>
            <Sparkles size={13} className="brand-icon" aria-hidden="true" />
          </div>
          <div className="nuclear-guided-list">
            {NUCLEAR_GUIDED_EXPERIMENTS.map((exp) => (
              <button
                key={exp.id}
                type="button"
                className={`nuclear-guided-btn ${nuclearGuidedExperimentId === exp.id ? 'is-active' : ''}`}
                onClick={() => applyNuclearGuidedExperiment(exp.id)}
              >
                {exp.title}
              </button>
            ))}
          </div>
          {activeGuided && (
            <div className="nuclear-guided-note">
              <p className="small-text">
                <strong>Question:</strong> {activeGuided.question}
              </p>
              <p className="small-text muted">
                <strong>What to watch:</strong> {activeGuided.whatToWatch}
              </p>
            </div>
          )}
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">Force Rules (Sliders)</h2>

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Electric Push (Coulomb)</span>
              <span className="mono">{nuclearForceConfig.coulombScale.toFixed(2)}×</span>
            </div>
            <input
              aria-label="Electric push scale"
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={nuclearForceConfig.coulombScale}
              onChange={(e) =>
                updateNuclearForceConfig({ coulombScale: Number(e.target.value) })
              }
            />
          </div>

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Short-Range Nuclear Glue</span>
              <span className="mono">{nuclearForceConfig.nuclearAttractionMev.toFixed(0)} MeV</span>
            </div>
            <input
              aria-label="Short-range nuclear attraction MeV"
              type="range"
              min={0}
              max={200}
              step={2}
              value={nuclearForceConfig.nuclearAttractionMev}
              onChange={(e) =>
                updateNuclearForceConfig({ nuclearAttractionMev: Number(e.target.value) })
              }
            />
          </div>

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Core Bumper Repulsion</span>
              <span className="mono">{nuclearForceConfig.coreRepulsionMev.toFixed(0)} MeV</span>
            </div>
            <input
              aria-label="Core bumper repulsion MeV"
              type="range"
              min={0}
              max={800}
              step={10}
              value={nuclearForceConfig.coreRepulsionMev}
              onChange={(e) =>
                updateNuclearForceConfig({ coreRepulsionMev: Number(e.target.value) })
              }
            />
          </div>

          <div className="qc-checkbox-row">
            <label className="field-label" htmlFor="nuclear-gravity-toggle">
              1/r² Gravity Attraction
            </label>
            <input
              id="nuclear-gravity-toggle"
              type="checkbox"
              checked={nuclearForceConfig.gravityEnabled}
              onChange={(e) =>
                updateNuclearForceConfig({ gravityEnabled: e.target.checked })
              }
            />
          </div>

          {nuclearForceConfig.gravityEnabled && (
            <div className="nuclear-slider-group">
              <div className="nuclear-slider-label">
                <span>Gravity Multiplier (10^x × G)</span>
                <span className="mono">
                  {nuclearForceConfig.gravityLog10Multiplier === 0
                    ? '1× (Real)'
                    : `10^${nuclearForceConfig.gravityLog10Multiplier.toFixed(1)}×`}
                </span>
              </div>
              <input
                aria-label="Gravity log10 multiplier"
                type="range"
                min={0}
                max={38}
                step={0.5}
                value={nuclearForceConfig.gravityLog10Multiplier}
                onChange={(e) =>
                  updateNuclearForceConfig({
                    gravityLog10Multiplier: Number(e.target.value),
                  })
                }
              />
            </div>
          )}

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Energy Damping (Settle)</span>
              <span className="mono">{nuclearForceConfig.dampingPerFc.toFixed(2)}</span>
            </div>
            <input
              aria-label="Energy damping"
              type="range"
              min={0}
              max={0.2}
              step={0.01}
              value={nuclearForceConfig.dampingPerFc}
              onChange={(e) =>
                updateNuclearForceConfig({ dampingPerFc: Number(e.target.value) })
              }
            />
          </div>

          <div className="exp-action-stack">
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={!serviceStatus.nuclearToyAvailable || isScienceBusy}
              onClick={() => void runNuclearSimulation()}
            >
              <Play size={14} aria-hidden="true" />
              <span>{isScienceBusy ? 'Simulating…' : 'Run Toy Simulation'}</span>
            </button>
            {!serviceStatus.nuclearToyAvailable && (
              <p className="muted small-text">
                Start <code>science-api</code> (<code>uv run uvicorn app.main:app --port 8000</code>) to run simulations.
              </p>
            )}
          </div>
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">Real Lab Benchmark ({preset.benchmark.source})</h2>
          <div className="preset-meta-grid small-text">
            <span className="field-label">Nuclide</span>
            <span>{preset.benchmark.nuclide}</span>
            <span className="field-label">Total Binding</span>
            <span className="mono">{preset.benchmark.totalBindingEnergyMev.toFixed(3)} MeV</span>
            <span className="field-label">Cluster ΔE</span>
            <span className="mono">{preset.benchmark.clusterBindingEnergyMev >= 0 ? '+' : ''}{preset.benchmark.clusterBindingEnergyMev.toFixed(4)} MeV</span>
            <span className="field-label">Stability</span>
            <span>{preset.benchmark.stabilitySummary}</span>
            <span className="field-label">Lifetime</span>
            <span>{preset.benchmark.halfLifeNote}</span>
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">Custom Builder ({nuclearParticles.length})</h2>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={resetNuclearPresetParticles}
            >
              Reset Preset
            </button>
          </div>

          <div className="nuclear-builder-add-row">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => addNuclearParticle('alpha')}
            >
              + Alpha (α)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => addNuclearParticle('proton')}
            >
              + Proton (+1)
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => addNuclearParticle('neutron')}
            >
              + Neutron (0)
            </button>
          </div>

          <div className="nuclear-particle-chips" role="group" aria-label="Cluster particles">
            {nuclearParticles.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`toggle-pill ${selectedParticle?.id === p.id ? 'is-on' : ''}`}
                onClick={() => selectNuclearParticle(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {selectedParticle && (
            <div className="coord-block">
              <div className="panel-heading-row">
                <span className="field-label">
                  Edit <strong>{selectedParticle.label}</strong> (q={selectedParticle.chargeE}e)
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs btn-danger-subtle"
                  disabled={nuclearParticles.length <= 2}
                  onClick={() => deleteNuclearParticle(selectedParticle.id)}
                >
                  Remove
                </button>
              </div>
              <div className="coord-row">
                {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                  <label key={axis} className="coord-field">
                    <span>{axis} (fm)</span>
                    <input
                      aria-label={`${selectedParticle.id} position ${axis} fm`}
                      type="number"
                      step={0.1}
                      value={selectedParticle.positionFm[idx]}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        const nextPos = [...selectedParticle.positionFm] as [number, number, number];
                        nextPos[idx] = val;
                        updateNuclearParticle(selectedParticle.id, { positionFm: nextPos });
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="coord-row">
                {(['Vx', 'Vy', 'Vz'] as const).map((axis, idx) => (
                  <label key={axis} className="coord-field">
                    <span>{axis} (c)</span>
                    <input
                      aria-label={`${selectedParticle.id} velocity ${axis} c`}
                      type="number"
                      step={0.01}
                      value={selectedParticle.velocityC[idx]}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!Number.isFinite(val)) return;
                        const nextVel = [...selectedParticle.velocityC] as [number, number, number];
                        nextVel[idx] = val;
                        updateNuclearParticle(selectedParticle.id, { velocityC: nextVel });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>
      </aside>

      <div className="experiment-main-column">
        <div className="experiment-viewport-wrap">
          <NuclearSceneViewport />
        </div>

        <section className="experiment-bottom-panel" aria-label="Nuclear Sandbox Playback and Results">
          <div className="playback-bar">
            <div className="playback-controls">
              <h2 className="panel-heading">Toy Trajectory</h2>
              <button
                type="button"
                className="btn btn-icon"
                disabled={frames.length <= 1}
                onClick={toggleNuclearPlayback}
                aria-label={isPlayingNuclear ? 'Pause playback' : 'Play trajectory'}
              >
                {isPlayingNuclear ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                type="button"
                className="btn btn-icon"
                disabled={frames.length === 0}
                onClick={() => stepNuclearPlayback(-1)}
                aria-label="Step backward"
              >
                <SkipBack size={14} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                disabled={frames.length === 0}
                onClick={() => stepNuclearPlayback(1)}
                aria-label="Step forward"
              >
                <SkipForward size={14} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                disabled={frames.length === 0}
                onClick={resetNuclearPlayback}
                aria-label="Reset playback"
              >
                <RotateCcw size={14} />
              </button>
            </div>

            <div className="playback-scrubber">
              <input
                aria-label="Trajectory frame scrubber"
                type="range"
                min={0}
                max={Math.max(0, frames.length - 1)}
                value={nuclearPlaybackFrameIndex}
                disabled={frames.length <= 1}
                onChange={(e) => setNuclearPlaybackFrameIndex(Number(e.target.value))}
              />
              <span className="mono small-text">
                {currentFrame
                  ? `Frame ${currentFrame.frameIndex + 1}/${frames.length} · ${currentFrame.timeFc.toFixed(2)} fm/c`
                  : 'No simulation run yet'}
              </span>
            </div>

            <div className="playback-exports">
              <button
                type="button"
                className={`toggle-pill ${showNuclearEdges ? 'is-on' : ''}`}
                onClick={toggleNuclearEdges}
                aria-pressed={showNuclearEdges}
              >
                Cluster Edges
              </button>
              <button
                type="button"
                className={`toggle-pill ${showNuclearForceArrows ? 'is-on' : ''}`}
                onClick={toggleNuclearForceArrows}
                aria-pressed={showNuclearForceArrows}
              >
                Force Arrows
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={triggerCameraReset}
              >
                Reset View
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={frames.length === 0}
                onClick={() => setShowDataTable((v) => !v)}
              >
                <TableIcon size={12} aria-hidden="true" />
                <span>{showDataTable ? 'Chart' : 'Table'}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={!nuclearResult}
                onClick={exportNuclearJson}
              >
                <Download size={12} aria-hidden="true" />
                <span>JSON</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={!nuclearResult}
                onClick={exportNuclearCsv}
              >
                <Download size={12} aria-hidden="true" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="observables-grid">
            <div className="observables-stats">
              <div className="stat-card stat-card-wide">
                <span className="field-label">Toy Outcome vs. Real Benchmark</span>
                {nuclearResult ? (
                  <span className="stat-val">
                    <span
                      className={`badge ${
                        nuclearResult.stabilityVerdict === 'bound-oscillating'
                          ? 'badge-ok'
                          : 'badge-warn'
                      }`}
                    >
                      {nuclearResult.stabilityVerdict}
                    </span>{' '}
                    <span className="small-text">{nuclearResult.verdictExplanation}</span>
                  </span>
                ) : (
                  <span className="small-text muted">
                    Pick a preset or guided test on the left and click Run Toy Simulation.
                  </span>
                )}
              </div>

              <div className="stat-card">
                <span className="field-label">Electric Push (Coulomb)</span>
                <span className="stat-val mono">
                  {currentFrame ? `${currentFrame.coulombEnergyMev.toFixed(3)} MeV` : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Nuclear Velcro + Core</span>
                <span className="stat-val mono">
                  {currentFrame ? `${currentFrame.nuclearEnergyMev.toFixed(3)} MeV` : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Gravity Term</span>
                <span className="stat-val mono">
                  {currentFrame ? `${currentFrame.gravityEnergyMev.toExponential(2)} MeV` : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Total / Kinetic</span>
                <span className="stat-val mono">
                  {currentFrame
                    ? `${currentFrame.totalEnergyMev.toFixed(2)} / ${currentFrame.kineticEnergyMev.toFixed(2)} MeV`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="observables-visual">
              {frames.length === 0 ? (
                <p className="empty-chart-msg">
                  Run the toy simulation to plot Electric Repulsion, Short-Range Nuclear Energy,
                  Kinetic Energy, and Total Energy (MeV) over time.
                </p>
              ) : showDataTable ? (
                <div className="table-scroll">
                  <table className="obs-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>t (fm/c)</th>
                        <th>KE (MeV)</th>
                        <th>Coul (MeV)</th>
                        <th>Nuc (MeV)</th>
                        <th>Total (MeV)</th>
                        <th>Max r (fm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frames.map((f) => (
                        <tr
                          key={f.frameIndex}
                          className={f.frameIndex === nuclearPlaybackFrameIndex ? 'is-current' : ''}
                        >
                          <td>{f.step}</td>
                          <td>{f.timeFc.toFixed(2)}</td>
                          <td>{f.kineticEnergyMev.toFixed(3)}</td>
                          <td>{f.coulombEnergyMev.toFixed(3)}</td>
                          <td>{f.nuclearEnergyMev.toFixed(3)}</td>
                          <td>{f.totalEnergyMev.toFixed(3)}</td>
                          <td>{f.maxPairDistanceFm.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="chart-box">
                  <svg viewBox="0 0 420 120" className="energy-svg" aria-label="Nuclear toy energy chart">
                    <polyline
                      fill="none"
                      stroke="#f87171"
                      strokeWidth="1.5"
                      points={buildNuclearPolyline(
                        frames,
                        (f) => f.coulombEnergyMev,
                        420,
                        120,
                        energyMin,
                        energyMax,
                      )}
                    />
                    <polyline
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="1.5"
                      points={buildNuclearPolyline(
                        frames,
                        (f) => f.nuclearEnergyMev,
                        420,
                        120,
                        energyMin,
                        energyMax,
                      )}
                    />
                    <polyline
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="1.5"
                      points={buildNuclearPolyline(
                        frames,
                        (f) => f.kineticEnergyMev,
                        420,
                        120,
                        energyMin,
                        energyMax,
                      )}
                    />
                    <polyline
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="2.1"
                      points={buildNuclearPolyline(
                        frames,
                        (f) => f.totalEnergyMev,
                        420,
                        120,
                        energyMin,
                        energyMax,
                      )}
                    />
                    {frames.length > 1 && (
                      <line
                        x1={(nuclearPlaybackFrameIndex / (frames.length - 1)) * 420}
                        y1={0}
                        x2={(nuclearPlaybackFrameIndex / (frames.length - 1)) * 420}
                        y2={120}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                    )}
                  </svg>
                  <div className="chart-legend small-text">
                    <span className="legend-tot">● Total E</span>
                    <span className="legend-err">● Electric (+)</span>
                    <span className="legend-pe">● Nuclear Velcro</span>
                    <span className="legend-ke">● Kinetic E</span>
                    <span className="muted mono">
                      Range: [{energyMin.toFixed(1)}, {energyMax.toFixed(1)}] MeV
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
