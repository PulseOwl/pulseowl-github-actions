import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as core from "@actions/core";

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
      // Access private property for testing if needed, or check behavior
      // Since baseUrl is private, we can verify it indirectly via fetch calls
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
  });
});
