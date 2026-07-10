import { prisma } from "@/lib/prisma";
import { bumpUserDataVersion, readInMemoryCache, writeInMemoryCache } from "@/lib/inMemoryCache";
import { normalizeEventLink } from "@/lib/eventLink";
import { randomBytes, randomUUID } from "crypto";

import {
  GOOGLE_PRIMARY_CALENDAR_ID,
  isReadOnlyGoogleCalendarId,
} from "@/lib/googleCalendarReadOnly";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CALENDAR_LIST_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";

export { GOOGLE_PRIMARY_CALENDAR_ID, isReadOnlyGoogleCalendarId };

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const AUTO_SYNC_COOLDOWN_MS = 60 * 1000;
const WATCH_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const WATCH_DURATION_MS = 6 * 24 * 60 * 60 * 1000;

type GoogleAccount = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
};

type GoogleEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GoogleCalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleEventDate;
  etag?: string;
  updated?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
  extendedProperties?: {
    private?: Record<string, string | undefined>;
  };
};

type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleChannelResponse = {
  id: string;
  resourceId?: string;
  resourceUri?: string;
  token?: string;
  expiration?: string;
};

type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
  deleted?: boolean;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
};

export type AvailableGoogleCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  color: string | null;
  accessRole: string | null;
  selected: boolean;
};

export type GoogleCalendarStatus = {
  connected: boolean;
  enabled: boolean;
  hasCalendarScope: boolean;
  hasCalendarListScope: boolean;
  lastSyncedAt: string | null;
  webhookConfigured: boolean;
  watchActive: boolean;
  watchExpiresAt: string | null;
};

class GoogleCalendarSyncError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleCalendarSyncError";
    this.status = status;
  }
}

function hasCalendarScope(scope: string | null | undefined) {
  if (!scope) return false;
  return scope.split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE);
}

function hasCalendarListScope(scope: string | null | undefined) {
  if (!scope) return false;
  const scopes = scope.split(/\s+/);
  // Broader calendar scopes also grant calendar-list access.
  return (
    scopes.includes(GOOGLE_CALENDAR_LIST_SCOPE) ||
    scopes.includes("https://www.googleapis.com/auth/calendar.calendarlist") ||
    scopes.includes("https://www.googleapis.com/auth/calendar.readonly") ||
    scopes.includes("https://www.googleapis.com/auth/calendar")
  );
}

async function getGoogleAccount(userId: string): Promise<GoogleAccount | null> {
  return prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });
}

export async function getGoogleCalendarStatus(
  userId: string
): Promise<GoogleCalendarStatus> {
  const [user, account, activeChannel] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleCalendarSyncEnabled: true,
        googleCalendarLastSyncedAt: true,
      },
    }),
    getGoogleAccount(userId),
    prisma.googleCalendarChannel.findFirst({
      where: {
        userId,
        calendarId: GOOGLE_PRIMARY_CALENDAR_ID,
        active: true,
        OR: [{ expiration: null }, { expiration: { gt: new Date() } }],
      },
      orderBy: { expiration: "desc" },
      select: { expiration: true },
    }),
  ]);

  return {
    connected: !!account?.access_token || !!account?.refresh_token,
    enabled: user?.googleCalendarSyncEnabled ?? false,
    hasCalendarScope: hasCalendarScope(account?.scope),
    hasCalendarListScope: hasCalendarListScope(account?.scope),
    lastSyncedAt: user?.googleCalendarLastSyncedAt?.toISOString() ?? null,
    webhookConfigured: !!getGoogleCalendarWebhookAddress(false),
    watchActive: !!activeChannel,
    watchExpiresAt: activeChannel?.expiration?.toISOString() ?? null,
  };
}

