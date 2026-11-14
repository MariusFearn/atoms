import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
      <div className="modal-card">
        <h2 id="confirm-modal-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
