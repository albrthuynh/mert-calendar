export function logSecurityError(context: string, error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : undefined;
  console.error(context, { type: error instanceof Error ? error.name : "UnknownError", code });
}

export function publicErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && "status" in error && typeof error.status === "number" && error.status >= 400 && error.status < 500) {
    return error.message;
  }
  return fallback;
}
