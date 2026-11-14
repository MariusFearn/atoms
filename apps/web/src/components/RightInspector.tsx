import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Info,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  type BondOrder,
  DATASET_PROVENANCE,
  MVP_ELEMENTS,
  STATIC_EDITOR_MODEL,
  computeBondAngleDegrees,
  computeBondLengthAngstrom,
  computeFormula,
  computeMolecularMassU,
  getElementBySymbol,
} from '@matterlab/domain';
import { useLabStore } from '../state/useLabStore';

export const RightInspector: React.FC = () => {
  const molecule = useLabStore((s) => s.molecule);
  const validation = useLabStore((s) => s.validation);
  const rdkitReport = useLabStore((s) => s.rdkitReport);
  const lastConformerMeta = useLabStore((s) => s.lastConformerMeta);
  const serviceStatus = useLabStore((s) => s.serviceStatus);
  const isScienceBusy = useLabStore((s) => s.isScienceBusy);
  const selectedAtomIds = useLabStore((s) => s.selectedAtomIds);
  const selectedBondId = useLabStore((s) => s.selectedBondId);

  const moveAtom = useLabStore((s) => s.moveAtom);
  const updateAtomProperties = useLabStore((s) => s.updateAtomProperties);
  const deleteAtom = useLabStore((s) => s.deleteAtom);
  const createOrUpdateBond = useLabStore((s) => s.createOrUpdateBond);
  const deleteBond = useLabStore((s) => s.deleteBond);
  const runRdkitValidation = useLabStore((s) => s.runRdkitValidation);
  const runRdkitConformer = useLabStore((s) => s.runRdkitConformer);

  const selectedAtom =
    selectedAtomIds.length === 1
      ? molecule.atoms.find((a) => a.id === selectedAtomIds[0])
      : undefined;
  const selectedAtomElement = selectedAtom
    ? getElementBySymbol(selectedAtom.element)
    : undefined;

  const selectedBond = selectedBondId
    ? molecule.bonds.find((b) => b.id === selectedBondId)
    : undefined;
  const bondAtomA = selectedBond
    ? molecule.atoms.find((a) => a.id === selectedBond.atomA)
    : undefined;
  const bondAtomB = selectedBond
    ? molecule.atoms.find((a) => a.id === selectedBond.atomB)
    : undefined;

  const formula = computeFormula(molecule);
  const massU = computeMolecularMassU(molecule);

  // Compute local bond angles if selected atom has >= 2 neighbors
  const selectedAtomNeighbors = selectedAtom
    ? molecule.bonds
        .filter((b) => b.atomA === selectedAtom.id || b.atomB === selectedAtom.id)
        .map((b) => {
          const otherId = b.atomA === selectedAtom.id ? b.atomB : b.atomA;
          return molecule.atoms.find((a) => a.id === otherId);
        })
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
    : [];

  const validationIcon =
    validation.status === 'valid-provisional' ? (
      <CheckCircle2 size={15} className="status-ok" aria-hidden="true" />
    ) : validation.status === 'incomplete-draft' ? (
      <AlertTriangle size={15} className="status-warn" aria-hidden="true" />
    ) : (
      <XCircle size={15} className="status-err" aria-hidden="true" />
    );

  return (
    <aside className="sidebar sidebar-right" aria-label="Scientific Inspector">
      {selectedAtom && (
        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">Atom · {selectedAtom.id}</h2>
            <button
              type="button"
              className="btn btn-xs btn-danger-subtle"
              onClick={() => deleteAtom(selectedAtom.id)}
              aria-label={`Delete atom ${selectedAtom.id}`}
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>

          <div className="inspector-grid">
            <label className="field-label" htmlFor="atom-element-select">
              Element
            </label>
            <select
              id="atom-element-select"
              className="inspector-input"
              value={selectedAtom.element}
              onChange={(e) =>
                updateAtomProperties(selectedAtom.id, { element: e.target.value })
              }
            >
              {MVP_ELEMENTS.map((el) => (
                <option key={el.symbol} value={el.symbol}>
                  {el.symbol} — {el.name} (Z={el.atomicNumber})
                </option>
              ))}
            </select>

            <span className="field-label">Atomic Number (Z)</span>
            <span className="inspector-value">
              {selectedAtomElement?.atomicNumber ?? 'Unsupported'}
            </span>

            <span className="field-label">Config</span>
            <span className="inspector-value mono">
              {selectedAtomElement?.electronConfiguration ?? '—'}
            </span>

            <label className="field-label" htmlFor="atom-isotope-select">
              Isotope
            </label>
            <select
              id="atom-isotope-select"
              className="inspector-input"
              value={selectedAtom.isotope ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                updateAtomProperties(selectedAtom.id, {
                  isotope: raw === '' ? undefined : Number(raw),
                });
              }}
            >
              <option value="">
                Standard weight ({selectedAtomElement?.standardAtomicWeightU ?? '—'} u)
              </option>
              {selectedAtomElement?.isotopes.map((iso) => (
                <option key={iso.massNumber} value={iso.massNumber}>
                  {iso.label} ({iso.atomicMassU.toFixed(4)} u)
                </option>
              ))}
            </select>

            <label className="field-label" htmlFor="atom-charge-input">
              Formal Charge (e)
            </label>
            <input
              id="atom-charge-input"
              className="inspector-input mono"
              type="number"
              step={1}
              min={-4}
              max={4}
              value={selectedAtom.formalCharge}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(parsed)) {
                  updateAtomProperties(selectedAtom.id, { formalCharge: parsed });
                }
              }}
            />

            <span className="field-label">Aromatic</span>
            <span className="inspector-value">
              {selectedAtom.aromatic ? 'Yes (aromatic bond)' : 'No'}
            </span>
          </div>

          <div className="coord-block">
            <div className="field-label">Coordinates (Å)</div>
            <div className="coord-row">
              {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                <label key={axis} className="coord-field">
                  <span>{axis}</span>
                  <input
                    type="number"
                    step={0.05}
                    value={selectedAtom.positionAngstrom[idx]}
                    aria-label={`${selectedAtom.id} ${axis} coordinate in Angstrom`}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isFinite(val)) return;
                      const next = [...selectedAtom.positionAngstrom] as [
                        number,
                        number,
                        number,
                      ];
                      next[idx] = val;
                      moveAtom(selectedAtom.id, next, true);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          {selectedAtomNeighbors.length >= 2 && (
            <div className="angles-box">
              <div className="field-label">Incident Angles</div>
              {selectedAtomNeighbors.slice(0, 3).map((n1, i) =>
                selectedAtomNeighbors.slice(i + 1, 4).map((n2) => {
                  const deg = computeBondAngleDegrees(selectedAtom, n1, n2);
                  return (
                    <div key={`${n1.id}-${n2.id}`} className="angle-line">
                      <span>
                        {n1.id}–{selectedAtom.id}–{n2.id}
                      </span>
                      <span className="mono">
                        {deg !== null ? `${deg.toFixed(1)}°` : '—'}
                      </span>
                    </div>
                  );
                }),
              )}
            </div>
          )}
        </section>
      )}

      {selectedBond && bondAtomA && bondAtomB && (
        <section className="panel-section">
          <div className="panel-heading-row">
            <h2 className="panel-heading">
              Bond · {bondAtomA.id} — {bondAtomB.id}
            </h2>
            <button
              type="button"
              className="btn btn-xs btn-danger-subtle"
              onClick={() => deleteBond(selectedBond.id)}
              aria-label={`Delete bond ${selectedBond.id}`}
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>
          <div className="inspector-grid">
            <label className="field-label" htmlFor="bond-order-select">
              Bond Order
            </label>
            <select
              id="bond-order-select"
              className="inspector-input"
              value={String(selectedBond.order)}
              onChange={(e) => {
                const v = e.target.value;
                const order: BondOrder =
                  v === 'aromatic' ? 'aromatic' : (Number(v) as 1 | 2 | 3);
                createOrUpdateBond(selectedBond.atomA, selectedBond.atomB, order);
              }}
            >
              <option value="1">1 — Single</option>
              <option value="2">2 — Double</option>
              <option value="3">3 — Triple</option>
              <option value="aromatic">Aromatic</option>
            </select>

            <span className="field-label">Distance</span>
            <span className="inspector-value mono">
              {computeBondLengthAngstrom(bondAtomA, bondAtomB).toFixed(4)} Å
            </span>
          </div>
          <p className="scientific-note">
            Chemical connectivity representation, not a literal rigid mechanical rod.
          </p>
        </section>
      )}

      {selectedAtomIds.length > 1 && (
        <section className="panel-section">
          <h2 className="panel-heading">Multi-Selection</h2>
          <p className="muted">
            {selectedAtomIds.length} atoms selected ({selectedAtomIds.join(', ')}).
            {selectedAtomIds.length === 2 &&
              ' Use "Bond Pair" in the Object Tree to connect them.'}
          </p>
        </section>
      )}

      <section className="panel-section">
        <h2 className="panel-heading">Molecule Summary</h2>
        <div className="inspector-grid">
          <span className="field-label">Formula (explicit)</span>
          <span className="inspector-value mono formula-value">{formula}</span>

          <span className="field-label">Mass</span>
          <span className="inspector-value mono">{massU.toFixed(4)} u</span>

          <span className="field-label">Net Charge</span>
          <span className="inspector-value mono">
            {molecule.netCharge > 0 ? `+${molecule.netCharge}` : molecule.netCharge} e
          </span>

          <span className="field-label">Atoms / Bonds</span>
          <span className="inspector-value mono">
            {molecule.atoms.length} / {molecule.bonds.length}
          </span>

          <span className="field-label">Revision</span>
          <span className="inspector-value mono">{molecule.revisionId}</span>

          <span className="field-label">Geometry Status</span>
          <span className="inspector-value mono">{molecule.provenance.geometryStatus}</span>

          <span className="field-label">Provenance</span>
          <span className="inspector-value">{molecule.provenance.summary}</span>
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-heading-row">
          <h2 className="panel-heading">RDKit Science Service</h2>
          <span
            className={`badge ${
              rdkitReport && rdkitReport.structureRevisionId === molecule.revisionId
                ? 'badge-ok'
                : 'badge-muted'
            }`}
          >
            {serviceStatus.rdkitAvailable
              ? `RDKit ${serviceStatus.rdkitVersion ?? ''}`.trim()
              : 'Offline'}
          </span>
        </div>

        <div className="rdkit-action-row">
          <button
            type="button"
            className="btn btn-xs btn-primary"
            disabled={!serviceStatus.rdkitAvailable || isScienceBusy}
            onClick={() => void runRdkitValidation()}
          >
            <FlaskConical size={12} aria-hidden="true" />
            <span>Validate</span>
          </button>
          <button
            type="button"
            className="btn btn-xs btn-secondary"
            disabled={!serviceStatus.rdkitAvailable || isScienceBusy}
            onClick={() => void runRdkitConformer()}
            title="Generate 3D conformer using RDKit ETKDGv3 (not energy-minimized)"
          >
            <Sparkles size={12} aria-hidden="true" />
            <span>Conformer (ETKDGv3)</span>
          </button>
        </div>

        {!serviceStatus.rdkitAvailable && (
          <p className="muted small-text">{serviceStatus.detail}</p>
        )}

        {rdkitReport && rdkitReport.structureRevisionId !== molecule.revisionId && (
          <p className="diag-warning small-text">
            Previous RDKit result was for revision <code>{rdkitReport.structureRevisionId}</code>;
            re-validate to inspect current revision <code>{molecule.revisionId}</code>.
          </p>
        )}

        {rdkitReport && rdkitReport.structureRevisionId === molecule.revisionId && (
          <div className="rdkit-report-box">
            <div className={`validation-status status-${rdkitReport.status === 'valid-rdkit' ? 'valid-provisional' : rdkitReport.status}`}>
              <span>{rdkitReport.status}</span>
            </div>
            {rdkitReport.descriptors && (
              <div className="inspector-grid">
                <span className="field-label">SMILES</span>
                <span className="inspector-value mono">
                  {rdkitReport.descriptors.canonicalSmiles ?? '—'}
                </span>
                <span className="field-label">InChIKey</span>
                <span className="inspector-value mono small-text">
                  {rdkitReport.descriptors.inchikey ?? '—'}
                </span>
                <span className="field-label">Exact Mass</span>
                <span className="inspector-value mono">
                  {rdkitReport.descriptors.exactMassU.toFixed(6)} u
                </span>
                <span className="field-label">Rings / Arom.</span>
                <span className="inspector-value mono">
                  {rdkitReport.descriptors.ringCount} / {rdkitReport.descriptors.aromaticAtomCount} atoms
                </span>
                <span className="field-label">HBD / HBA</span>
                <span className="inspector-value mono">
                  {rdkitReport.descriptors.hbdCount} / {rdkitReport.descriptors.hbaCount}
                </span>
                <span className="field-label">TPSA</span>
                <span className="inspector-value mono">
                  {rdkitReport.descriptors.tpsaAngstrom2.toFixed(2)} Å²
                </span>
              </div>
            )}
            <ul className="diagnostic-list">
              {rdkitReport.diagnostics.map((d, idx) => (
                <li key={`${d.code}-${idx}`} className={`diag-item diag-${d.severity}`}>
                  <strong>{d.code}:</strong> {d.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {lastConformerMeta && (
          <p className="scientific-note">
            Conformer: {lastConformerMeta.method} (seed={lastConformerMeta.randomSeed},
            energy_minimized={String(lastConformerMeta.energyMinimized)}).
          </p>
        )}
      </section>

      <section className="panel-section">
        <div className="panel-heading-row">
          <h2 className="panel-heading">Structure Validation</h2>
          <span className="badge badge-warn">Provisional</span>
        </div>
        <div className={`validation-status status-${validation.status}`}>
          {validationIcon}
          <span>{validation.status}</span>
        </div>
        <ul className="diagnostic-list">
          {validation.diagnostics.map((d, idx) => (
            <li key={`${d.code}-${idx}`} className={`diag-item diag-${d.severity}`}>
              <strong>{d.code}:</strong> {d.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-section">
        <div className="panel-heading-row">
          <h2 className="panel-heading">Model &amp; Limitations</h2>
          <Info size={14} className="muted-icon" aria-hidden="true" />
        </div>
        <p className="model-title">{STATIC_EDITOR_MODEL.name}</p>
        <p className="muted small-text">
          Visual representation — not to scale. Engine: {STATIC_EDITOR_MODEL.engine} (
          {STATIC_EDITOR_MODEL.engineVersion})
        </p>
        <ul className="limitation-list">
          {STATIC_EDITOR_MODEL.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="muted small-text">
          Data sources: {DATASET_PROVENANCE.atomicWeights}; {DATASET_PROVENANCE.covalentRadii};{' '}
          {DATASET_PROVENANCE.vdwRadii}.
        </p>
      </section>
    </aside>
  );
};
