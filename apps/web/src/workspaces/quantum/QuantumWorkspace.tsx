import React from 'react';
import { Atom as AtomIcon, Download, Play, Square } from 'lucide-react';
import { computeFormula } from '@matterlab/domain';
import { LabSceneViewport } from '../../scene/LabSceneViewport';
import { type QuantumFieldOverlayMode, useLabStore } from '../../state/useLabStore';

export const QuantumWorkspace: React.FC = () => {
  const molecule = useLabStore((s) => s.molecule);
  const serviceStatus = useLabStore((s) => s.serviceStatus);
  const quantumPresets = useLabStore((s) => s.quantumPresets);
  const quantumConfig = useLabStore((s) => s.quantumConfig);
  const activeQuantumJob = useLabStore((s) => s.activeQuantumJob);
  const activeQuantumResults = useLabStore((s) => s.activeQuantumResults);
  const quantumFieldOverlay = useLabStore((s) => s.quantumFieldOverlay);

  const selectQuantumPreset = useLabStore((s) => s.selectQuantumPreset);
  const setQuantumComputeFields = useLabStore((s) => s.setQuantumComputeFields);
  const setQuantumFieldOverlay = useLabStore((s) => s.setQuantumFieldOverlay);
  const runQuantumCalculation = useLabStore((s) => s.runQuantumCalculation);
  const cancelActiveQuantumJob = useLabStore((s) => s.cancelActiveQuantumJob);

  const selectedPreset =
    quantumPresets.find((p) => p.id === quantumConfig.modelPresetId) ??
    quantumPresets[0];

  const isRunning =
    activeQuantumJob?.status === 'queued' ||
    activeQuantumJob?.status === 'running' ||
    activeQuantumJob?.status === 'cancelling';

  const exportQuantumJson = () => {
    if (!activeQuantumResults) return;
    const blob = new Blob([JSON.stringify(activeQuantumResults, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeQuantumResults.jobId}-quantum.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="experiment-shell">
      <aside className="sidebar sidebar-left experiment-sidebar" aria-label="Quantum Chemistry Configuration">
        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">Quantum System</h2>
            <span className="badge badge-muted mono">{computeFormula(molecule)}</span>
          </div>
          <p className="muted small-text">
            Active structure: <strong>{molecule.name}</strong> ({molecule.atoms.length} atoms,{' '}
            charge {molecule.netCharge} e, closed-shell singlet, rev{' '}
            <code>{molecule.revisionId}</code>).
          </p>
        </section>

        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">PySCF Method &amp; Basis</h2>
            <span className={`badge ${serviceStatus.pyscfAvailable ? 'badge-ok' : 'badge-warn'}`}>
              {serviceStatus.pyscfAvailable
                ? `PySCF ${serviceStatus.pyscfVersion ?? ''}`.trim()
                : 'Offline'}
            </span>
          </div>

          <label className="field-label" htmlFor="qc-preset-select">
            Level of Theory Preset
          </label>
          <select
            id="qc-preset-select"
            className="inspector-input full-width"
            value={quantumConfig.modelPresetId}
            disabled={!serviceStatus.pyscfAvailable || isRunning}
            onChange={(e) => selectQuantumPreset(e.target.value)}
          >
            {quantumPresets.length === 0 ? (
              <option value={quantumConfig.modelPresetId}>
                Connect Science API to load PySCF presets
              </option>
            ) : (
              quantumPresets.map((p) => (
                <option key={`${p.id}-${p.version}`} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>

          {selectedPreset && (
            <div className="preset-meta-grid">
              <span className="field-label">Method</span>
              <span className="inspector-value mono">{selectedPreset.method}</span>
              <span className="field-label">Basis Set</span>
              <span className="inspector-value mono">{selectedPreset.basisSet}</span>
              <span className="field-label">Atom Limit</span>
              <span className="inspector-value mono">{selectedPreset.maxAtoms} atoms</span>
              <span className="field-label">Max SCF</span>
              <span className="inspector-value mono">{selectedPreset.maxScfCycles} cycles</span>
            </div>
          )}

          <div className="qc-checkbox-row">
            <label className="field-label" htmlFor="qc-fields-checkbox">
              Compute 3D HOMO &amp; Electron Density Grids
            </label>
            <input
              id="qc-fields-checkbox"
              type="checkbox"
              checked={quantumConfig.computeFields}
              disabled={isRunning}
              onChange={(e) => setQuantumComputeFields(e.target.checked)}
            />
          </div>

          <div className="exp-action-stack">
            <button
              type="button"
              className="btn btn-primary btn-full"
              disabled={!serviceStatus.pyscfAvailable || isRunning}
              onClick={() => void runQuantumCalculation()}
            >
              <Play size={14} aria-hidden="true" />
              <span>{isRunning ? 'SCF Running…' : 'Run PySCF Single-Point'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-full"
              disabled={!isRunning || activeQuantumJob?.status === 'cancelling'}
              onClick={() => void cancelActiveQuantumJob()}
            >
              <Square size={13} aria-hidden="true" />
              <span>Cancel Calculation</span>
            </button>
          </div>
        </section>

        <section className="panel-section">
          <h2 className="panel-heading">3D Volumetric Field Overlay</h2>
          <label className="field-label" htmlFor="qc-overlay-select">
            Displayed Scalar Quantity
          </label>
          <select
            id="qc-overlay-select"
            className="inspector-input full-width"
            value={quantumFieldOverlay}
            onChange={(e) =>
              setQuantumFieldOverlay(e.target.value as QuantumFieldOverlayMode)
            }
          >
            <option value="homo-amplitude-phase">
              HOMO Wavefunction Amplitude &amp; Phase (bohr⁻³/²)
            </option>
            <option value="electron-density">
              Total Electron Density ρ (e/bohr³)
            </option>
            <option value="none">None (Structure Only)</option>
          </select>
          <p className="scientific-note">
            Orbital amplitude/phase and total electron density are distinct physical quantities and
            are never solid material shells.
          </p>
        </section>

        {selectedPreset && (
          <section className="panel-section">
            <h2 className="panel-heading">Method Assumptions &amp; Limits</h2>
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

        <section className="experiment-bottom-panel" aria-label="Quantum Chemistry Results">
          <div className="playback-bar">
            <div className="playback-controls">
              <AtomIcon size={14} aria-hidden="true" />
              <span className="panel-heading">Electronic Structure Results</span>
              {activeQuantumResults && (
                <span
                  className={`badge ${activeQuantumResults.converged ? 'badge-ok' : 'badge-warn'}`}
                >
                  {activeQuantumResults.converged ? 'SCF Converged' : 'Not Converged'}
                </span>
              )}
            </div>

            <div className="playback-exports">
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                disabled={!activeQuantumResults}
                onClick={exportQuantumJson}
              >
                <Download size={12} aria-hidden="true" />
                <span>Export Quantum JSON</span>
              </button>
            </div>
          </div>

          <div className="observables-grid">
            <div className="observables-stats">
              <div className="stat-card">
                <span className="field-label">Status / SCF Cycles</span>
                <span className="mono stat-val">
                  {activeQuantumJob
                    ? `${activeQuantumJob.status} (${activeQuantumJob.scfCyclesCompleted}/${activeQuantumJob.maxScfCycles})`
                    : 'idle'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Method / Basis</span>
                <span className="mono stat-val">
                  {activeQuantumResults
                    ? `${activeQuantumResults.method} / ${activeQuantumResults.basisSet}`
                    : selectedPreset
                      ? `${selectedPreset.method} / ${selectedPreset.basisSet}`
                      : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Total Energy (E_h)</span>
                <span className="mono stat-val">
                  {activeQuantumResults?.totalEnergyHartree !== null &&
                  activeQuantumResults?.totalEnergyHartree !== undefined
                    ? `${activeQuantumResults.totalEnergyHartree.toFixed(6)} Eh`
                    : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Total Energy (molar)</span>
                <span className="mono stat-val">
                  {activeQuantumResults?.totalEnergyKjMol !== null &&
                  activeQuantumResults?.totalEnergyKjMol !== undefined
                    ? `${activeQuantumResults.totalEnergyKjMol.toFixed(2)} kJ/mol`
                    : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">HOMO–LUMO Gap</span>
                <span className="mono stat-val">
                  {activeQuantumResults?.homoLumoGapEv !== null &&
                  activeQuantumResults?.homoLumoGapEv !== undefined
                    ? `${activeQuantumResults.homoLumoGapEv.toFixed(3)} eV`
                    : '—'}
                </span>
              </div>
              <div className="stat-card">
                <span className="field-label">Dipole Moment</span>
                <span className="mono stat-val">
                  {activeQuantumResults?.dipoleMagnitudeDebye !== null &&
                  activeQuantumResults?.dipoleMagnitudeDebye !== undefined
                    ? `${activeQuantumResults.dipoleMagnitudeDebye.toFixed(4)} Debye`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="observables-visual">
              {!activeQuantumResults || activeQuantumResults.orbitals.length === 0 ? (
                <div className="empty-chart-msg">
                  Run a PySCF single-point calculation on a closed-shell molecule (e.g. Water,
                  Methane, CO₂, or Benzene) to inspect SCF convergence, orbital energies, dipole
                  moment, and 3D HOMO / electron density grids.
                </div>
              ) : (
                <div className="table-scroll" role="region" aria-label="Molecular Orbital Energies">
                  <table className="obs-table">
                    <thead>
                      <tr>
                        <th>Orbital</th>
                        <th>Occ</th>
                        <th>Energy (Eh)</th>
                        <th>Energy (eV)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeQuantumResults.orbitals.map((orb) => (
                        <tr
                          key={orb.index}
                          className={
                            orb.label === 'HOMO' || orb.label === 'LUMO' ? 'is-current' : ''
                          }
                        >
                          <td>{orb.label}</td>
                          <td>{orb.occupancy.toFixed(1)}</td>
                          <td>{orb.energyHartree.toFixed(6)}</td>
                          <td>{orb.energyEv.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
