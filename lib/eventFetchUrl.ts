export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function buildEventsUrl(start: string, end: string) {
  const params = new URLSearchParams({
    start,
    end,
    timeZone: getBrowserTimeZone(),
  });

  return `/api/events?${params.toString()}`;
}
