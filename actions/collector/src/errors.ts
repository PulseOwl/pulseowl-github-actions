/**
 * Custom error class that includes HTTP status code for error categorization
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Determines if an error should cause the workflow to fail or just warn.
 *
 * Returns true if the error should cause a failure (setFailed),
 * false if it should only warn (warning).
 */
export function shouldFailOnError(error: unknown): boolean {
  // If it's an ApiError with a status code, categorize based on status
  if (error instanceof ApiError && error.statusCode !== undefined) {
    const status = error.statusCode;

    // Fail on client errors that indicate configuration/auth issues
    if (status === 400) {
      // Bad Request - likely validation error or malformed request
      return true;
    }
    if (status === 401 || status === 403) {
      // Unauthorized/Forbidden - authentication/authorization issue
      return true;
    }

    // Warn on rate limiting and server errors (transient issues)
    if (status === 429 || status >= 500) {
      return false;
    }

    // For other 4xx errors (404, etc.), fail as they might indicate config issues
    if (status >= 400 && status < 500) {
      return true;
    }
  }

  // For non-HTTP errors (network, parsing, etc.), check error message
  const msg =
    error instanceof Error ? error.message : String(error).toLowerCase();

  // Fail on configuration-related errors
  if (
    msg.includes("config") ||
    msg.includes("authentication") ||
    msg.includes("authorization") ||
    msg.includes("token") ||
    msg.includes("oidc")
  ) {
    return true;
  }

  // Warn on transient/network errors
  if (
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("connection") ||
    msg.includes("econnrefused")
  ) {
    return false;
  }

  // Default to failing for unknown errors (better to be loud than silent)
  return true;
}