async function refreshGoogleAccessToken(account: GoogleAccount) {
  if (!account.refresh_token) {
    throw new GoogleCalendarSyncError("Google account is missing a refresh token.", 409);
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleCalendarSyncError("Google OAuth environment variables are missing.", 500);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !payload.access_token) {
    throw new GoogleCalendarSyncError(
      payload.error_description || payload.error || "Failed to refresh Google access token.",
      res.status
    );
  }

  const expiresAt = payload.expires_in
    ? Math.floor(Date.now() / 1000) + payload.expires_in
    : null;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: payload.access_token,
      expires_at: expiresAt,
      refresh_token: payload.refresh_token ?? account.refresh_token,
      scope: payload.scope ?? account.scope,
      token_type: payload.token_type ?? undefined,
    },
  });

  return payload.access_token;
}

async function getGoogleAccessToken(userId: string, forceRefresh = false) {
  const account = await getGoogleAccount(userId);
  if (!account) {
    throw new GoogleCalendarSyncError("Google account is not connected.", 409);
  }
  if (!hasCalendarScope(account.scope)) {
    throw new GoogleCalendarSyncError("Google Calendar permission has not been granted.", 409);
  }

  const expiresSoon =
    !account.expires_at || account.expires_at * 1000 < Date.now() + 60 * 1000;
  if (!forceRefresh && account.access_token && !expiresSoon) {
    return account.access_token;
  }

  return refreshGoogleAccessToken(account);
}

