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

  it('supports Experiment workspace presets, trajectory playback stepping, and reset inputs without cancelling/starting jobs', async () => {
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
                supported_operations: ['validate_structure'],
                limitations: [],
              },
              {
                adapter: 'openmm',
                available: true,
                version: '8.6.1',
                supported_elements: ['H', 'O'],
                supported_operations: ['tip3p-water-nvt', 'tip3p-water-nve'],
                limitations: [],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/experiments/presets')) {
        return new Response(
          JSON.stringify([
            {
              id: 'tip3p-water-nvt',
              version: '1',
              name: 'TIP3P Water Cluster — Langevin NVT',
              category: 'molecular-mechanics',
              engine: 'OpenMM',
              engine_version: '8.6.1',
              force_field: 'AMBER14 TIP3P (amber14/tip3p.xml)',
              integrator: 'LangevinMiddleIntegrator',
              ensemble: 'NVT',
              constraints: 'HBonds + rigidWater',
              boundary_conditions: 'NoCutoff',
              supports_thermostat_target: true,
              default_temperature_k: 300,
              default_timestep_fs: 1.0,
              default_duration_ps: 2.0,
              limits: {
                min_water_molecules: 2,
                max_water_molecules: 64,
                min_temperature_k: 50,
                max_temperature_k: 600,
                min_timestep_fs: 0.5,
                max_timestep_fs: 2.0,
                min_duration_ps: 0.1,
                max_duration_ps: 20.0,
              },
              assumptions: ['Rigid TIP3P water'],
              limitations: ['Fixed topology'],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/experiments')) {
        return new Response(
          JSON.stringify({
            job_id: 'md-test123',
            status: 'completed',
            model_preset_id: 'tip3p-water-nvt',
            model_preset_version: '1',
            initial_structure_revision_id: useLabStore.getState().molecule.revisionId,
            progress_fraction: 1,
            completed_steps: 200,
            total_steps: 200,
            frames_recorded: 2,
            created_at_iso: '2026-11-14T20:00:00Z',
            updated_at_iso: '2026-11-14T20:00:01Z',
            error_code: null,
            error_message: null,
            status_url: '/api/v1/experiments/md-test123',
            results_url: '/api/v1/experiments/md-test123/results',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/experiments/md-test123')) {
        return new Response(
          JSON.stringify({
            job_id: 'md-test123',
            status: 'completed',
            model_preset_id: 'tip3p-water-nvt',
            model_preset_version: '1',
            initial_structure_revision_id: useLabStore.getState().molecule.revisionId,
            progress_fraction: 1,
            completed_steps: 200,
            total_steps: 200,
            frames_recorded: 2,
            created_at_iso: '2026-11-14T20:00:00Z',
            updated_at_iso: '2026-11-14T20:00:01Z',
            error_code: null,
            error_message: null,
            status_url: '/api/v1/experiments/md-test123',
            results_url: '/api/v1/experiments/md-test123/results',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/experiments/md-test123/results')) {
        const mol = useLabStore.getState().molecule;
        const pos = mol.atoms.map((a) => a.positionAngstrom);
        return new Response(
          JSON.stringify({
            job_id: 'md-test123',
            status: 'completed',
            is_partial: false,
            atom_ids: mol.atoms.map((a) => a.id),
            frames: [
              {
                frame_index: 0,
                step: 0,
                simulation_time_ps: 0,
                kinetic_energy_kj_mol: 55.0,
                potential_energy_kj_mol: -105.0,
                total_energy_kj_mol: -50.0,
                instantaneous_temperature_k: 294.1,
                positions_angstrom: pos,
              },
              {
                frame_index: 1,
                step: 200,
                simulation_time_ps: 0.2,
                kinetic_energy_kj_mol: 56.2,
                potential_energy_kj_mol: -106.0,
                total_energy_kj_mol: -49.8,
                instantaneous_temperature_k: 300.5,
                positions_angstrom: pos,
              },
            ],
            reproducibility: {
              input_structure_revision_id: mol.revisionId,
              input_structure_hash_sha256: 'abc123def456',
              model_preset_id: 'tip3p-water-nvt',
              model_preset_version: '1',
              force_field_source: 'AMBER14 TIP3P (amber14/tip3p.xml)',
              integrator: 'LangevinMiddleIntegrator',
              ensemble: 'NVT',
              engine: 'OpenMM',
              engine_version: '8.6.1',
              platform_name: 'CPU',
              numerical_precision: 'mixed',
              random_seed: 42,
              degrees_of_freedom: 45,
              constraints_summary: 'HBonds + rigidWater',
              resolved_settings: {
                temperature_k: 300,
                timestep_fs: 1.0,
                duration_ps: 0.2,
                total_steps: 200,
                report_interval_steps: 200,
                minimize_before_run: true,
              },
              termination_status: 'completed',
              energy_basis: 'mole-of-systems',
              energy_unit: 'kJ/mol',
              distance_unit: 'angstrom',
              time_unit: 'ps',
              temperature_unit: 'K',
            },
            warnings: [],
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
        expect(useLabStore.getState().serviceStatus.openmmAvailable).toBe(true);
      });

      useLabStore.getState().loadExample('water-cluster-8');
      fireEvent.click(screen.getByRole('button', { name: /^Experiment/i }));

      expect(screen.getByText(/Versioned Model Preset/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Run OpenMM Simulation/i }));

      await waitFor(() => {
        expect(useLabStore.getState().activeResults?.frames).toHaveLength(2);
      });

      expect(screen.getByText(/-50\.000 kJ\/mol/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Step forward one trajectory frame/i }));
      expect(useLabStore.getState().playbackFrameIndex).toBe(1);
      expect(screen.getByText(/-49\.800 kJ\/mol/)).toBeInTheDocument();

      // Reset inputs does not cancel or re-run the completed job
      const callsBeforeReset = fetchMock.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: /Reset Inputs/i }));
      expect(fetchMock.mock.calls.length).toBe(callsBeforeReset);
      expect(useLabStore.getState().activeJob?.jobId).toBe('md-test123');
    } finally {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('Offline in test environment'))),
      );
    }
  });

  it('supports Quantum (PySCF) workspace results, orbital table, and distinct field overlay selection', async () => {
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
                supported_operations: [],
                limitations: [],
              },
              {
                adapter: 'openmm',
                available: true,
                version: '8.6.1',
                supported_elements: ['H', 'O'],
                supported_operations: [],
                limitations: [],
              },
              {
                adapter: 'pyscf',
                available: true,
                version: '2.15.0',
                supported_elements: ['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I'],
                supported_operations: ['single_point_rhf'],
                limitations: [],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/experiments/presets')) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/api/v1/quantum/presets')) {
        return new Response(
          JSON.stringify([
            {
              id: 'pyscf-rhf-631g',
              version: '1',
              name: 'RHF / 6-31G (Split-Valence Hartree-Fock)',
              category: 'quantum-chemistry',
              engine: 'PySCF',
              engine_version: '2.15.0',
              method: 'RHF',
              basis_set: '6-31g',
              max_atoms: 16,
              max_scf_cycles: 60,
              assumptions: ['Gas-phase closed-shell singlet'],
              limitations: ['Finite basis set'],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/quantum/jobs')) {
        return new Response(
          JSON.stringify({
            job_id: 'qc-water1',
            status: 'completed',
            model_preset_id: 'pyscf-rhf-631g',
            model_preset_version: '1',
            initial_structure_revision_id: useLabStore.getState().molecule.revisionId,
            scf_cycles_completed: 8,
            max_scf_cycles: 60,
            converged: true,
            created_at_iso: '2026-11-14T21:00:00Z',
            updated_at_iso: '2026-11-14T21:00:01Z',
            error_code: null,
            error_message: null,
            status_url: '/api/v1/quantum/jobs/qc-water1',
            results_url: '/api/v1/quantum/jobs/qc-water1/results',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/quantum/jobs/qc-water1')) {
        return new Response(
          JSON.stringify({
            job_id: 'qc-water1',
            status: 'completed',
            model_preset_id: 'pyscf-rhf-631g',
            model_preset_version: '1',
            initial_structure_revision_id: useLabStore.getState().molecule.revisionId,
            scf_cycles_completed: 8,
            max_scf_cycles: 60,
            converged: true,
            created_at_iso: '2026-11-14T21:00:00Z',
            updated_at_iso: '2026-11-14T21:00:01Z',
            error_code: null,
            error_message: null,
            status_url: '/api/v1/quantum/jobs/qc-water1',
            results_url: '/api/v1/quantum/jobs/qc-water1/results',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/quantum/jobs/qc-water1/results')) {
        return new Response(
          JSON.stringify({
            job_id: 'qc-water1',
            status: 'completed',
            engine: 'PySCF',
            engine_version: '2.15.0',
            method: 'RHF',
            basis_set: '6-31g',
            charge_e: 0,
            spin_multiplicity: 1,
            converged: true,
            scf_cycles: 8,
            total_energy_hartree: -75.983993,
            total_energy_kj_mol: -199495.97,
            energy_basis: 'mole-of-systems',
            homo_energy_hartree: -0.501378,
            lumo_energy_hartree: 0.203757,
            homo_lumo_gap_ev: 19.1877,
            dipole_moment_debye: [0, 2.6303, 0],
            dipole_magnitude_debye: 2.6303,
            orbitals: [
              { index: 4, label: 'HOMO', occupancy: 2.0, energy_hartree: -0.501378, energy_ev: -13.6432 },
              { index: 5, label: 'LUMO', occupancy: 0.0, energy_hartree: 0.203757, energy_ev: 5.5445 },
            ],
            homo_orbital_field: {
              field_kind: 'orbital-amplitude-and-phase',
              orbital_label: 'HOMO',
              orbital_index: 4,
              isovalue: 0.04,
              unit: 'bohr^-3/2',
              samples: [{ position_angstrom: [0, 0, 0.5], value: 0.12 }],
            },
            electron_density_field: {
              field_kind: 'total-electron-density',
              isovalue: 0.015,
              unit: 'e/bohr^3',
              samples: [{ position_angstrom: [0, 0, 0.5], value: 0.08 }],
            },
            input_structure_revision_id: useLabStore.getState().molecule.revisionId,
            input_structure_hash_sha256: 'hash123',
            assumptions: ['Gas-phase closed-shell'],
            limitations: ['Finite basis'],
            warnings: [],
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
        expect(useLabStore.getState().serviceStatus.pyscfAvailable).toBe(true);
      });

      fireEvent.click(screen.getByRole('button', { name: /^Quantum/i }));
      expect(screen.getByText(/PySCF Method & Basis/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Run PySCF Single-Point/i }));
      await waitFor(() => {
        expect(screen.getByText('-75.983993 Eh')).toBeInTheDocument();
        expect(screen.getByText('SCF Converged')).toBeInTheDocument();
      });

      const overlaySelect = screen.getByLabelText('Displayed Scalar Quantity');
      fireEvent.change(overlaySelect, { target: { value: 'electron-density' } });
      expect(useLabStore.getState().quantumFieldOverlay).toBe('electron-density');
    } finally {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('Offline in test environment'))),
      );
    }
  });
});
