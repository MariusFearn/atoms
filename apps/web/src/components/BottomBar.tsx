import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useLabStore } from '../state/useLabStore';

export const BottomBar: React.FC = () => {
  const serviceStatus = useLabStore((s) => s.serviceStatus);
  const statusBanner = useLabStore((s) => s.statusBanner);
  const clearStatusBanner = useLabStore((s) => s.clearStatusBanner);

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
          disabled={!serviceStatus.rdkitAvailable}
          title={
            serviceStatus.rdkitAvailable
              ? 'Validate with RDKit'
              : 'Disabled: RDKit service integration is scheduled for Milestone 3'
          }
        >
          RDKit Validate (M3)
        </button>

        <button
          type="button"
          className="btn btn-xs btn-secondary"
          disabled={!serviceStatus.rdkitAvailable}
          title={
            serviceStatus.rdkitAvailable
              ? 'Generate 3D conformer via RDKit'
              : 'Disabled: RDKit conformer generation is scheduled for Milestone 3'
          }
        >
          Generate Conformer (M3)
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
