import { useCallback, useEffect, useState } from 'react';

export type ToastMsg = { text: string; kind: 'info' | 'error'; undo?: () => void };

// Toasts go away on their own; errors stay a little longer.
export function useToast() {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const hide = useCallback(() => setToast(null), []);
  return { toast, show: setToast, hide };
}

export function Toast({ toast, onClose }: { toast: ToastMsg | null; onClose: () => void }) {
  return (
    <div className="toast-region" aria-live="polite">
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : undefined}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="toast-btn" onClick={() => { toast.undo!(); onClose(); }}>Undo</button>
          )}
          <button className="toast-close" onClick={onClose} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );
}
