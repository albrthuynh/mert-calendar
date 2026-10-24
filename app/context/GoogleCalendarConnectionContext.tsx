"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { GoogleCalendarStatus } from "@/lib/googleCalendar";

type ConnectionState = {
  status: GoogleCalendarStatus | null;
  loading: boolean;
  error: string | null;
};

type ConnectionContextValue = ConnectionState & {
  canInviteGuests: boolean;
  refreshStatus: () => Promise<GoogleCalendarStatus>;
  markReconnectRequired: () => void;
};

const GoogleCalendarConnectionContext = createContext<ConnectionContextValue | null>(null);

export function GoogleCalendarConnectionProvider({ children, initialStatus = null }: PropsWithChildren<{
  initialStatus?: GoogleCalendarStatus | null;
}>) {
  const [connection, setConnection] = useState<ConnectionState>({ status: initialStatus, loading: true, error: null });
  const inFlightRef = useRef<Promise<GoogleCalendarStatus> | null>(null);
  const revisionRef = useRef(0);

  const loadStatus = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;
    const revision = revisionRef.current;
    const request = fetch("/api/google-calendar/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 401 && revision === revisionRef.current) {
            setConnection((current) => ({ ...current, status: null }));
          }
          throw new Error(payload.error || "Failed to check Google Calendar connection.");
        }
        const status = payload as GoogleCalendarStatus;
        if (revision === revisionRef.current) {
          setConnection({ status, loading: false, error: null });
        }
        return status;
      })
      .catch((failure) => {
        if (revision === revisionRef.current) {
          setConnection((current) => ({ ...current, error: failure instanceof Error ? failure.message : "Failed to check Google Calendar connection." }));
        }
        throw failure;
      })
      .finally(() => {
        if (inFlightRef.current === request) {
          inFlightRef.current = null;
          setConnection((current) => ({ ...current, loading: false }));
        }
      });
    inFlightRef.current = request;
    return request;
  }, []);

  const refreshStatus = useCallback(() => {
    setConnection((current) => ({ ...current, loading: true, error: null }));
    return loadStatus();
  }, [loadStatus]);

  const markReconnectRequired = useCallback(() => {
    // A late status response must not restore access after an invitation detects revocation.
    revisionRef.current += 1;
    setConnection((current) => ({
      ...current,
      loading: false,
      error: null,
      status: current.status ? {
        ...current.status,
        requiresReconnect: true,
        connectionError: "Google Calendar access has expired or was revoked. Reconnect Google Calendar to continue syncing.",
      } : null,
    }));
  }, []);

  useEffect(() => {
    void loadStatus().catch(() => { /* Connection errors are available to settings through context. */ });
  }, [loadStatus]);

  const value = useMemo(() => ({
    ...connection,
    canInviteGuests: !!connection.status?.connected && connection.status.enabled && connection.status.hasCalendarScope && !connection.status.requiresReconnect,
    refreshStatus,
    markReconnectRequired,
  }), [connection, refreshStatus, markReconnectRequired]);

  return <GoogleCalendarConnectionContext.Provider value={value}>{children}</GoogleCalendarConnectionContext.Provider>;
}

export function useGoogleCalendarConnection() {
  const connection = useContext(GoogleCalendarConnectionContext);
  if (!connection) throw new Error("useGoogleCalendarConnection must be used within GoogleCalendarConnectionProvider");
  return connection;
}
