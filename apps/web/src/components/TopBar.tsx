import React, { useRef } from 'react';
import {
  Atom as AtomIcon,
  Download,
  Eye,
  FileDown,
  FileUp,
  FolderOpen,
  Maximize2,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useLabStore } from '../state/useLabStore';

interface TopBarProps {
  onRequestProtectedAction: (title: string, message: string, action: () => void) => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onRequestProtectedAction }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const molInputRef = useRef<HTMLInputElement | null>(null);

  const projectName = useLabStore((s) => s.projectName);
  const workspaceTab = useLabStore((s) => s.workspaceTab);
  const hasUnsavedChanges = useLabStore((s) => s.hasUnsavedChanges);
  const serviceStatus = useLabStore((s) => s.serviceStatus);
  const isScienceBusy = useLabStore((s) => s.isScienceBusy);
  const pastCount = useLabStore((s) => s.past.length);
  const futureCount = useLabStore((s) => s.future.length);

  const representation = useLabStore((s) => s.representation);
  const colorPalette = useLabStore((s) => s.colorPalette);
  const showLabels = useLabStore((s) => s.showLabels);
  const showBonds = useLabStore((s) => s.showBonds);
  const showAxes = useLabStore((s) => s.showAxes);
  const showGrid = useLabStore((s) => s.showGrid);
  const lowEffects = useLabStore((s) => s.lowEffects);

  const setProjectName = useLabStore((s) => s.setProjectName);
  const setWorkspaceTab = useLabStore((s) => s.setWorkspaceTab);
  const undo = useLabStore((s) => s.undo);
  const redo = useLabStore((s) => s.redo);
  const setRepresentation = useLabStore((s) => s.setRepresentation);
  const setColorPalette = useLabStore((s) => s.setColorPalette);
  const toggleLabels = useLabStore((s) => s.toggleLabels);
  const toggleBonds = useLabStore((s) => s.toggleBonds);
  const toggleAxes = useLabStore((s) => s.toggleAxes);
  const toggleGrid = useLabStore((s) => s.toggleGrid);
  const toggleLowEffects = useLabStore((s) => s.toggleLowEffects);
  const triggerCameraFit = useLabStore((s) => s.triggerCameraFit);
  const triggerCameraReset = useLabStore((s) => s.triggerCameraReset);
  const resetToEmptyScene = useLabStore((s) => s.resetToEmptyScene);
  const exportProjectJson = useLabStore((s) => s.exportProjectJson);
  const importProjectJson = useLabStore((s) => s.importProjectJson);
  const importMolFile = useLabStore((s) => s.importMolFile);
  const exportMolFile = useLabStore((s) => s.exportMolFile);
  const markSaved = useLabStore((s) => s.markSaved);
  const setStatusBanner = useLabStore((s) => s.setStatusBanner);

  const handleExportMol = async () => {
    const exported = await exportMolFile();
    if (!exported) return;
    const blob = new Blob([exported.molBlock], { type: 'chemical/x-mdl-molfile' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exported.suggestedName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMolFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    const text = await file.text();
    const baseName = file.name.replace(/\.(mol|sdf)$/i, '');
    onRequestProtectedAction(
      'Import MOL / SDF Structure',
      'You have unsaved changes in the current project. Importing a MOL/SDF file will replace your current structure.',
      () => {
        void importMolFile(text, baseName || undefined);
      },
    );
  };

  const handleSave = () => {
    try {
      const json = exportProjectJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug =
        projectName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'matterlab-project';
      a.href = url;
      a.download = `${slug}.matterlab.json`;
      a.click();
      URL.revokeObjectURL(url);
      markSaved();
      setStatusBanner({
        kind: 'info',
        message: `Saved project "${projectName}" to ${slug}.matterlab.json (Schema v1).`,
      });
    } catch (err) {
      setStatusBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to save project.',
      });
    }
  };

  const handleFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    const text = await file.text();
    onRequestProtectedAction(
      'Open Project File',
      'You have unsaved changes in the current project. Opening a new file will replace your current workspace.',
      () => {
        importProjectJson(text);
      },
    );
  };

  return (
    <header className="topbar">
      <div className="topbar-section topbar-brand">
        <AtomIcon size={20} className="brand-icon" aria-hidden="true" />
        <span className="brand-title">MatterLab</span>
        <span className="badge badge-muted">MVP Prototype</span>
        <label className="sr-only" htmlFor="project-name-input">
          Project name
        </label>
        <input
          id="project-name-input"
          className="project-name-input"
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          aria-label="Project name"
        />
        {hasUnsavedChanges && (
          <span className="unsaved-indicator" title="Unsaved local edits">
            ● Unsaved
          </span>
        )}
      </div>

      <nav className="topbar-section topbar-workspaces" aria-label="Workspaces">
        <button
          type="button"
          className={`tab-btn ${workspaceTab === 'molecule' ? 'is-active' : ''}`}
          onClick={() => setWorkspaceTab('molecule')}
        >
          Molecule Editor
        </button>
        <button
          type="button"
          className={`tab-btn ${workspaceTab === 'atom' ? 'is-active' : ''}`}
          onClick={() => setWorkspaceTab('atom')}
          title="Deferred in MVP release schedule"
        >
          Atom <span className="tab-tag">Deferred</span>
        </button>
        <button
          type="button"
          className={`tab-btn ${workspaceTab === 'experiment' ? 'is-active' : ''}`}
          onClick={() => setWorkspaceTab('experiment')}
          title="Classical Molecular Dynamics (OpenMM)"
        >
          Experiment <span className="tab-tag">OpenMM</span>
        </button>
      </nav>

      <div className="topbar-section topbar-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.matterlab.json,application/json"
          className="hidden-input"
          onChange={handleFileChange}
          aria-label="Open MatterLab JSON project file"
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          title="Open local .matterlab.json project"
        >
          <FolderOpen size={15} aria-hidden="true" />
          <span>Open</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleSave}
          title="Save project JSON locally (works offline)"
        >
          <Download size={15} aria-hidden="true" />
          <span>Save</span>
        </button>

        <input
          ref={molInputRef}
          type="file"
          accept=".mol,.sdf"
          className="hidden-input"
          onChange={handleMolFileChange}
          aria-label="Import MOL or SDF structure file"
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!serviceStatus.rdkitAvailable || isScienceBusy}
          onClick={() => molInputRef.current?.click()}
          title={
            serviceStatus.rdkitAvailable
              ? 'Import supported explicit-H MOL/SDF structure via RDKit'
              : 'Disabled: MOL/SDF import requires the RDKit science service'
          }
        >
          <FileUp size={15} aria-hidden="true" />
          <span>Import MOL</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!serviceStatus.rdkitAvailable || isScienceBusy}
          onClick={() => void handleExportMol()}
          title={
            serviceStatus.rdkitAvailable
              ? 'Export structure as MOL V2000 via RDKit (preserves aromaticity)'
              : 'Disabled: MOL export requires the RDKit science service'
          }
        >
          <FileDown size={15} aria-hidden="true" />
          <span>Export MOL</span>
        </button>

        <span className="divider" aria-hidden="true" />

        <button
          type="button"
          className="btn btn-icon"
          onClick={undo}
          disabled={pastCount === 0}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={redo}
          disabled={futureCount === 0}
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={15} aria-hidden="true" />
        </button>

        <span className="divider" aria-hidden="true" />

        <label className="sr-only" htmlFor="representation-select">
          Visual representation
        </label>
        <select
          id="representation-select"
          className="compact-select"
          value={representation}
          onChange={(e) =>
            setRepresentation(e.target.value as 'ball-and-stick' | 'space-filling')
          }
          aria-label="Visual representation"
        >
          <option value="ball-and-stick">Ball &amp; Stick</option>
          <option value="space-filling">Space-Filling (vdW)</option>
        </select>

        <label className="sr-only" htmlFor="palette-select">
          Color scheme
        </label>
        <select
          id="palette-select"
          className="compact-select"
          value={colorPalette}
          onChange={(e) => setColorPalette(e.target.value as 'cpk' | 'colorblind')}
          aria-label="Element color palette"
        >
          <option value="cpk">CPK Colors</option>
          <option value="colorblind">Colorblind-Safe</option>
        </select>

        <div className="toggle-group" role="group" aria-label="Viewport overlays">
          <button
            type="button"
            className={`toggle-pill ${showLabels ? 'is-on' : ''}`}
            onClick={toggleLabels}
            aria-pressed={showLabels}
            title="Toggle atom labels"
          >
            Labels
          </button>
          <button
            type="button"
            className={`toggle-pill ${showBonds ? 'is-on' : ''}`}
            onClick={toggleBonds}
            aria-pressed={showBonds}
            title="Toggle bond cylinders"
          >
            Bonds
          </button>
          <button
            type="button"
            className={`toggle-pill ${showAxes ? 'is-on' : ''}`}
            onClick={toggleAxes}
            aria-pressed={showAxes}
            title="Toggle XYZ axes"
          >
            Axes
          </button>
          <button
            type="button"
            className={`toggle-pill ${showGrid ? 'is-on' : ''}`}
            onClick={toggleGrid}
            aria-pressed={showGrid}
            title="Toggle coordinate grid"
          >
            Grid
          </button>
          <button
            type="button"
            className={`toggle-pill ${lowEffects ? 'is-on' : ''}`}
            onClick={toggleLowEffects}
            aria-pressed={lowEffects}
            title="Toggle low-effects performance preset"
          >
            <Eye size={13} aria-hidden="true" />
            <span>Low-FX</span>
          </button>
        </div>

        <button
          type="button"
          className="btn btn-icon"
          onClick={triggerCameraFit}
          aria-label="Fit molecule in viewport"
          title="Fit molecule to view"
        >
          <Maximize2 size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={triggerCameraReset}
          aria-label="Reset camera"
          title="Reset camera"
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-danger-subtle"
          onClick={() =>
            onRequestProtectedAction(
              'Clear Scene',
              'You have unsaved changes. Clearing the scene will remove all atoms and bonds.',
              resetToEmptyScene,
            )
          }
          aria-label="Clear scene to empty structure"
          title="Clear scene"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
