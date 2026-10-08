import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { BellRing, X } from 'lucide-react';

interface Toast {
  id: number;
  title: string;
  body?: string;
  url?: string;
}

interface ToastApi {
  notify: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastApi>({ notify: () => {} });

export function useToasts(): ToastApi {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((ts) => [...ts.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), 10_000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <BellRing size={20} aria-hidden />
            <div className="toast-body">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
            </div>
            {t.url && (
              <a href={t.url} onClick={() => dismiss(t.id)}>
                Ver
              </a>
            )}
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dispensar">
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