async function googleCalendarFetch<T>(
  userId: string,
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<T> {
  const accessToken = await getGoogleAccessToken(userId, !retry);
  const res = await fetch(`${GOOGLE_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401 && retry) {
    return googleCalendarFetch<T>(userId, path, init, false);
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Google Calendar request failed.";
    throw new GoogleCalendarSyncError(message, res.status);
  }

  return payload as T;
}

function getGoogleCalendarWebhookAddress(throwIfMissing = true) {
  const explicitUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const baseUrl =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!baseUrl) {
    if (!throwIfMissing) return null;
    throw new GoogleCalendarSyncError(
      "Set GOOGLE_CALENDAR_WEBHOOK_URL to a public HTTPS /api/google-calendar/webhook URL before enabling instant sync.",
      409
    );
  }

  const address = new URL("/api/google-calendar/webhook", baseUrl).toString();
  if (!address.startsWith("https://")) {
    if (!throwIfMissing) return null;
    throw new GoogleCalendarSyncError(
      "Google Calendar webhooks require HTTPS. Set GOOGLE_CALENDAR_WEBHOOK_URL to your deployed app or HTTPS tunnel.",
      409
    );
  }

  return address;
}

function googleChannelExpirationToDate(expiration: string | undefined) {
  if (!expiration) return null;
  const timestamp = Number(expiration);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function stopGoogleCalendarChannel(
  userId: string,
  channel: { channelId: string; resourceId: string | null }
) {
  if (!channel.resourceId) return;

  await googleCalendarFetch<void>(userId, "/channels/stop", {
    method: "POST",
    body: JSON.stringify({
      id: channel.channelId,
      resourceId: channel.resourceId,
    }),
  }).catch((error) => {
    if (error instanceof GoogleCalendarSyncError && error.status === 404) return;
    throw error;
  });
}

export async function ensureGoogleCalendarWatch(
  userId: string,
  calendarId: string = GOOGLE_PRIMARY_CALENDAR_ID,
  options: { force?: boolean } = {}
) {
  const address = getGoogleCalendarWebhookAddress();
  const now = new Date();
  const existing = await prisma.googleCalendarChannel.findFirst({
    where: {
      userId,
      calendarId,
      active: true,
    },
    orderBy: { expiration: "desc" },
  });

  const needsRenewal =
    options.force ||
    !existing ||
    !existing.expiration ||
    existing.expiration.getTime() - now.getTime() < WATCH_RENEWAL_WINDOW_MS;

  if (!needsRenewal && existing) {
    return existing;
  }

  if (existing) {
    await stopGoogleCalendarChannel(userId, existing).catch((error) => {
      console.error("Google Calendar channel stop failed", error);
    });
  }

  const channelId = randomUUID();
  const token = randomBytes(24).toString("hex");
  const requestedExpiration = new Date(now.getTime() + WATCH_DURATION_MS);
  const googleChannel = await googleCalendarFetch<GoogleChannelResponse>(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address,
        token,
        expiration: requestedExpiration.getTime().toString(),
      }),
    }
  );

  const expiration =
    googleChannelExpirationToDate(googleChannel.expiration) ?? requestedExpiration;

  await prisma.googleCalendarChannel.updateMany({
    where: {
      userId,
      calendarId,
      active: true,
      channelId: { not: channelId },
    },
    data: { active: false },
  });

  return prisma.googleCalendarChannel.create({
    data: {
      userId,
      calendarId,
      channelId,
      resourceId: googleChannel.resourceId ?? null,
      token,
      expiration,
      active: true,
    },
  });
}

/**
 * Ensure watch channels for the primary calendar and every read-only source.
 * Primary failures propagate (callers surface them); source failures are
 * logged so one broken shared calendar cannot break instant sync entirely.
 */
export async function ensureGoogleCalendarWatches(userId: string) {
  const primary = await ensureGoogleCalendarWatch(userId);

  const sources = await prisma.googleCalendarSource.findMany({
    where: { userId },
    select: { calendarId: true },
  });
  for (const source of sources) {
    await ensureGoogleCalendarWatch(userId, source.calendarId).catch((error) => {
      console.error(
        `Google Calendar watch setup failed for ${source.calendarId}`,
        error
      );
    });
  }

  return primary;
}

export async function handleGoogleCalendarWebhook(headers: Headers) {
  const channelId = headers.get("x-goog-channel-id");
  const token = headers.get("x-goog-channel-token");
  const resourceState = headers.get("x-goog-resource-state");

  if (!channelId || !token) {
    throw new GoogleCalendarSyncError("Missing Google Calendar channel headers.", 400);
  }

  const channel = await prisma.googleCalendarChannel.findFirst({
    where: {
      channelId,
      token,
      active: true,
    },
    select: {
      id: true,
      userId: true,
      calendarId: true,
      expiration: true,
    },
  });

  if (!channel) {
    throw new GoogleCalendarSyncError("Unknown Google Calendar channel.", 404);
  }

  if (channel.expiration && channel.expiration.getTime() <= Date.now()) {
    await prisma.googleCalendarChannel.update({
      where: { id: channel.id },
      data: { active: false },
    });
    throw new GoogleCalendarSyncError("Google Calendar channel expired.", 410);
  }

  if (resourceState === "sync") {
    return { synced: false, resourceState };
  }

  await syncGoogleCalendarForUser(channel.userId, { force: true });
  await ensureGoogleCalendarWatch(channel.userId, channel.calendarId).catch(
    (error) => {
      console.error("Google Calendar watch renewal failed", error);
    }
  );

  return { synced: true, resourceState };
}

export async function renewGoogleCalendarWatches() {
  const users = await prisma.user.findMany({
    where: {
      googleCalendarSyncEnabled: true,
      accounts: {
        some: {
          provider: "google",
          scope: { contains: GOOGLE_CALENDAR_SCOPE },
        },
      },
    },
    select: { id: true },
  });

  const result = {
    checked: users.length,
    ensured: 0,
    failed: 0,
  };

  for (const user of users) {
    try {
      await ensureGoogleCalendarWatches(user.id);
      result.ensured += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Google Calendar watch renewal failed", error);
    }
  }

  return result;
}

function googleDateToDate(value: GoogleEventDate | undefined): Date | null {
  if (!value) return null;
  const raw = value.dateTime ?? (value.date ? `${value.date}T00:00:00.000Z` : null);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isGoogleAllDay(event: GoogleCalendarEvent) {
  return !!event.start?.date;
}

function extractMeetingLink(event: GoogleCalendarEvent): string | null {
  const conferenceLink =
    event.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video" && entry.uri
    )?.uri ?? event.hangoutLink;

  const candidates = [
    conferenceLink,
    event.location,
    event.description,
    event.htmlLink,
  ].filter(Boolean);

  const urlPattern = /https?:\/\/[^\s<>"')]+/i;
  for (const candidate of candidates) {
    const match = candidate?.match(urlPattern);
    const raw = match?.[0] ?? candidate;
    try {
      const normalized = normalizeEventLink(raw);
      if (normalized) return normalized;
    } catch {
      // Keep scanning; Google descriptions often contain formatting around URLs.
    }
  }

  return null;
}

function recurrenceRuleFromGoogle(event: GoogleCalendarEvent) {
  const rrule = event.recurrence?.find((item) => item.startsWith("RRULE:"));
  return rrule ? rrule.replace(/^RRULE:/, "") : null;
}

function googleEventUpdateDate(event: GoogleCalendarEvent) {
  if (!event.updated) return null;
  const updated = new Date(event.updated);
  return Number.isNaN(updated.getTime()) ? null : updated;
}

function appendLinkToDescription(description: string | null, link: string | null) {
  if (!link) return description ?? undefined;
  const current = description?.trim();
  if (current?.includes(link)) return current;
  return [current, `Meeting link: ${link}`].filter(Boolean).join("\n\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanGoogleDescription(description: string | undefined, link: string | null) {
  const trimmed = description?.trim();
  if (!trimmed) return null;
  if (!link) return trimmed;

  const withoutAppendedLink = trimmed
    .replace(new RegExp(`\\n*Meeting link: ${escapeRegExp(link)}$`), "")
    .trim();
  return withoutAppendedLink || null;
}

function localEventToGoogleBody(event: {
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  recurrenceRule: string | null;
}) {
  const body: Record<string, unknown> = {
    summary: event.title,
    description: appendLinkToDescription(event.description, event.link),
    extendedProperties: {
      private: {
        mertEventId: event.id,
      },
    },
  };

  if (event.link) {
    body.source = {
      title: "Meeting link",
      url: event.link,
    };
    body.location = event.link;
  }

  if (event.allDay) {
    const startDate = dateOnly(event.startTime);
    let endDate = dateOnly(event.endTime);
    if (endDate <= startDate) {
      const nextDay = new Date(event.startTime);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      endDate = dateOnly(nextDay);
    }
    body.start = { date: startDate };
    body.end = { date: endDate };
  } else {
    body.start = { dateTime: event.startTime.toISOString() };
    body.end = { dateTime: event.endTime.toISOString() };
  }

  if (event.recurrenceRule) {
    body.recurrence = [`RRULE:${event.recurrenceRule}`];
  }

  return body;
}

async function deleteMappedGoogleEvent(
  userId: string,
  calendarId: string,
  googleEvent: GoogleCalendarEvent
) {
  const existing = await prisma.event.findFirst({
    where: {
      userId,
      googleCalendarId: calendarId,
      googleEventId: googleEvent.id,
    },
    select: { id: true, parentEventId: true },
  });

  if (existing) {
    if (!existing.parentEventId) {
      await prisma.event.deleteMany({ where: { parentEventId: existing.id } });
    }
    await prisma.event.delete({ where: { id: existing.id } });
    return true;
  }

  if (googleEvent.recurringEventId && googleEvent.originalStartTime) {
    const parent = await prisma.event.findFirst({
      where: {
        userId,
        googleCalendarId: calendarId,
        googleEventId: googleEvent.recurringEventId,
      },
      select: { id: true, title: true, description: true, link: true, startTime: true, endTime: true, color: true, allDay: true },
    });
    const originalStart = googleDateToDate(googleEvent.originalStartTime);
    if (parent && originalStart) {
      const instanceId = `${parent.id}__${originalStart.toISOString()}`;
      const durationMs = parent.endTime.getTime() - parent.startTime.getTime();
      await prisma.event.upsert({
        where: { instanceId },
        update: {
          deleted: true,
          googleCalendarId: calendarId,
          googleEventId: googleEvent.id,
          googleEtag: googleEvent.etag ?? null,
          googleUpdatedAt: googleEventUpdateDate(googleEvent),
          googleSyncedAt: new Date(),
        },
        create: {
          instanceId,
          parentEventId: parent.id,
          userId,
          title: parent.title,
          description: parent.description,
          link: parent.link,
          startTime: originalStart,
          endTime: new Date(originalStart.getTime() + durationMs),
          color: parent.color,
          allDay: parent.allDay,
          deleted: true,
          googleCalendarId: calendarId,
          googleEventId: googleEvent.id,
          googleEtag: googleEvent.etag ?? null,
          googleUpdatedAt: googleEventUpdateDate(googleEvent),
          googleSyncedAt: new Date(),
        },
      });
      return true;
    }
  }

  return false;
}

async function upsertGoogleEvent(
  userId: string,
  calendarId: string,
  googleEvent: GoogleCalendarEvent,
  defaultColor?: string | null
) {
  const startTime = googleDateToDate(googleEvent.start);
  const endTime = googleDateToDate(googleEvent.end);
  if (!startTime || !endTime) return false;

  // mertEventId links Google copies back to events we pushed. Only the
  // primary calendar receives pushes, so ignore it on read-only calendars.
  const linkedLocalId = isReadOnlyGoogleCalendarId(calendarId)
    ? undefined
    : googleEvent.extendedProperties?.private?.mertEventId;
  const existingByGoogleId = await prisma.event.findFirst({
    where: {
      userId,
      googleCalendarId: calendarId,
      googleEventId: googleEvent.id,
    },
  });
  const linkedLocalEvent = linkedLocalId
    ? await prisma.event.findFirst({ where: { id: linkedLocalId, userId } })
    : null;

  const parent = googleEvent.recurringEventId
    ? await prisma.event.findFirst({
        where: {
          userId,
          googleCalendarId: calendarId,
          googleEventId: googleEvent.recurringEventId,
        },
        select: { id: true },
      })
    : null;
  const originalStart = googleDateToDate(googleEvent.originalStartTime);
  const instanceId = parent && originalStart
    ? `${parent.id}__${originalStart.toISOString()}`
    : null;

  const link = extractMeetingLink(googleEvent);
  const data = {
    title: googleEvent.summary?.trim() || "Untitled event",
    description: cleanGoogleDescription(googleEvent.description, link),
    link,
    startTime,
    endTime,
    allDay: isGoogleAllDay(googleEvent),
    recurrenceRule: parent ? null : recurrenceRuleFromGoogle(googleEvent),
    recurrenceEndDate: null,
    deleted: false,
    googleCalendarId: calendarId,
    googleEventId: googleEvent.id,
    googleEtag: googleEvent.etag ?? null,
    googleUpdatedAt: googleEventUpdateDate(googleEvent),
    googleSyncedAt: new Date(),
  };

  const existing = existingByGoogleId ?? linkedLocalEvent;
  if (existing) {
    await prisma.event.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(parent && { parentEventId: parent.id }),
        ...(instanceId && { instanceId }),
      },
    });
    return true;
  }

  await prisma.event.create({
    data: {
      ...data,
      userId,
      color: defaultColor ?? "#4285F4",
      reminderMinutes: null,
      reminderDisabled: false,
      ...(parent && { parentEventId: parent.id }),
      ...(instanceId && { instanceId }),
    },
  });

  return true;
}

async function listGoogleCalendarChanges(
  userId: string,
  calendarId: string,
  syncToken: string | null
) {
  const items: GoogleCalendarEvent[] = [];
  let nextPageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params = new URLSearchParams({
      maxResults: "2500",
      showDeleted: "true",
      singleEvents: "false",
    });

    if (syncToken) {
      params.set("syncToken", syncToken);
    } else {
      const timeMin = new Date();
      timeMin.setUTCFullYear(timeMin.getUTCFullYear() - 1);
      const timeMax = new Date();
      timeMax.setUTCFullYear(timeMax.getUTCFullYear() + 2);
      params.set("timeMin", timeMin.toISOString());
      params.set("timeMax", timeMax.toISOString());
    }

    if (nextPageToken) params.set("pageToken", nextPageToken);

    const page = await googleCalendarFetch<GoogleEventsListResponse>(
      userId,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    );
    items.push(...(page.items ?? []));
    nextPageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (nextPageToken);

  return { items, nextSyncToken };
}

async function syncGoogleCalendarEvents(
  userId: string,
  calendarId: string,
  syncToken: string | null,
  defaultColor?: string | null
) {
  let response: { items: GoogleCalendarEvent[]; nextSyncToken?: string };
  try {
    response = await listGoogleCalendarChanges(userId, calendarId, syncToken);
  } catch (error) {
    if (error instanceof GoogleCalendarSyncError && error.status === 410) {
      response = await listGoogleCalendarChanges(userId, calendarId, null);
    } else {
      throw error;
    }
  }

  const masters = response.items.filter((item) => !item.recurringEventId);
  const instances = response.items.filter((item) => item.recurringEventId);
  let changed = false;

  for (const item of [...masters, ...instances]) {
    const itemChanged =
      item.status === "cancelled"
        ? await deleteMappedGoogleEvent(userId, calendarId, item)
        : await upsertGoogleEvent(userId, calendarId, item, defaultColor);
    changed = changed || itemChanged;
  }

  return { changed, nextSyncToken: response.nextSyncToken };
}

export async function syncGoogleCalendarForUser(
  userId: string,
  options: { force?: boolean } = {}
) {
  const cooldownKey = `google-calendar-sync:${userId}`;
  if (!options.force && readInMemoryCache<boolean>(cooldownKey)) {
    return { changed: false, skipped: true };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleCalendarSyncEnabled: true,
      googleCalendarSyncToken: true,
      googleCalendarLastSyncedAt: true,
    },
  });

  if (!user) {
    throw new GoogleCalendarSyncError("User not found.", 404);
  }
  if (!user.googleCalendarSyncEnabled && !options.force) {
    return { changed: false, skipped: true };
  }
  if (!options.force && user.googleCalendarLastSyncedAt) {
    const elapsed = Date.now() - user.googleCalendarLastSyncedAt.getTime();
    if (elapsed < AUTO_SYNC_COOLDOWN_MS) {
      writeInMemoryCache(cooldownKey, true, AUTO_SYNC_COOLDOWN_MS - elapsed);
      return { changed: false, skipped: true };
    }
  }
  writeInMemoryCache(cooldownKey, true, AUTO_SYNC_COOLDOWN_MS);

  const primary = await syncGoogleCalendarEvents(
    userId,
    GOOGLE_PRIMARY_CALENDAR_ID,
    user.googleCalendarSyncToken
  );
  let changed = primary.changed;

  // Read-only source calendars sync independently; one failing (revoked
  // share, deleted calendar, ...) must not block the primary calendar.
  const sources = await prisma.googleCalendarSource.findMany({
    where: { userId },
  });
  for (const source of sources) {
    try {
      const result = await syncGoogleCalendarEvents(
        userId,
        source.calendarId,
        source.syncToken,
        source.color
      );
      changed = changed || result.changed;
      await prisma.googleCalendarSource.update({
        where: { id: source.id },
        data: {
          syncToken: result.nextSyncToken ?? source.syncToken,
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      console.error(
        `Google Calendar sync failed for calendar ${source.calendarId}`,
        error
      );
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      googleCalendarSyncEnabled: true,
      googleCalendarSyncToken: primary.nextSyncToken ?? user.googleCalendarSyncToken,
      googleCalendarLastSyncedAt: new Date(),
    },
  });

  if (changed) bumpUserDataVersion("events", userId);
  return { changed, skipped: false };
}

export async function pushLocalEventToGoogle(userId: string, eventId: string) {
  const status = await getGoogleCalendarStatus(userId);
  if (!status.enabled || !status.hasCalendarScope) return null;

  const event = await prisma.event.findFirst({
    where: { id: eventId, userId, deleted: false },
  });
  if (!event || (event.parentEventId && !event.googleEventId)) return null;
  if (isReadOnlyGoogleCalendarId(event.googleCalendarId)) return null;

  const body = localEventToGoogleBody(event);
  const params = new URLSearchParams({ conferenceDataVersion: "1" });
  const path = event.googleEventId
    ? `/calendars/${encodeURIComponent(GOOGLE_PRIMARY_CALENDAR_ID)}/events/${encodeURIComponent(event.googleEventId)}?${params.toString()}`
    : `/calendars/${encodeURIComponent(GOOGLE_PRIMARY_CALENDAR_ID)}/events?${params.toString()}`;
  const method = event.googleEventId ? "PATCH" : "POST";

  let googleEvent: GoogleCalendarEvent;
  try {
    googleEvent = await googleCalendarFetch<GoogleCalendarEvent>(userId, path, {
      method,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (
      event.googleEventId &&
      error instanceof GoogleCalendarSyncError &&
      error.status === 404
    ) {
      googleEvent = await googleCalendarFetch<GoogleCalendarEvent>(
        userId,
        `/calendars/${encodeURIComponent(GOOGLE_PRIMARY_CALENDAR_ID)}/events?${params.toString()}`,
        { method: "POST", body: JSON.stringify(body) }
      );
    } else {
      throw error;
    }
  }

  await prisma.event.update({
    where: { id: event.id },
    data: {
      googleCalendarId: GOOGLE_PRIMARY_CALENDAR_ID,
      googleEventId: googleEvent.id,
      googleEtag: googleEvent.etag ?? null,
      googleUpdatedAt: googleEventUpdateDate(googleEvent),
      googleSyncedAt: new Date(),
    },
  });

  return googleEvent;
}

export async function deleteLocalEventFromGoogle(
  userId: string,
  event: {
    googleEventId: string | null;
    googleCalendarId?: string | null;
    parentEventId: string | null;
  }
) {
  if (isReadOnlyGoogleCalendarId(event.googleCalendarId)) return;

  const status = await getGoogleCalendarStatus(userId);
  if (!status.enabled || !status.hasCalendarScope || !event.googleEventId) return;

  await googleCalendarFetch<void>(
    userId,
    `/calendars/${encodeURIComponent(GOOGLE_PRIMARY_CALENDAR_ID)}/events/${encodeURIComponent(event.googleEventId)}`,
    { method: "DELETE" }
  ).catch((error) => {
    if (error instanceof GoogleCalendarSyncError && error.status === 404) return;
    throw error;
  });
}

async function fetchGoogleCalendarList(userId: string) {
  const entries: GoogleCalendarListEntry[] = [];
  let nextPageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      maxResults: "250",
      minAccessRole: "reader",
      showDeleted: "false",
    });
    if (nextPageToken) params.set("pageToken", nextPageToken);

    const page = await googleCalendarFetch<GoogleCalendarListResponse>(
      userId,
      `/users/me/calendarList?${params.toString()}`
    );
    entries.push(...(page.items ?? []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);

  return entries;
}

function calendarListEntryLabel(entry: GoogleCalendarListEntry) {
  return entry.summaryOverride?.trim() || entry.summary?.trim() || entry.id;
}

/**
 * All calendars on the user's Google account, flagged with whether they are
 * currently selected as read-only sources. Requires the calendar-list scope.
 */
export async function listAvailableGoogleCalendars(
  userId: string
): Promise<AvailableGoogleCalendar[]> {
  const [entries, sources] = await Promise.all([
    fetchGoogleCalendarList(userId),
    prisma.googleCalendarSource.findMany({
      where: { userId },
      select: { calendarId: true },
    }),
  ]);

  const selectedIds = new Set(sources.map((source) => source.calendarId));

  return entries
    .filter((entry) => !entry.deleted)
    .map((entry) => ({
      id: entry.id,
      summary: calendarListEntryLabel(entry),
      primary: !!entry.primary,
      color: entry.backgroundColor ?? null,
      accessRole: entry.accessRole ?? null,
      selected: !!entry.primary || selectedIds.has(entry.id),
    }))
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.summary.localeCompare(b.summary);
    });
}

async function removeGoogleCalendarSource(userId: string, calendarId: string) {
  const channels = await prisma.googleCalendarChannel.findMany({
    where: { userId, calendarId, active: true },
    select: { channelId: true, resourceId: true },
  });
  for (const channel of channels) {
    await stopGoogleCalendarChannel(userId, channel).catch((error) => {
      console.error("Google Calendar channel stop failed", error);
    });
  }
  await prisma.googleCalendarChannel.updateMany({
    where: { userId, calendarId },
    data: { active: false },
  });

  // Delete override children before their parents to avoid FK surprises.
  await prisma.event.deleteMany({
    where: { userId, parentEvent: { googleCalendarId: calendarId } },
  });
  await prisma.event.deleteMany({
    where: { userId, googleCalendarId: calendarId },
  });
  await prisma.googleCalendarSource.deleteMany({
    where: { userId, calendarId },
  });
}

/**
 * Replace the user's set of read-only source calendars. Removed calendars get
 * their imported events and watch channels cleaned up; added calendars are
 * validated against the account's calendar list and synced by the caller.
 */
export async function setGoogleCalendarSources(
  userId: string,
  calendarIds: string[]
) {
  const requested = [...new Set(calendarIds)].filter(
    (id) => id && id !== GOOGLE_PRIMARY_CALENDAR_ID
  );

  const [entries, existing, account] = await Promise.all([
    requested.length ? fetchGoogleCalendarList(userId) : Promise.resolve([]),
    prisma.googleCalendarSource.findMany({ where: { userId } }),
    getGoogleAccount(userId),
  ]);

  if (!account) {
    throw new GoogleCalendarSyncError("Google account is not connected.", 409);
  }

  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const primaryEmailId = entries.find((entry) => entry.primary)?.id;

  const existingIds = new Set(existing.map((source) => source.calendarId));
  const requestedIds = new Set(
    // The primary calendar can also appear under the account email; never
    // import it as a read-only duplicate.
    requested.filter((id) => id !== primaryEmailId)
  );

  for (const source of existing) {
    if (!requestedIds.has(source.calendarId)) {
      await removeGoogleCalendarSource(userId, source.calendarId);
    }
  }

  for (const calendarId of requestedIds) {
    const entry = entriesById.get(calendarId);
    if (!entry || entry.deleted) {
      throw new GoogleCalendarSyncError(
        `Calendar "${calendarId}" was not found on your Google account.`,
        400
      );
    }

    const data = {
      summary: calendarListEntryLabel(entry),
      color: entry.backgroundColor ?? null,
    };
    if (existingIds.has(calendarId)) {
      await prisma.googleCalendarSource.updateMany({
        where: { userId, calendarId },
        data,
      });
    } else {
      await prisma.googleCalendarSource.create({
        data: { userId, calendarId, ...data },
      });
    }
  }

  // Removals (and stale summaries) change what the calendar shows.
  bumpUserDataVersion("events", userId);

  return prisma.googleCalendarSource.findMany({
    where: { userId },
    orderBy: { summary: "asc" },
  });
}

export function isGoogleCalendarSyncError(error: unknown): error is GoogleCalendarSyncError {
  return error instanceof GoogleCalendarSyncError;
}
