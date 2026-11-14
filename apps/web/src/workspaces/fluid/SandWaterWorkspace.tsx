import React from 'react';
import {
  AlertTriangle,
  Droplets,
  Flame,
  Hand,
  Magnet,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { type SandWaterPresetId } from '@matterlab/domain';
import {
  type SandWaterContainerMode,
  type SandWaterTool,
  useLabStore,
} from '../../state/useLabStore';
import { SandWaterViewport } from './SandWaterViewport';
import { MAX_GPU_PARTICLES } from './webgpuFluidEngine';

const PRESET_OPTIONS: Array<{ id: SandWaterPresetId; label: string; desc: string }> = [
  {
    id: 'cascade-maze',
    label: '3D Cascade Maze (Water + Oil)',
    desc: 'Water and immiscible light oil cascade down 4 alternating zig-zag ramps into catch basins.',
  },
  {
    id: 'density-tower',
    label: '4-Layer Density Tower',
    desc: 'Oil (0.72), Water (1.0), Sand (2.4), and Ferrofluid (3.2) stratify by density; use the Magnet!',
  },
  {
    id: 'plinko-funnel',
    label: '3D Plinko & Funnel',
    desc: 'A steep funnel feeds mixed fluid and sand grains through staggered diamond pegs into bins.',
  },
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
  const fluidContainerMode = useLabStore((s) => s.fluidContainerMode);
  const fluidTargetParticleCount = useLabStore((s) => s.fluidTargetParticleCount);
  const fluidBackendLabel = useLabStore((s) => s.fluidBackendLabel);
  const fluidAutoPourKind = useLabStore((s) => s.fluidAutoPourKind);
  const fluidConfig = useLabStore((s) => s.fluidConfig);
  const fluidStats = useLabStore((s) => s.fluidStats);

  const setFluidPreset = useLabStore((s) => s.setFluidPreset);
  const setFluidTool = useLabStore((s) => s.setFluidTool);
  const setFluidContainerMode = useLabStore((s) => s.setFluidContainerMode);
  const setFluidTargetParticleCount = useLabStore((s) => s.setFluidTargetParticleCount);
  const setFluidAutoPourKind = useLabStore((s) => s.setFluidAutoPourKind);
  const updateFluidConfig = useLabStore((s) => s.updateFluidConfig);
  const triggerFluidReset = useLabStore((s) => s.triggerFluidReset);
  const triggerFluidClear = useLabStore((s) => s.triggerFluidClear);
  const triggerFluidShake = useLabStore((s) => s.triggerFluidShake);
  const triggerCameraReset = useLabStore((s) => s.triggerCameraReset);

  const activePreset =
    PRESET_OPTIONS.find((p) => p.id === fluidPresetId) ?? PRESET_OPTIONS[0]!;

  const totalCount =
    fluidStats.waterCount +
    fluidStats.sandCount +
    fluidStats.oilCount +
    fluidStats.ferroCount;

  const tools: Array<{
    id: SandWaterTool;
    label: string;
    icon: React.ReactNode;
    fullSpan?: boolean;
  }> = [
    { id: 'pour-water', label: 'Pour Water', icon: <Droplets size={14} aria-hidden="true" /> },
    { id: 'pour-oil', label: 'Pour Oil', icon: <Flame size={14} aria-hidden="true" /> },
    { id: 'pour-sand', label: 'Pour Sand', icon: <Sparkles size={14} aria-hidden="true" /> },
    { id: 'pour-ferro', label: 'Pour Ferro', icon: <Zap size={14} aria-hidden="true" /> },
    { id: 'stir', label: 'Stir / Push', icon: <Hand size={14} aria-hidden="true" /> },
    { id: 'magnet', label: 'Magnet', icon: <Magnet size={14} aria-hidden="true" /> },
    {
      id: 'orbit',
      label: 'Orbit Cam',
      icon: <Orbit size={14} aria-hidden="true" />,
      fullSpan: true,
    },
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
            <h2 className="panel-heading">Container &amp; GPU Scale</h2>
            <span className="badge badge-muted mono">
              {totalCount.toLocaleString()}/{MAX_GPU_PARTICLES.toLocaleString()}
            </span>
          </div>
          <div className="segmented full-width" role="group" aria-label="Container shape">
            {(
              [
                ['glass', '3D Glass'],
                ['tank', 'Lab Tank'],
              ] as Array<[SandWaterContainerMode, string]>
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`seg-btn ${fluidContainerMode === mode ? 'is-active' : ''}`}
                onClick={() => setFluidContainerMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="gpu-particle-count" style={{ marginTop: 8, display: 'block' }}>
            Preset Particle Count (GPU)
          </label>
          <select
            id="gpu-particle-count"
            aria-label="GPU preset particle count"
            className="inspector-input full-width"
            value={fluidTargetParticleCount}
            onChange={(e) => setFluidTargetParticleCount(Number(e.target.value))}
          >
            <option value={8000}>8,000 particles (Light)</option>
            <option value={24000}>24,000 particles (Standard Glass)</option>
            <option value={40000}>40,000 particles (Dense RTX)</option>
            <option value={56000}>56,000 particles (Ultra RTX)</option>
          </select>

          <label className="field-label" htmlFor="fluid-preset-select" style={{ marginTop: 8, display: 'block' }}>
            Preset Scenario
          </label>
          <select
            id="fluid-preset-select"
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
                style={t.fullSpan ? { gridColumn: '1 / -1' } : undefined}
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
              className={`btn btn-secondary btn-xs ${fluidAutoPourKind === 'water' ? 'btn-primary' : ''}`}
              onClick={() =>
                setFluidAutoPourKind(fluidAutoPourKind === 'water' ? 'none' : 'water')
              }
            >
              {fluidAutoPourKind === 'water' ? 'Stop (Water)' : 'Auto: Water'}
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-xs ${fluidAutoPourKind === 'oil' ? 'btn-primary' : ''}`}
              onClick={() =>
                setFluidAutoPourKind(fluidAutoPourKind === 'oil' ? 'none' : 'oil')
              }
            >
              {fluidAutoPourKind === 'oil' ? 'Stop (Oil)' : 'Auto: Oil'}
            </button>
          </div>
          <div className="exp-action-row" style={{ marginTop: 4 }}>
            <button
              type="button"
              className={`btn btn-secondary btn-xs ${fluidAutoPourKind === 'sand' ? 'btn-primary' : ''}`}
              onClick={() =>
                setFluidAutoPourKind(fluidAutoPourKind === 'sand' ? 'none' : 'sand')
              }
            >
              {fluidAutoPourKind === 'sand' ? 'Stop (Sand)' : 'Auto: Sand'}
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-xs ${fluidAutoPourKind === 'ferro' ? 'btn-primary' : ''}`}
              onClick={() =>
                setFluidAutoPourKind(fluidAutoPourKind === 'ferro' ? 'none' : 'ferro')
              }
            >
              {fluidAutoPourKind === 'ferro' ? 'Stop (Ferro)' : 'Auto: Ferro'}
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
              onClick={() => updateFluidConfig({ gravityY: 0, gravityX: 0, gravityZ: 0 })}
            >
              Zero-G Float
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => updateFluidConfig({ gravityY: -18, gravityX: 0, gravityZ: 0 })}
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
              <span>Tilt Gravity (Front / Back Z)</span>
              <span className="mono">{(fluidConfig.gravityZ ?? 0).toFixed(1)}</span>
            </div>
            <input
              aria-label="Depth tilt gravity"
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={fluidConfig.gravityZ ?? 0}
              onChange={(e) =>
                updateFluidConfig({ gravityZ: Number(e.target.value) })
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
            <label
              className="field-label"
              htmlFor="fluid-obstacle-toggle"
              title={
                fluidContainerMode === 'glass'
                  ? 'Switch to Lab Tank container to use Center Barrier'
                  : 'Toggle solid barrier in the middle of the Lab Tank'
              }
            >
              {fluidContainerMode === 'glass'
                ? 'Center Barrier (Lab Tank only)'
                : 'Center Tank Barrier'}
            </label>
            <input
              id="fluid-obstacle-toggle"
              type="checkbox"
              disabled={fluidContainerMode === 'glass'}
              checked={fluidContainerMode === 'tank' && fluidConfig.hasObstacle}
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
                <span className="field-label">Water · Oil · Sand · Ferro</span>
                <span className="stat-val mono">
                  {fluidStats.waterCount} · {fluidStats.oilCount} · {fluidStats.sandCount} ·{' '}
                  {fluidStats.ferroCount}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">
                  {fluidBackendLabel.startsWith('WebGPU')
                    ? 'GPU Spatial Grid'
                    : 'Kinetic Energy'}
                </span>
                <span className="stat-val mono">
                  {fluidBackendLabel.startsWith('WebGPU')
                    ? '52×40×26 (54k cells)'
                    : `${fluidStats.kineticEnergy.toFixed(1)} units`}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Compute / Render</span>
                <span className="stat-val">{fluidBackendLabel}</span>
              </div>
              <div className="stat-card">
                <span className="field-label">Total Active</span>
                <span className="stat-val mono">{totalCount.toLocaleString()}</span>
              </div>
            </div>

            <div className="observables-visual">
              <p className="small-text" style={{ margin: '3px 0' }}>
                <strong>4-Material Physics &amp; 3D Maze:</strong>{' '}
                <strong>Oil</strong> (ρ=0.72) is immiscible with <strong>Water</strong> (ρ=1.0) and
                floats on top. <strong>Sand</strong> (ρ=2.4) sinks &amp; piles via friction, while{' '}
                <strong>Ferrofluid</strong> (ρ=3.2) reacts strongly to the <strong>Magnet</strong>{' '}
                tool!
              </p>
              <p className="small-text muted" style={{ margin: 0 }}>
                Try <strong>3D Cascade Maze</strong> with <strong>Auto: Water / Oil</strong>, or{' '}
                <strong>4-Layer Density Tower</strong> with <strong>Magnet</strong> drag +{' '}
                <strong>Tilt Z</strong>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
