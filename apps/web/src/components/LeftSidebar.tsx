import React from 'react';
import { Link2, MousePointer2, Plus, PlusCircle, Trash2 } from 'lucide-react';
import {
  type BondOrder,
  EXAMPLE_MOLECULES,
  MVP_ELEMENTS,
  computeBondLengthAngstrom,
} from '@matterlab/domain';
import { useLabStore } from '../state/useLabStore';

interface LeftSidebarProps {
  onRequestProtectedAction: (title: string, message: string, action: () => void) => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  onRequestProtectedAction,
}) => {
  const activeTool = useLabStore((s) => s.activeTool);
  const activeElement = useLabStore((s) => s.activeElement);
  const activeBondOrder = useLabStore((s) => s.activeBondOrder);
  const colorPalette = useLabStore((s) => s.colorPalette);
  const molecule = useLabStore((s) => s.molecule);
  const selectedAtomIds = useLabStore((s) => s.selectedAtomIds);
  const selectedBondId = useLabStore((s) => s.selectedBondId);

  const setActiveTool = useLabStore((s) => s.setActiveTool);
  const setActiveElement = useLabStore((s) => s.setActiveElement);
  const setActiveBondOrder = useLabStore((s) => s.setActiveBondOrder);
  const addAtom = useLabStore((s) => s.addAtom);
  const selectAtom = useLabStore((s) => s.selectAtom);
  const selectBond = useLabStore((s) => s.selectBond);
  const createOrUpdateBond = useLabStore((s) => s.createOrUpdateBond);
  const deleteSelected = useLabStore((s) => s.deleteSelected);
  const loadExample = useLabStore((s) => s.loadExample);

  const atomById = new Map(molecule.atoms.map((a) => [a.id, a]));

  const handleKeyboardAddAtom = () => {
    const idx = molecule.atoms.length;
    const angle = idx * 0.85;
    const radius = idx === 0 ? 0 : 1.4;
    addAtom(activeElement, [
      Number((Math.cos(angle) * radius).toFixed(3)),
      0,
      Number((Math.sin(angle) * radius).toFixed(3)),
    ]);
  };

  const canBondSelectedPair =
    selectedAtomIds.length === 2 && selectedAtomIds[0] !== selectedAtomIds[1];

  return (
    <aside className="sidebar sidebar-left" aria-label="Creation Tools and Structure Tree">
      <section className="panel-section">
        <h2 className="panel-heading">Tools</h2>
        <div className="tool-grid" role="group" aria-label="Editor Mode">
          <button
            type="button"
            className={`tool-btn ${activeTool === 'select' ? 'is-active' : ''}`}
            onClick={() => setActiveTool('select')}
            aria-pressed={activeTool === 'select'}
          >
            <MousePointer2 size={14} aria-hidden="true" />
            <span>Select / Move</span>
          </button>
          <button
            type="button"
            className={`tool-btn ${activeTool === 'place-atom' ? 'is-active' : ''}`}
            onClick={() => setActiveTool('place-atom')}
            aria-pressed={activeTool === 'place-atom'}
          >
            <PlusCircle size={14} aria-hidden="true" />
            <span>Place Atom</span>
          </button>
          <button
            type="button"
            className={`tool-btn ${activeTool === 'bond' ? 'is-active' : ''}`}
            onClick={() => setActiveTool('bond')}
            aria-pressed={activeTool === 'bond'}
          >
            <Link2 size={14} aria-hidden="true" />
            <span>Create Bond</span>
          </button>
        </div>

        <div className="bond-order-row">
          <span className="field-label">Bond order</span>
          <div className="segmented" role="group" aria-label="Bond order">
            {(
              [
                [1, '1'],
                [2, '2'],
                [3, '3'],
                ['aromatic', 'Ar'],
              ] as Array<[BondOrder, string]>
            ).map(([order, label]) => (
              <button
                key={String(order)}
                type="button"
                className={`seg-btn ${activeBondOrder === order ? 'is-active' : ''}`}
                onClick={() => setActiveBondOrder(order)}
                aria-pressed={activeBondOrder === order}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel-section">
        <div className="panel-heading-row">
          <h2 className="panel-heading">Element Palette</h2>
          <span className="badge badge-muted">MVP 10</span>
        </div>
        <div className="element-grid" role="group" aria-label="Approved MVP Elements">
          {MVP_ELEMENTS.map((el) => {
            const swatch =
              colorPalette === 'colorblind' ? el.colorblindColorHex : el.cpkColorHex;
            const isActive = activeElement === el.symbol;
            return (
              <button
                key={el.symbol}
                type="button"
                className={`element-tile ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveElement(el.symbol);
                  setActiveTool('place-atom');
                }}
                aria-pressed={isActive}
                title={`${el.name} (Z=${el.atomicNumber}, ${el.standardAtomicWeightU} u)`}
              >
                <span
                  className="element-swatch"
                  style={{ backgroundColor: swatch }}
                  aria-hidden="true"
                />
                <span className="element-z">{el.atomicNumber}</span>
                <span className="element-symbol">{el.symbol}</span>
                <span className="element-name">{el.name}</span>
              </button>
            );
          })}
        </div>
        <div className="keyboard-add-row">
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={handleKeyboardAddAtom}
          >
            <Plus size={14} aria-hidden="true" />
            <span>Add {activeElement} Atom (Keyboard)</span>
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h2 className="panel-heading">Curated Examples</h2>
        <div className="example-list">
          {EXAMPLE_MOLECULES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="example-btn"
              onClick={() =>
                onRequestProtectedAction(
                  `Load ${ex.title}`,
                  `You have unsaved edits. Loading ${ex.title} (${ex.formulaLabel}) will replace your current structure.`,
                  () => loadExample(ex.id),
                )
              }
              title={ex.description}
            >
              <span className="example-title">{ex.title}</span>
              <span className="example-formula">{ex.formulaLabel}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section panel-section-grow">
        <div className="panel-heading-row">
          <h2 className="panel-heading">Object Tree</h2>
          <div className="tree-actions">
            {canBondSelectedPair && (
              <button
                type="button"
                className="btn btn-xs btn-secondary"
                onClick={() =>
                  createOrUpdateBond(
                    selectedAtomIds[0]!,
                    selectedAtomIds[1]!,
                    activeBondOrder,
                  )
                }
                title="Bond the two selected atoms"
              >
                Bond Pair
              </button>
            )}
            {(selectedAtomIds.length > 0 || selectedBondId) && (
              <button
                type="button"
                className="btn btn-xs btn-danger-subtle"
                onClick={deleteSelected}
                aria-label="Delete selected object"
                title="Delete selected (Del)"
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="object-tree" role="tree" aria-label="Atoms and bonds">
          {molecule.atoms.length === 0 ? (
            <p className="empty-tree-msg">No atoms in scene.</p>
          ) : (
            <>
              <div className="tree-group-label">Atoms ({molecule.atoms.length})</div>
              {molecule.atoms.map((atom) => {
                const isSelected = selectedAtomIds.includes(atom.id);
                return (
                  <button
                    key={atom.id}
                    type="button"
                    role="treeitem"
                    aria-selected={isSelected}
                    className={`tree-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={(e) => selectAtom(atom.id, e.shiftKey)}
                  >
                    <span className="tree-item-main">
                      {atom.id} · {atom.element}
                      {atom.isotope ? `-${atom.isotope}` : ''}
                      {atom.formalCharge !== 0
                        ? ` (${atom.formalCharge > 0 ? `+${atom.formalCharge}` : atom.formalCharge})`
                        : ''}
                    </span>
                    <span className="tree-item-sub">
                      {atom.positionAngstrom.map((v) => v.toFixed(2)).join(', ')} Å
                    </span>
                  </button>
                );
              })}
              <div className="tree-group-label">Bonds ({molecule.bonds.length})</div>
              {molecule.bonds.map((bond) => {
                const a = atomById.get(bond.atomA);
                const b = atomById.get(bond.atomB);
                const dist =
                  a && b ? `${computeBondLengthAngstrom(a, b).toFixed(2)} Å` : '—';
                const isSelected = selectedBondId === bond.id;
                return (
                  <button
                    key={bond.id}
                    type="button"
                    role="treeitem"
                    aria-selected={isSelected}
                    className={`tree-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => selectBond(bond.id)}
                  >
                    <span className="tree-item-main">
                      {bond.atomA} — {bond.atomB} ({bond.order === 'aromatic' ? 'Ar' : `×${bond.order}`})
                    </span>
                    <span className="tree-item-sub">{dist}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </section>
    </aside>
  );
};
