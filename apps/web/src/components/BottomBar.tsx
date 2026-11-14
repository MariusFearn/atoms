import React from 'react';
import { FlaskConical, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { useLabStore } from '../state/useLabStore';

export const BottomBar: React.FC = () => {
  const workspaceTab = useLabStore((s) => s.workspaceTab);
  const serviceStatus = useLabStore((s) => s.serviceStatus);
  const isScienceBusy = useLabStore((s) => s.isScienceBusy);
  const statusBanner = useLabStore((s) => s.statusBanner);
  const clearStatusBanner = useLabStore((s) => s.clearStatusBanner);
  const runRdkitValidation = useLabStore((s) => s.runRdkitValidation);
  const runRdkitConformer = useLabStore((s) => s.runRdkitConformer);
  const isChemistryTab =
    workspaceTab === 'molecule' || workspaceTab === 'experiment' || workspaceTab === 'quantum';

  return (
    <footer className="bottombar">
      <div className="bottombar-left">
        <span
          className={`service-pill ${
            serviceStatus.state === 'connected' ? 'is-connected' : 'is-offline'
          }`}
          title={serviceStatus.detail}
        >
          {serviceStatus.state === 'connected' ? (
            <Wifi size={13} aria-hidden="true" />
          ) : (
            <WifiOff size={13} aria-hidden="true" />
          )}
          <span>{serviceStatus.modeLabel}</span>
        </span>

        <button
          type="button"
          className="btn btn-xs btn-secondary"
          disabled={!isChemistryTab || !serviceStatus.rdkitAvailable || isScienceBusy}
          onClick={() => void runRdkitValidation()}
          title={
            !isChemistryTab
              ? 'Applies to molecular structure tabs'
              : serviceStatus.rdkitAvailable
                ? 'Validate structure and compute descriptors using RDKit'
                : 'Disabled: requires the RDKit science service'
          }
        >
          <FlaskConical size={12} aria-hidden="true" />
          <span>{isScienceBusy ? 'Running…' : 'RDKit Validate'}</span>
        </button>

        <button
          type="button"
          className="btn btn-xs btn-secondary"
          disabled={!isChemistryTab || !serviceStatus.rdkitAvailable || isScienceBusy}
          onClick={() => void runRdkitConformer()}
          title={
            !isChemistryTab
              ? 'Applies to molecular structure tabs'
              : serviceStatus.rdkitAvailable
                ? 'Generate 3D conformer via RDKit ETKDGv3 (not energy-minimized)'
                : 'Disabled: requires the RDKit science service'
          }
        >
          <Sparkles size={12} aria-hidden="true" />
          <span>Generate Conformer</span>
        </button>
      </div>

      <div className="bottombar-center">
        {statusBanner ? (
          <div className={`status-banner status-banner-${statusBanner.kind}`} role="status">
            <span>{statusBanner.message}</span>
            <button
              type="button"
              className="banner-dismiss"
              onClick={clearStatusBanner}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ) : (
          <span className="shortcut-hint">
            Units: Distance Å · Mass u · Charge e | Shortcuts: Ctrl+Z Undo · Ctrl+Y Redo · Del Delete
          </span>
        )}
      </div>
    </footer>
  );
};
