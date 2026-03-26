import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";

const ToastCtx = createContext(null);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = "info", duration = 3000) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, removing: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
    }, duration);
  }, []);

  const api = useMemo(() => {
    const fn = (msg, type) => addToast(msg, type);
    fn.success = (msg) => addToast(msg, "success");
    fn.error = (msg) => addToast(msg, "error", 5000);
    fn.info = (msg) => addToast(msg, "info");
    return fn;
  }, [addToast]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-container" role="alert" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}${t.removing ? " removing" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
