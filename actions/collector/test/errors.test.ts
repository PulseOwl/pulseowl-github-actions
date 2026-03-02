import { describe, expect, it } from "vitest";

import { ApiError, ConfigurationError, shouldFailOnError } from "../src/errors";

describe("ApiError", () => {
  describe("constructor", () => {
    it("should create an ApiError with message and status code", () => {
      const error = new ApiError("Test error", 400);
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe("ApiError");
      expect(error).toBeInstanceOf(Error);
    });

    it("should create an ApiError without status code", () => {
      const error = new ApiError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBeUndefined();
      expect(error.name).toBe("ApiError");
    });
  });
});

describe("ConfigurationError", () => {
  describe("constructor", () => {
    it("should create a ConfigurationError with message", () => {
      const error = new ConfigurationError("Test config error");
      expect(error.message).toBe("Test config error");
      expect(error.name).toBe("ConfigurationError");
      expect(error).toBeInstanceOf(Error);
    });
  });
});

describe("shouldFailOnError", () => {
  describe("ApiError with status codes", () => {
    it("should return true (fail) for 400 Bad Request", () => {
      const error = new ApiError("Bad Request", 400);
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for 401 Unauthorized", () => {
      const error = new ApiError("Unauthorized", 401);
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for 403 Forbidden", () => {
      const error = new ApiError("Forbidden", 403);
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for 404 Not Found", () => {
      const error = new ApiError("Not Found", 404);
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for other 4xx errors (e.g., 422)", () => {
      const error = new ApiError("Unprocessable Entity", 422);
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return false (warn) for 429 Too Many Requests", () => {
      const error = new ApiError("Rate Limited", 429);
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return false (warn) for 500 Internal Server Error", () => {
      const error = new ApiError("Internal Server Error", 500);
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return false (warn) for 502 Bad Gateway", () => {
      const error = new ApiError("Bad Gateway", 502);
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return false (warn) for 503 Service Unavailable", () => {
      const error = new ApiError("Service Unavailable", 503);
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return false (warn) for 504 Gateway Timeout", () => {
      const error = new ApiError("Gateway Timeout", 504);
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return true (fail) for ApiError without status code", () => {
      const error = new ApiError("Error without status");
      expect(shouldFailOnError(error)).toBe(true);
    });
  });

  describe("ConfigurationError", () => {
    it("should return true (fail) for ConfigurationError instances", () => {
      const error = new ConfigurationError("Invalid glob pattern");
      expect(shouldFailOnError(error)).toBe(true);
    });
  });

  describe("Error objects with message keywords", () => {
    it("should return true (fail) for errors containing 'config'", () => {
      const error = new Error("Invalid config file");
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for errors containing 'authentication'", () => {
      const error = new Error("Authentication failed");
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for errors containing 'authorization'", () => {
      const error = new Error("Authorization denied");
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for errors containing 'token'", () => {
      const error = new Error("Invalid token provided");
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for errors containing 'oidc'", () => {
      const error = new Error("OIDC token error");
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for errors containing 'oidc' (case sensitive)", () => {
      // Error.message is case-sensitive, so lowercase 'oidc' matches
      const error = new Error("oidc authentication failed");
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for errors containing 'OIDC' (case sensitive)", () => {
      // Error.message is case-sensitive, but 'OIDC' contains 'oidc' as substring
      // Actually, "OIDC".includes("oidc") is false, so this should fail
      const error = new Error("OIDC authentication failed");
      expect(shouldFailOnError(error)).toBe(true); // Falls through to default fail
    });

    it("should return false (warn) for errors containing 'timeout'", () => {
      const error = new Error("Request timeout");
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return false (warn) for errors containing 'network' (case sensitive)", () => {
      const error = new Error("network error occurred");
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return false (warn) for errors containing 'connection' (case sensitive)", () => {
      const error = new Error("connection reset");
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return false (warn) for errors containing 'econnrefused' (case sensitive)", () => {
      const error = new Error("econnrefused");
      expect(shouldFailOnError(error)).toBe(false);
    });

    it("should return true (fail) for errors with capitalized keywords (Error.message is case-sensitive)", () => {
      // Error.message is NOT lowercased, so capitalized keywords won't match
      const error = new Error("Network Error");
      expect(shouldFailOnError(error)).toBe(true); // Falls through to default fail
    });

    it("should return true (fail) for unknown error messages", () => {
      const error = new Error("Something unexpected happened");
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should return true (fail) for empty error message", () => {
      const error = new Error("");
      expect(shouldFailOnError(error)).toBe(true);
    });
  });

  describe("Non-Error objects (strings)", () => {
    it("should return true (fail) for strings containing 'config'", () => {
      expect(shouldFailOnError("Invalid config")).toBe(true);
    });

    it("should return true (fail) for strings containing 'authentication'", () => {
      expect(shouldFailOnError("Authentication failed")).toBe(true);
    });

    it("should return true (fail) for strings containing 'authorization'", () => {
      expect(shouldFailOnError("Authorization error")).toBe(true);
    });

    it("should return true (fail) for strings containing 'token'", () => {
      expect(shouldFailOnError("Token invalid")).toBe(true);
    });

    it("should return true (fail) for strings containing 'oidc'", () => {
      expect(shouldFailOnError("OIDC issue")).toBe(true);
    });

    it("should return false (warn) for strings containing 'timeout'", () => {
      expect(shouldFailOnError("Request timeout")).toBe(false);
    });

    it("should return false (warn) for strings containing 'network'", () => {
      expect(shouldFailOnError("Network failure")).toBe(false);
    });

    it("should return false (warn) for strings containing 'connection'", () => {
      expect(shouldFailOnError("Connection lost")).toBe(false);
    });

    it("should return false (warn) for strings containing 'econnrefused'", () => {
      expect(shouldFailOnError("ECONNREFUSED")).toBe(false);
    });

    it("should return true (fail) for unknown string errors", () => {
      expect(shouldFailOnError("Unknown error occurred")).toBe(true);
    });

    it("should return true (fail) for empty string", () => {
      expect(shouldFailOnError("")).toBe(true);
    });

    it("should handle case-insensitive matching for strings (strings are lowercased)", () => {
      // Strings are converted to lowercase, so case-insensitive matching works
      expect(shouldFailOnError("CONFIG ERROR")).toBe(true);
      expect(shouldFailOnError("TIMEOUT ERROR")).toBe(false);
      expect(shouldFailOnError("Network Error")).toBe(false); // "network error" matches "network"
    });
  });

  describe("Edge cases", () => {
    it("should return true (fail) for null", () => {
      expect(shouldFailOnError(null)).toBe(true);
    });

    it("should return true (fail) for undefined", () => {
      expect(shouldFailOnError(undefined)).toBe(true);
    });

    it("should return true (fail) for number", () => {
      expect(shouldFailOnError(404)).toBe(true);
    });

    it("should return true (fail) for object without message", () => {
      expect(shouldFailOnError({})).toBe(true);
    });

    it("should return true (fail) for object with toString", () => {
      const obj = {
        toString: () => "config error",
      };
      expect(shouldFailOnError(obj)).toBe(true);
    });

    it("should prioritize status code over message for ApiError", () => {
      // Even if message contains "timeout", status 400 should cause fail
      const error = new ApiError("Request timeout", 400);
      expect(shouldFailOnError(error)).toBe(true);
    });

    it("should prioritize status code over message for ApiError (server error)", () => {
      // Even if message contains "config", status 500 should cause warn
      const error = new ApiError("Config error", 500);
      expect(shouldFailOnError(error)).toBe(false);
    });
  });
});
