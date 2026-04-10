'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const ICONS = {
    success: { icon: CheckCircle2, color: 'var(--success)', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.20)' },
    error:   { icon: AlertTriangle, color: 'var(--danger)', bg: 'rgba(220,38,38,0.06)', border: 'rgba(220,38,38,0.16)' },
    info:    { icon: Info,          color: 'var(--blue)', bg: 'rgba(59,111,255,0.06)', border: 'rgba(59,111,255,0.16)' },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 360 }}>
        {toasts.map(t => {
          const cfg = ICONS[t.type];
          const Icon = cfg.icon;
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
              style={{
                background: 'var(--surface)',
                border: `1px solid ${cfg.border}`,
                animation: 'slideUp 0.2s ease',
              }}
            >
              <Icon size={16} style={{ color: cfg.color, flexShrink: 0 }} />
              <p className="text-sm font-medium flex-1" style={{ color: 'var(--ink)' }}>{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="flex-shrink-0" style={{ color: 'var(--ink-faint)' }}>
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
