import { createContext, useContext, useState, useCallback, useRef } from "react";

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

  const toast = useCallback({
    success: (msg) => addToast(msg, "success"),
    error: (msg) => addToast(msg, "error", 5000),
    info: (msg) => addToast(msg, "info"),
  }, [addToast]);

  // Make toast callable with methods
  const api = useCallback((msg, type) => addToast(msg, type), [addToast]);
  api.success = (msg) => addToast(msg, "success");
  api.error = (msg) => addToast(msg, "error", 5000);
  api.info = (msg) => addToast(msg, "info");

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}${t.removing ? " removing" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
