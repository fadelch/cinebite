"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type NotificationKind = "error" | "success";

interface Notification {
  id: number;
  kind: NotificationKind;
  message: string;
}

interface NotificationContextValue {
  error: (message: string) => void;
  success: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (kind: NotificationKind, message: string) => {
      const id = ++nextId.current;
      setNotifications((current) => [
        ...current.slice(-3),
        { id, kind, message },
      ]);

      const timer = setTimeout(
        () => dismiss(id),
        kind === "error" ? 7000 : 5000,
      );
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        error: (message) => notify("error", message),
        success: (message) => notify("success", message),
      }}
    >
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-[100] flex flex-col items-end gap-3 sm:left-auto sm:w-full sm:max-w-sm"
        aria-label="Notifications"
      >
        {notifications.map((notification) => (
          <div
            key={notification.id}
            role={notification.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${
              notification.kind === "error"
                ? "border-red-400/30 bg-red-950/95 text-red-100"
                : "border-emerald-400/30 bg-emerald-950/95 text-emerald-100"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                notification.kind === "error"
                  ? "border-red-300/60 text-red-200"
                  : "border-emerald-300/60 text-emerald-200"
              }`}
            >
              {notification.kind === "error" ? "!" : "✓"}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-5">
              {notification.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(notification.id)}
              aria-label="Dismiss notification"
              className="-m-1 rounded-md p-1 text-current opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider.");
  }
  return context;
}
