import React from 'react';
import {
  HYDROGENIC_ORBITALS,
  HYDROGEN_ISOTOPES,
  type HydrogenIsotopeId,
  type HydrogenicOrbitalId,
  LITHIUM_ISOTOPE_SHIFT_NOTE,
  MVP_ELEMENTS,
  computeHydrogenTransition,
} from '@matterlab/domain';
import { useLabStore } from '../../state/useLabStore';
import { AtomWaveViewport } from './AtomWaveViewport';

export const AtomWaveWorkspace: React.FC = () => {
  const atomElementSymbol = useLabStore((s) => s.atomElementSymbol);
  const atomOrbitalId = useLabStore((s) => s.atomOrbitalId);
  const atomIsotopeId = useLabStore((s) => s.atomIsotopeId);
  const atomFieldMode = useLabStore((s) => s.atomFieldMode);
  const atomAnimateWave = useLabStore((s) => s.atomAnimateWave);
  const atomSlicePlane = useLabStore((s) => s.atomSlicePlane);
  const atomShowDipoleLines = useLabStore((s) => s.atomShowDipoleLines);
  const atomTransitionUpperN = useLabStore((s) => s.atomTransitionUpperN);
  const atomTransitionLowerN = useLabStore((s) => s.atomTransitionLowerN);

  const setAtomElementSymbol = useLabStore((s) => s.setAtomElementSymbol);
  const setAtomOrbitalId = useLabStore((s) => s.setAtomOrbitalId);
  const setAtomIsotopeId = useLabStore((s) => s.setAtomIsotopeId);
  const setAtomFieldMode = useLabStore((s) => s.setAtomFieldMode);
  const toggleAtomAnimateWave = useLabStore((s) => s.toggleAtomAnimateWave);
  const toggleAtomSlicePlane = useLabStore((s) => s.toggleAtomSlicePlane);
  const toggleAtomShowDipoleLines = useLabStore((s) => s.toggleAtomShowDipoleLines);
  const setAtomTransitionLevels = useLabStore((s) => s.setAtomTransitionLevels);
  const triggerCameraReset = useLabStore((s) => s.triggerCameraReset);

  const element =
    MVP_ELEMENTS.find((e) => e.symbol === atomElementSymbol) ?? MVP_ELEMENTS[0]!;
  const primaryIsotope = element.isotopes[0]!;
  const neutrons = primaryIsotope.massNumber - element.atomicNumber;
  const orbitalSpec =
    HYDROGENIC_ORBITALS.find((o) => o.id === atomOrbitalId) ?? HYDROGENIC_ORBITALS[0]!;
  const transition = computeHydrogenTransition(
    atomTransitionUpperN,
    atomTransitionLowerN,
    atomIsotopeId,
  );

  return (
    <div className="experiment-shell">
      <aside className="sidebar sidebar-left experiment-sidebar" aria-label="Atom and Standing-Wave Controls">
        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">Element &amp; Nucleus Reference</h2>
            <span className="badge badge-muted">Curated Data</span>
          </div>
          <select
            aria-label="Select element"
            className="inspector-input full-width"
            value={element.symbol}
            onChange={(e) => setAtomElementSymbol(e.target.value)}
          >
            {MVP_ELEMENTS.map((el) => (
              <option key={el.symbol} value={el.symbol}>
                {el.atomicNumber} {el.symbol} — {el.name}
              </option>
            ))}
          </select>

          <div className="preset-meta-grid small-text">
            <span className="field-label">Protons (Z)</span>
            <span className="mono">{element.atomicNumber}</span>
            <span className="field-label">Neutrons (N)</span>
            <span className="mono">
              {neutrons} (for {primaryIsotope.label})
            </span>
            <span className="field-label">Electrons</span>
            <span className="mono">{element.atomicNumber} (neutral)</span>
            <span className="field-label">Config</span>
            <span className="mono">{element.electronConfiguration}</span>
          </div>
          <p className="scientific-note">
            Hydrogenic orbital shapes below show single-electron standing waves (exact for H; qualitative illustration for multi-electron atoms).
          </p>
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">3D Standing-Wave Orbital</h2>
          <select
            aria-label="Hydrogenic orbital"
            className="inspector-input full-width"
            value={atomOrbitalId}
            onChange={(e) => setAtomOrbitalId(e.target.value as HydrogenicOrbitalId)}
          >
            {HYDROGENIC_ORBITALS.map((orb) => (
              <option key={orb.id} value={orb.id}>
                {orb.label}
              </option>
            ))}
          </select>
          <p className="muted small-text">{orbitalSpec.summary}</p>

          <div className="preset-meta-grid small-text">
            <span className="field-label">Radial nodes</span>
            <span className="mono">{orbitalSpec.radialNodes}</span>
            <span className="field-label">Angular nodes</span>
            <span className="mono">{orbitalSpec.angularNodes}</span>
          </div>
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">Displayed Field Quantity</h2>
          <div className="segmented full-width" role="group" aria-label="Orbital quantity mode">
            <button
              type="button"
              className={`seg-btn ${atomFieldMode === 'amplitude-phase' ? 'is-active' : ''}`}
              onClick={() => setAtomFieldMode('amplitude-phase')}
            >
              Amplitude &amp; Phase (ψ)
            </button>
            <button
              type="button"
              className={`seg-btn ${atomFieldMode === 'probability-density' ? 'is-active' : ''}`}
              onClick={() => setAtomFieldMode('probability-density')}
            >
              Probability (|ψ|²)
            </button>
          </div>

          <div className="qc-checkbox-row">
            <label className="field-label" htmlFor="atom-animate-toggle">
              Animate Standing Wave (ψ cos ωt)
            </label>
            <input
              id="atom-animate-toggle"
              type="checkbox"
              checked={atomAnimateWave}
              disabled={atomFieldMode !== 'amplitude-phase'}
              onChange={toggleAtomAnimateWave}
            />
          </div>

          <div className="qc-checkbox-row">
            <label className="field-label" htmlFor="atom-slice-toggle">
              Cross-Section Slice (z ≤ 0)
            </label>
            <input
              id="atom-slice-toggle"
              type="checkbox"
              checked={atomSlicePlane}
              onChange={toggleAtomSlicePlane}
            />
          </div>

          <div className="qc-checkbox-row">
            <label className="field-label" htmlFor="atom-dipole-toggle">
              Magnetic Dipole Field Loops
            </label>
            <input
              id="atom-dipole-toggle"
              type="checkbox"
              checked={atomShowDipoleLines}
              onChange={toggleAtomShowDipoleLines}
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
          <AtomWaveViewport />
        </div>

        <section className="experiment-bottom-panel" aria-label="Spectral Lines and Standing-Wave Comparison">
          <div className="playback-bar">
            <div className="playback-controls">
              <h2 className="panel-heading">Hydrogen Standing-Wave Transitions (Spectrum Lines)</h2>
              <label className="field-label" htmlFor="atom-isotope-select">
                Isotope
              </label>
              <select
                id="atom-isotope-select"
                aria-label="Hydrogen isotope for spectral shift"
                className="compact-select"
                value={atomIsotopeId}
                onChange={(e) => setAtomIsotopeId(e.target.value as HydrogenIsotopeId)}
              >
                {HYDROGEN_ISOTOPES.map((iso) => (
                  <option key={iso.id} value={iso.id}>
                    {iso.label}
                  </option>
                ))}
              </select>

              <label className="field-label" htmlFor="atom-upper-n">
                Upper n
              </label>
              <select
                id="atom-upper-n"
                className="compact-select"
                value={transition.nUpper}
                onChange={(e) =>
                  setAtomTransitionLevels(Number(e.target.value), transition.nLower)
                }
              >
                {[2, 3, 4, 5, 6]
                  .filter((n) => n > transition.nLower)
                  .map((n) => (
                    <option key={n} value={n}>
                      n={n}
                    </option>
                  ))}
              </select>

              <label className="field-label" htmlFor="atom-lower-n">
                Lower n
              </label>
              <select
                id="atom-lower-n"
                className="compact-select"
                value={transition.nLower}
                onChange={(e) =>
                  setAtomTransitionLevels(
                    Math.max(Number(e.target.value) + 1, transition.nUpper),
                    Number(e.target.value),
                  )
                }
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    n={n}
                  </option>
                ))}
              </select>
            </div>

            <div className="playback-exports">
              <span
                className="atom-swatch-pill"
                style={{ borderColor: transition.swatchHex, color: transition.swatchHex }}
              >
                ● {transition.wavelengthNm.toFixed(3)} nm ({transition.bandLabel})
              </span>
            </div>
          </div>

          <div className="observables-grid">
            <div className="observables-stats">
              <div className="stat-card">
                <span className="field-label">Photon Energy ΔE</span>
                <span className="stat-val mono">{transition.deltaEnergyEv.toFixed(4)} eV</span>
              </div>
              <div className="stat-card">
                <span className="field-label">Wavelength λ (vacuum)</span>
                <span className="stat-val mono">{transition.wavelengthNm.toFixed(3)} nm</span>
              </div>
              <div className="stat-card">
                <span className="field-label">Neutron Shift vs ¹H</span>
                <span className="stat-val mono">
                  {transition.shiftFromProtiumNm === 0
                    ? '0.000 nm (ref)'
                    : `${transition.shiftFromProtiumNm.toFixed(4)} nm (${(transition.shiftFromProtiumNm * 1000).toFixed(1)} pm)`}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Spectral Series</span>
                <span className="stat-val">
                  {transition.seriesName} (n={transition.nUpper} → {transition.nLower})
                </span>
              </div>
            </div>

            <div className="observables-visual">
              <p className="small-text" style={{ margin: '3px 0' }}>
                <strong>Why neutrons shift spectrum lines (Chapter 12 test):</strong> Switching{' '}
                <strong>¹H → ²H (Deuterium)</strong> adds 1 neutron, reducing nuclear wobble via
                the center-of-mass reduced mass (μ = mₑM/(mₑ+M)) and shifting H-α by{' '}
                <code>−0.1786 nm</code>. Standard quantum mechanics predicts this without needing
                hidden nuclear-EM geometry.
              </p>
              <p className="small-text muted" style={{ margin: 0 }}>
                <strong>{LITHIUM_ISOTOPE_SHIFT_NOTE.transition}:</strong>{' '}
                {LITHIUM_ISOTOPE_SHIFT_NOTE.explanation}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
