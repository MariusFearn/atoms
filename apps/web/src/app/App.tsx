import React, { useEffect, useState } from 'react';
import { BottomBar } from '../components/BottomBar';
import { ConfirmModal } from '../components/ConfirmModal';
import { LeftSidebar } from '../components/LeftSidebar';
import { RightInspector } from '../components/RightInspector';
import { TopBar } from '../components/TopBar';
import { LabSceneViewport } from '../scene/LabSceneViewport';
import { useLabStore } from '../state/useLabStore';
import { AtomWaveWorkspace } from '../workspaces/atom/AtomWaveWorkspace';
import { ExperimentWorkspace } from '../workspaces/experiment/ExperimentWorkspace';
import { NuclearSandboxWorkspace } from '../workspaces/nuclear/NuclearSandboxWorkspace';
import { QuantumWorkspace } from '../workspaces/quantum/QuantumWorkspace';

interface PendingConfirm {
  title: string;
  message: string;
  action: () => void;
}

export const App: React.FC = () => {
  const workspaceTab = useLabStore((s) => s.workspaceTab);
  const hasUnsavedChanges = useLabStore((s) => s.hasUnsavedChanges);
  const checkScienceService = useLabStore((s) => s.checkScienceService);

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    void checkScienceService();
  }, [checkScienceService]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const isEditingField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (isEditingField) return;

      const mod = ev.ctrlKey || ev.metaKey;
      const store = useLabStore.getState();

      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) {
          store.redo();
        } else {
          store.undo();
        }
        return;
      }

      if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        store.redo();
        return;
      }

      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        store.deleteSelected();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const requestProtectedAction = (
    title: string,
    message: string,
    action: () => void,
  ) => {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    setPendingConfirm({ title, message, action });
  };

  return (
    <div className="app-shell">
      <TopBar onRequestProtectedAction={requestProtectedAction} />

      <main className="app-main">
        {workspaceTab === 'molecule' ? (
          <>
            <LeftSidebar onRequestProtectedAction={requestProtectedAction} />
            <section className="center-stage">
              <LabSceneViewport />
            </section>
            <RightInspector />
          </>
        ) : workspaceTab === 'experiment' ? (
          <ExperimentWorkspace onRequestProtectedAction={requestProtectedAction} />
        ) : workspaceTab === 'quantum' ? (
          <QuantumWorkspace />
        ) : workspaceTab === 'nuclear' ? (
          <NuclearSandboxWorkspace />
        ) : (
          <AtomWaveWorkspace />
        )}
      </main>

      <BottomBar />

      <ConfirmModal
        open={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel="Discard Unsaved Changes"
        onConfirm={() => {
          const act = pendingConfirm?.action;
          setPendingConfirm(null);
          act?.();
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
};

export default App;
