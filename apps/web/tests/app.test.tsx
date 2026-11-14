import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/App';
import { useLabStore } from '../src/state/useLabStore';

describe('MatterLab Web Application', () => {
  beforeEach(() => {
    useLabStore.getState().loadExample('water');
    useLabStore.getState().setWorkspaceTab('molecule');
    useLabStore.getState().setRepresentation('ball-and-stick');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders water reference, scale notice, and element palette on startup', () => {
    render(<App />);

    expect(screen.getByText('MatterLab')).toBeInTheDocument();
    expect(screen.getByText('H2O')).toBeInTheDocument();
    expect(screen.getByText(/Visual representation — not to scale/i)).toBeInTheDocument();
    expect(screen.getByText(/WebGL2 3D Viewport Unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('valid-provisional')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^6 C Carbon$/i })).toBeInTheDocument();
  });

  it('supports keyboard-only atom building, bond creation, undo/redo, and save/open round-trip', () => {
    const store = useLabStore.getState();
    store.resetToEmptyScene();

    const oId = store.addAtom('O', [0, 0, 0]);
    const h1Id = store.addAtom('H', [0.757, 0.586, 0]);
    const h2Id = store.addAtom('H', [-0.757, 0.586, 0]);
    store.createOrUpdateBond(oId, h1Id, 1);
    store.createOrUpdateBond(oId, h2Id, 1);

    expect(useLabStore.getState().molecule.atoms).toHaveLength(3);
    expect(useLabStore.getState().molecule.bonds).toHaveLength(2);
    expect(useLabStore.getState().validation.status).toBe('valid-provisional');

    // Delete a bond, then undo and redo
    const firstBondId = useLabStore.getState().molecule.bonds[0]!.id;
    useLabStore.getState().deleteBond(firstBondId);
    expect(useLabStore.getState().molecule.bonds).toHaveLength(1);
    expect(useLabStore.getState().validation.status).toBe('incomplete-draft');

    useLabStore.getState().undo();
    expect(useLabStore.getState().molecule.bonds).toHaveLength(2);

    useLabStore.getState().redo();
    expect(useLabStore.getState().molecule.bonds).toHaveLength(1);

    useLabStore.getState().undo();
    expect(useLabStore.getState().molecule.bonds).toHaveLength(2);

    // Export and re-import JSON preserving coordinates and connectivity
    const savedJson = useLabStore.getState().exportProjectJson();
    useLabStore.getState().resetToEmptyScene();
    expect(useLabStore.getState().molecule.atoms).toHaveLength(0);

    const ok = useLabStore.getState().importProjectJson(savedJson);
    expect(ok).toBe(true);
    expect(useLabStore.getState().molecule.atoms).toHaveLength(3);
    expect(useLabStore.getState().molecule.bonds).toHaveLength(2);

    // Reject corrupt file without replacing open project
    const badOk = useLabStore.getState().importProjectJson('{"schemaVersion":"invalid"}');
    expect(badOk).toBe(false);
    expect(useLabStore.getState().molecule.atoms).toHaveLength(3);
    expect(useLabStore.getState().statusBanner?.kind).toBe('error');
  });

  it('switches representation and honestly marks deferred workspaces', () => {
    render(<App />);

    const select = screen.getByLabelText('Visual representation');
    fireEvent.change(select, { target: { value: 'space-filling' } });
    expect(useLabStore.getState().representation).toBe('space-filling');

    fireEvent.click(screen.getByRole('button', { name: /^Atom\s+Deferred$/i }));
    expect(screen.getByText(/Atom & Orbital Explorer/i)).toBeInTheDocument();
    expect(screen.getByText(/Deferred from MVP/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Return to Molecule Editor/i }));
    expect(screen.getByText('H2O')).toBeInTheDocument();
  });
});
