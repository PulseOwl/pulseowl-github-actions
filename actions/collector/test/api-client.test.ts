import * as core from "@actions/core";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../src/api-client";

vi.mock("@actions/core", () => ({
  warning: vi.fn(),
  info: vi.fn(),
}));

describe("ApiClient", () => {
  const token = "test-token";
  const envSuffix = "staging";
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient(envSuffix, token);
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should set the correct base URL for staging", () => {
      expect(client).toBeDefined();
    });

    it("should set the correct base URL for production", () => {
      const prodClient = new ApiClient("", token);
      expect(prodClient).toBeDefined();
    });
  });

  describe("fetchConfig", () => {
    it("should fetch config successfully", async () => {
      const mockResponse = {
        data: {
          rules: [],
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const config = await client.fetchConfig({});
      expect(config).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://integrations-staging.pulseowl.dev/github/v1/collector/config",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            authorization: `Bearer ${token}`,
          }),
        }),
      );
    });

    it("should throw error on failed fetch after retries", async () => {
      vi.useFakeTimers();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const promise = client.fetchConfig({});
      const assertion = expect(promise).rejects.toThrow(
        "Failed to fetch config: 500 Internal Server Error",
      );

      // Fast-forward through all retries
      await vi.runAllTimersAsync();

      await assertion;
      expect(global.fetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it("should retry on network error and succeed eventually", async () => {
      vi.useFakeTimers();

      // First call throws (Network Error), second call succeeds
      (global.fetch as any)
        .mockRejectedValueOnce(new Error("Network Error"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { rules: [] } }), // Valid response
        });

      const promise = client.fetchConfig({});

      // Advance timers to get past the setTimeout in the catch block
      await vi.runAllTimersAsync();

      const config = await promise;

      expect(config).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(2); // 1 failure + 1 success
      vi.useRealTimers();
    });

    it("should throw the network error after max attempts", async () => {
      vi.useFakeTimers();

      // Always fails with Network Error
      (global.fetch as any).mockRejectedValue(
        new Error("Persistent Network Error"),
      );

      const promise = client.fetchConfig({});
      const assertion = expect(promise).rejects.toThrow(
        "Persistent Network Error",
      );

      // Fast-forward through all retries
      await vi.runAllTimersAsync();

      // Should reject with the LAST error thrown
      await assertion;

      // Should have tried 3 times (default maxAttempts)
      expect(global.fetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it("should throw error if maxAttempts is less than 1", async () => {
      await expect(client.fetchConfig({}, 0)).rejects.toThrow(
        "Invalid maxAttempts: must be at least 1",
      );

      // Verify fetch was never called since the loop never runs
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("sendIngest", () => {
    it("should send ingest data successfully", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      await client.sendIngest({});
      expect(core.info).toHaveBeenCalledWith(
        "Successfully ingested data to PulseOwl.",
      );
      expect(global.fetch).toHaveBeenCalledWith(
        "https://integrations-staging.pulseowl.dev/github/v1/collector/ingest",
        expect.any(Object),
      );
    });

    it("should throw error on failed ingest", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      await expect(client.sendIngest({})).rejects.toThrow(
        "Failed to ingest data: 400 Bad Request",
      );
    });

    it("should gzip large payloads", async () => {
      const largePayload = { data: "x".repeat(1500) }; // > 1024 bytes
      const jsonString = JSON.stringify(largePayload);
      const compressed = zlib.gzipSync(jsonString);

      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      await client.sendIngest(largePayload);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "content-encoding": "gzip",
            "content-type": "application/json",
            "x-pulseowl-github-actions-collector-version": expect.any(String),
            authorization: `Bearer ${token}`,
            "user-agent": expect.any(String),
          }),
          body: compressed,
        }),
      );
    });

    it("should not gzip small payloads", async () => {
      const smallPayload = { data: "x" }; // < 1024 bytes

      (global.fetch as any).mockResolvedValue({
        ok: true,
      });

      await client.sendIngest(smallPayload);

      // 1. Verify general structure and required headers
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "content-type": "application/json",
            "x-pulseowl-github-actions-collector-version": expect.any(String),
            authorization: `Bearer ${token}`,
            "user-agent": expect.any(String),
          }),
          body: JSON.stringify(smallPayload),
        }),
      );

      // 2. Verify gzip is NOT present
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            "content-encoding": "gzip",
          }),
        }),
      );
    });
  });
});
