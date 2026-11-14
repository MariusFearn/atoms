import React from 'react';
import {
  AlertTriangle,
  Droplets,
  Hand,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { MAX_MACRO_PARTICLES, type SandWaterPresetId } from '@matterlab/domain';
import { type SandWaterTool, useLabStore } from '../../state/useLabStore';
import { SandWaterViewport } from './SandWaterViewport';

const PRESET_OPTIONS: Array<{ id: SandWaterPresetId; label: string; desc: string }> = [
  {
    id: 'sand-into-water',
    label: 'Sand into Water Pool',
    desc: 'Heavier sand grains (2.4× density) drop into a water pool and sink through displaced fluid.',
  },
  {
    id: 'dam-break',
    label: 'Dam Break (Water Wave)',
    desc: 'A tall column of SPH water collapses and splashes across the laboratory tank.',
  },
  {
    id: 'sand-pile',
    label: 'Dry Sand Pile (DEM)',
    desc: 'Granular grains collide with Coulomb friction to settle into a natural cone.',
  },
  {
    id: 'obstacle-splash',
    label: 'Wave + Center Barrier',
    desc: 'Water wave surges over a solid center wall toward a sand bank on the right.',
  },
];

export const SandWaterWorkspace: React.FC = () => {
  const fluidPresetId = useLabStore((s) => s.fluidPresetId);
  const fluidTool = useLabStore((s) => s.fluidTool);
  const fluidConfig = useLabStore((s) => s.fluidConfig);
  const fluidStats = useLabStore((s) => s.fluidStats);

  const setFluidPreset = useLabStore((s) => s.setFluidPreset);
  const setFluidTool = useLabStore((s) => s.setFluidTool);
  const updateFluidConfig = useLabStore((s) => s.updateFluidConfig);
  const triggerFluidReset = useLabStore((s) => s.triggerFluidReset);
  const triggerFluidClear = useLabStore((s) => s.triggerFluidClear);
  const triggerFluidShake = useLabStore((s) => s.triggerFluidShake);
  const triggerCameraReset = useLabStore((s) => s.triggerCameraReset);

  const activePreset =
    PRESET_OPTIONS.find((p) => p.id === fluidPresetId) ?? PRESET_OPTIONS[0]!;

  const totalCount = fluidStats.waterCount + fluidStats.sandCount;

  const tools: Array<{ id: SandWaterTool; label: string; icon: React.ReactNode }> = [
    { id: 'pour-water', label: 'Pour Water', icon: <Droplets size={14} aria-hidden="true" /> },
    { id: 'pour-sand', label: 'Pour Sand', icon: <Sparkles size={14} aria-hidden="true" /> },
    { id: 'stir', label: 'Stir / Push', icon: <Hand size={14} aria-hidden="true" /> },
    { id: 'orbit', label: 'Orbit Cam', icon: <Orbit size={14} aria-hidden="true" /> },
  ];

  return (
    <div className="experiment-shell">
      <aside className="sidebar sidebar-left experiment-sidebar" aria-label="Sand and Water Sandbox Controls">
        <section className="panel-section">
          <div className="warning-box">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>
              <strong>Macroscopic Scale (DEM + SPH):</strong> Real-time 60 FPS toy tank for
              sand grains &amp; fluid—separate from molecular OpenMM chemistry.
            </span>
          </div>

          <div className="panel-heading-row">
            <h2 className="panel-heading">Tank Preset</h2>
            <span className="badge badge-muted mono">
              {totalCount}/{MAX_MACRO_PARTICLES}
            </span>
          </div>
          <select
            aria-label="Sand and water preset"
            className="inspector-input full-width"
            value={fluidPresetId}
            onChange={(e) => setFluidPreset(e.target.value as SandWaterPresetId)}
          >
            {PRESET_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="muted small-text">{activePreset.desc}</p>
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">Interactive Mouse Tool</h2>
          <div className="fluid-tool-grid" role="group" aria-label="Tank interaction tool">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tool-btn ${fluidTool === t.id ? 'is-active' : ''}`}
                aria-pressed={fluidTool === t.id}
                onClick={() => setFluidTool(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div className="exp-action-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => updateFluidConfig({ paused: !fluidConfig.paused })}
            >
              {fluidConfig.paused ? <Play size={14} /> : <Pause size={14} />}
              <span>{fluidConfig.paused ? 'Resume' : 'Pause'}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={triggerFluidShake}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>Shake Tank</span>
            </button>
          </div>
          <div className="exp-action-row" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={triggerFluidReset}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Reset Preset</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-danger-subtle"
              onClick={triggerFluidClear}
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>Clear Tank</span>
            </button>
          </div>
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">Environment &amp; Material Rules</h2>

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Gravity (Vertical Y)</span>
              <span className="mono">{fluidConfig.gravityY.toFixed(1)}</span>
            </div>
            <input
              aria-label="Vertical gravity"
              type="range"
              min={-30}
              max={6}
              step={0.5}
              value={fluidConfig.gravityY}
              onChange={(e) =>
                updateFluidConfig({ gravityY: Number(e.target.value) })
              }
            />
          </div>

          <div className="exp-action-row" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => updateFluidConfig({ gravityY: 0, gravityX: 0 })}
            >
              Zero-G Float
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => updateFluidConfig({ gravityY: -18, gravityX: 0 })}
            >
              Normal Gravity
            </button>
          </div>

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Tilt Gravity (Left / Right X)</span>
              <span className="mono">{fluidConfig.gravityX.toFixed(1)}</span>
            </div>
            <input
              aria-label="Horizontal tilt gravity"
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={fluidConfig.gravityX}
              onChange={(e) =>
                updateFluidConfig({ gravityX: Number(e.target.value) })
              }
            />
          </div>

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Water Viscosity</span>
              <span className="mono">{fluidConfig.viscosity.toFixed(2)}</span>
            </div>
            <input
              aria-label="Water viscosity"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fluidConfig.viscosity}
              onChange={(e) =>
                updateFluidConfig({ viscosity: Number(e.target.value) })
              }
            />
          </div>

          <div className="nuclear-slider-group">
            <div className="nuclear-slider-label">
              <span>Sand Grain Friction</span>
              <span className="mono">{fluidConfig.sandFriction.toFixed(2)}</span>
            </div>
            <input
              aria-label="Sand friction"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={fluidConfig.sandFriction}
              onChange={(e) =>
                updateFluidConfig({ sandFriction: Number(e.target.value) })
              }
            />
          </div>

          <div className="qc-checkbox-row">
            <label className="field-label" htmlFor="fluid-obstacle-toggle">
              Center Tank Barrier
            </label>
            <input
              id="fluid-obstacle-toggle"
              type="checkbox"
              checked={fluidConfig.hasObstacle}
              onChange={(e) =>
                updateFluidConfig({ hasObstacle: e.target.checked })
              }
            />
          </div>

          <div className="exp-action-stack">
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={triggerCameraReset}
            >
              Reset 3D View
            </button>
          </div>
        </section>
      </aside>

      <div className="experiment-main-column">
        <div className="experiment-viewport-wrap">
          <SandWaterViewport />
        </div>

        <section className="experiment-bottom-panel" style={{ height: 155 }} aria-label="Live Tank Measurements">
          <div className="observables-grid">
            <div className="observables-stats">
              <div className="stat-card">
                <span className="field-label">Water / Sand Grains</span>
                <span className="stat-val mono">
                  {fluidStats.waterCount} / {fluidStats.sandCount}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Kinetic Energy</span>
                <span className="stat-val mono">{fluidStats.kineticEnergy.toFixed(1)} units</span>
              </div>
              <div className="stat-card">
                <span className="field-label">Avg Water Height</span>
                <span className="stat-val mono">{fluidStats.avgWaterY.toFixed(2)}</span>
              </div>
              <div className="stat-card">
                <span className="field-label">Avg Sand Height</span>
                <span className="stat-val mono">{fluidStats.avgSandY.toFixed(2)}</span>
              </div>
            </div>

            <div className="observables-visual">
              <p className="small-text" style={{ margin: '3px 0' }}>
                <strong>Why Sand &amp; Water behave differently here:</strong>{' '}
                <strong>Water</strong> uses <em>SPH fluid pressure + viscosity</em> so droplets
                flow smoothly and splash. <strong>Sand</strong> uses <em>DEM granular contacts +
                friction</em> and is 2.4× denser, so grains sink to the bottom and pile up instead
                of flattening out.
              </p>
              <p className="small-text muted" style={{ margin: 0 }}>
                Try pouring <strong>Sand</strong> into a <strong>Water</strong> pool, cranking{' '}
                <strong>Sand Grain Friction</strong> to 0 vs. 0.8, or switching to{' '}
                <strong>Experiment (OpenMM)</strong> to compare against real nanometer-scale{' '}
                <code>H₂O</code> molecules!
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
