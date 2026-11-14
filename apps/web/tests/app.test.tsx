import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('disables RDKit/MOL actions when science service is offline while keeping editing active', async () => {
    render(<App />);
    await waitFor(() => {
      expect(useLabStore.getState().serviceStatus.state).toBe('offline');
    });

    expect(screen.getByRole('button', { name: /RDKit Validate/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Generate Conformer/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Import MOL/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Export MOL/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Save$/i })).toBeEnabled();
  });

  it('runs RDKit validation, marks stale on edit, and labels generated conformers honestly', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/capabilities')) {
        return new Response(
          JSON.stringify({
            api_version: '0.1.0',
            adapters: [
              {
                adapter: 'rdkit',
                available: true,
                version: '2026.9.2',
                supported_elements: ['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I'],
                supported_operations: ['validate_structure', 'conformer_etkdgv3'],
                limitations: [],
              },
              {
                adapter: 'openmm',
                available: false,
                version: null,
                supported_elements: [],
                supported_operations: [],
                limitations: [],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/molecules/validate')) {
        return new Response(
          JSON.stringify({
            structure_revision_id: useLabStore.getState().molecule.revisionId,
            status: 'valid-rdkit',
            ready_for_conformer_generation: true,
            ready_for_md: false,
            engine: 'RDKit',
            engine_version: '2026.9.2',
            assumptions: ['Explicit H only'],
            limitations: ['Topology check only'],
            descriptors: {
              explicit_formula: 'H2O',
              canonical_smiles: '[H]O[H]',
              inchikey: 'XLYOFNOQVPJJNP-UHFFFAOYSA-N',
              atom_count: 3,
              heavy_atom_count: 1,
              bond_count: 2,
              molecular_mass_u: 18.015,
              exact_mass_u: 18.010565,
              rotatable_bond_count: 0,
              ring_count: 0,
              aromatic_atom_count: 0,
              hbd_count: 1,
              hba_count: 1,
              tpsa_angstrom2: 20.23,
            },
            diagnostics: [
              {
                severity: 'info',
                code: 'RDKIT_VALIDATION_PASSED',
                message: 'Validated H2O with RDKit 2026.9.2.',
                field_path: null,
                atom_ids: [],
                bond_ids: [],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/molecules/conformers')) {
        return new Response(
          JSON.stringify({
            source_revision_id: useLabStore.getState().molecule.revisionId,
            method: 'RDKit ETKDGv3 distance-geometry embedding',
            engine: 'RDKit',
            engine_version: '2026.9.2',
            random_seed: 42,
            energy_minimized: false,
            geometry_status: 'rdkit-conformer',
            distance_unit: 'angstrom',
            assumptions: [],
            limitations: ['Not experimentally determined'],
            positions_angstrom: {
              O1: [0, 0.38, 0],
              H1: [0.8, -0.19, 0],
              H2: [-0.8, -0.19, 0],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<App />);
      await waitFor(() => {
        expect(useLabStore.getState().serviceStatus.rdkitAvailable).toBe(true);
      });

      fireEvent.click(screen.getByRole('button', { name: /^Validate$/i }));
      await waitFor(() => {
        expect(screen.getByText('valid-rdkit')).toBeInTheDocument();
        expect(screen.getByText('[H]O[H]')).toBeInTheDocument();
      });

      // Editing creates a new revision and marks previous RDKit result stale
      useLabStore.getState().moveAtom('H1', [0.8, 0.6, 0]);
      await waitFor(() => {
        expect(screen.getByText(/re-validate to inspect current revision/i)).toBeInTheDocument();
      });

      // Conformer generation updates provenance and geometry status
      await useLabStore.getState().runRdkitConformer(42);
      expect(useLabStore.getState().molecule.provenance.geometryStatus).toBe('rdkit-conformer');
      expect(useLabStore.getState().lastConformerMeta?.energyMinimized).toBe(false);
    } finally {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('Offline in test environment'))),
      );
    }
  });
});
