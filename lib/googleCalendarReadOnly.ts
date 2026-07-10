export const GOOGLE_PRIMARY_CALENDAR_ID = "primary";

/**
 * Events imported from any calendar other than the user's primary one are
 * read-only: we never push local changes back to Google for them, and the
 * app blocks editing/deleting them locally.
 *
 * Kept free of Prisma imports so pure modules (and their tests) can use it.
 */
export function isReadOnlyGoogleCalendarId(
  calendarId: string | null | undefined
): boolean {
  return !!calendarId && calendarId !== GOOGLE_PRIMARY_CALENDAR_ID;
}
