"use client";

import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { Plus, UserPlus, X } from "lucide-react";
import type { CalendarEvent } from "@/types/calendar";
import { normalizeGuestEmails, type EventGuest, type EventGuestScope } from "@/lib/eventGuests";
import { useGoogleCalendarConnection } from "../context/GoogleCalendarConnectionContext";

type GuestDraft = { emailInput: string; emails: string[] };

export function EventGuestInvites({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const [scope, setScope] = useState<EventGuestScope>("event");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<GuestDraft>({ emailInput: "", emails: [] });
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (keyboard: KeyboardEvent) => {
      if (keyboard.key === "Escape") {
        keyboard.preventDefault();
        keyboard.stopImmediatePropagation();
        if (!sending) onClose();
      } else if (keyboard.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
        );
        if (!controls?.length) {
          keyboard.preventDefault();
          return;
        }
        const firstControl = controls[0];
        const lastControl = controls[controls.length - 1];
        if (keyboard.shiftKey && (document.activeElement === firstControl || document.activeElement === dialogRef.current)) {
          keyboard.preventDefault();
          lastControl.focus();
        } else if (!keyboard.shiftKey && (document.activeElement === lastControl || document.activeElement === dialogRef.current)) {
          keyboard.preventDefault();
          firstControl.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, sending]);

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      onPointerDown={(pointer) => {
        if (pointer.target === pointer.currentTarget && !sending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold">
              <UserPlus className="h-4 w-4 text-blue-500" />
              Invite guests
            </h2>
            <p className="mt-1 break-words text-sm text-gray-500 dark:text-gray-400">{event.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close guest invitations" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-5">
          {event.recurrenceRule && (
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
              Invite to
              <select value={scope} disabled={sending} onChange={(change) => setScope(change.target.value as EventGuestScope)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800">
                <option value="event">This occurrence only</option>
                <option value="series">Entire recurring series</option>
              </select>
            </label>
          )}
          <EventGuestForm key={scope} event={event} scope={scope} sending={sending} onSendingChange={setSending} draft={draft} onDraftChange={setDraft} onClose={onClose} />
        </div>
      </div>
    </div>,
    document.body
  );
}

function EventGuestForm({ event, scope, sending, onSendingChange, draft, onDraftChange, onClose }: {
  event: CalendarEvent;
  scope: EventGuestScope;
  sending: boolean;
  onSendingChange: (sending: boolean) => void;
  draft: GuestDraft;
  onDraftChange: Dispatch<SetStateAction<GuestDraft>>;
  onClose: () => void;
}) {
  const emailInputId = useId();
  const { markReconnectRequired } = useGoogleCalendarConnection();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [guests, setGuests] = useState<EventGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const instanceStartTime = event.instanceStartTime ?? event.startTime;
  const guestEndpoint = `/api/events/${encodeURIComponent(event.id)}/guests`;

  useEffect(() => {
    if (ready) emailInputRef.current?.focus();
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ scope, instanceStartTime });
    fetch(`${guestEndpoint}?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          if (body.requiresReconnect) markReconnectRequired();
          throw new Error(body.error || "Could not load guests.");
        }
        if (!cancelled) {
          setGuests(body.guests ?? []);
          setReady(true);
        }
      })
      .catch((failure) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Could not load guests.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guestEndpoint, instanceStartTime, scope, markReconnectRequired]);

  const addEmails = () => {
    if (!draft.emailInput.trim() || sending) return;
    setError("");
    setMessage("");
    try {
      const enteredEmails = normalizeGuestEmails(draft.emailInput.split(/[,;\n]+/).map((email) => email.trim()).filter(Boolean));
      const existingEmails = new Set([...guests.map((guest) => guest.email.toLowerCase()), ...draft.emails]);
      const newEmails = enteredEmails.filter((email) => !existingEmails.has(email));
      if (!newEmails.length) throw new Error("That email is already on the guest list.");
      const emails = normalizeGuestEmails([...draft.emails, ...newEmails]);
      onDraftChange({ emailInput: "", emails });
      emailInputRef.current?.focus();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not add this guest.");
    }
  };

  const sendInvitations = async (submit: React.FormEvent) => {
    submit.preventDefault();
    if (!ready || sending) return;
    setError("");
    setMessage("");
    onSendingChange(true);
    try {
      // Include a final typed address when Send is clicked before Enter is pressed.
      const typedEmails = draft.emailInput.split(/[,;\n]+/).map((email) => email.trim()).filter(Boolean);
      const emails = normalizeGuestEmails([...draft.emails, ...typedEmails]);
      const response = await fetch(guestEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, scope, instanceStartTime }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.requiresReconnect) {
          markReconnectRequired();
          setReady(false);
        }
        throw new Error(body.error || "Could not send invitations.");
      }
      setMessage(body.invitedCount ? "Invitations sent through Google Calendar." : "These guests are already invited.");
      setGuests((current) => {
        const existingEmails = new Set(current.map((guest) => guest.email.toLowerCase()));
        return [...current, ...emails.filter((email) => !existingEmails.has(email)).map((email) => ({ email, responseStatus: "needsAction" }))];
      });
      onDraftChange({ emailInput: "", emails: [] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send invitations.");
    } finally {
      onSendingChange(false);
    }
  };

  return (
    <form onSubmit={sendInvitations} className="space-y-4" noValidate>
      {loading && <p className="text-xs text-gray-500">Checking guest access...</p>}
      {guests.length > 0 && (
        <ul className="space-y-1 text-xs text-gray-500 dark:text-gray-400" aria-label="Current guests">
          {guests.map((guest) => <li key={guest.email} className="break-words">{guest.displayName || guest.email}{guest.responseStatus && ` · ${guest.responseStatus === "needsAction" ? "Awaiting response" : guest.responseStatus}`}</li>)}
        </ul>
      )}
      {ready && (
        <>
          <div className="space-y-2">
            <label htmlFor={emailInputId} className="block text-xs font-medium text-gray-600 dark:text-gray-400">Guest email address</label>
            <div className="flex gap-2">
              <input
                ref={emailInputRef}
                id={emailInputId}
                type="email"
                value={draft.emailInput}
                onChange={(change) => onDraftChange((current) => ({ ...current, emailInput: change.target.value }))}
                onKeyDown={(keyboard) => {
                  if (keyboard.key === "Enter" && !keyboard.nativeEvent.isComposing) {
                    keyboard.preventDefault();
                    addEmails();
                  }
                }}
                placeholder="friend@example.com"
                autoComplete="email"
                disabled={sending}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800"
              />
              <button type="button" onClick={addEmails} disabled={sending || !draft.emailInput.trim()} aria-label="Add guest" className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Press Enter to add each guest. Invitations are sent when you choose Send invitations.</p>
          </div>
          {draft.emails.length > 0 && (
            <ul aria-label="Guests to invite" className="flex flex-wrap gap-2">
              {draft.emails.map((email) => (
                <li key={email} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-xs text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  <span className="min-w-0 break-all">{email}</span>
                  <button type="button" aria-label={`Remove ${email}`} disabled={sending} onClick={() => onDraftChange((current) => ({ ...current, emails: current.emails.filter((guestEmail) => guestEmail !== email) }))} className="shrink-0 rounded-full p-1 hover:bg-blue-100 disabled:opacity-50 dark:hover:bg-blue-900">
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {message && <p role="status" className="text-xs text-blue-600 dark:text-blue-400">{message}</p>}
      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
        <button type="button" onClick={onClose} disabled={sending} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800">{message ? "Done" : "Cancel"}</button>
        {ready && <button type="submit" disabled={sending || (!draft.emails.length && !draft.emailInput.trim())} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{sending ? "Sending invitations..." : "Send invitations"}</button>}
      </div>
    </form>
  );
}
