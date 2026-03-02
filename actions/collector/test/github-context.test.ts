import * as core from "@actions/core";
import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getEventTimestamp,
  getGithubContext,
  getOIDCToken,
} from "../src/github-context";

// Mock dependencies
vi.mock("fs");
vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setFailed: vi.fn(),
  getIDToken: vi.fn(),
}));

describe("github-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe("getGithubContext", () => {
    it("should correctly map all environment variables", () => {
      vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
      vi.stubEnv("GITHUB_REPOSITORY_ID", "12345");
      vi.stubEnv("GITHUB_REPOSITORY_OWNER", "owner");
      vi.stubEnv("GITHUB_REPOSITORY_OWNER_ID", "67890");
      vi.stubEnv("GITHUB_RUN_ID", "run-1");
      vi.stubEnv("GITHUB_RUN_ATTEMPT", "1");
      vi.stubEnv("GITHUB_WORKFLOW", "CI");
      vi.stubEnv("GITHUB_REF", "refs/heads/main");
      vi.stubEnv("GITHUB_SHA", "abcdef123456");
      vi.stubEnv("GITHUB_ACTOR", "user");

      const context = getGithubContext();

      expect(context).toEqual({
        repository: "owner/repo",
        repositoryId: "12345",
        repositoryOwner: "owner",
        repositoryOwnerId: "67890",
        runId: "run-1",
        runAttempt: "1",
        workflow: "CI",
        ref: "refs/heads/main",
        sha: "abcdef123456",
        actor: "user",
      });
    });

    it("should fallback to empty strings if environment variables are missing", () => {
      // Unstub everything to ensure they are undefined
      vi.unstubAllEnvs();

      const context = getGithubContext();

      expect(context).toEqual({
        repository: "",
        repositoryId: "",
        repositoryOwner: "",
        repositoryOwnerId: "",
        runId: "",
        runAttempt: "",
        workflow: "",
        ref: "",
        sha: "",
        actor: "",
      });
    });
  });

  describe("getEventTimestamp", () => {
    const EVENT_PATH = "/path/to/event.json";

    beforeEach(() => {
      vi.stubEnv("GITHUB_EVENT_PATH", EVENT_PATH);
    });

    it("should use current time if event path is missing", () => {
      vi.stubEnv("GITHUB_EVENT_PATH", "");
      expect(getEventTimestamp()).toBe("2026-03-02T12:00:00.000Z");
      expect(core.info).toHaveBeenCalledWith(
        "No specific timestamp found, using current time",
      );
    });

    it("should use current time if event file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(getEventTimestamp()).toBe("2026-03-02T12:00:00.000Z");
    });

    it("should handle invalid JSON gracefully and use current time", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json");

      expect(getEventTimestamp()).toBe("2026-03-02T12:00:00.000Z");
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse event payload"),
      );
    });

    it("should extract timestamp from head_commit.timestamp", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          head_commit: { timestamp: "2024-01-01T00:00:00Z" },
        }),
      );

      expect(getEventTimestamp()).toBe(
        new Date("2024-01-01T00:00:00Z").toISOString(),
      );
      expect(core.info).toHaveBeenCalledWith(
        "Using commit timestamp: 2024-01-01T00:00:00Z",
      );
    });

    it("should extract timestamp from pull_request.updated_at", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          pull_request: { updated_at: "2024-01-02T00:00:00Z" },
        }),
      );

      expect(getEventTimestamp()).toBe(
        new Date("2024-01-02T00:00:00Z").toISOString(),
      );
    });

    it("should extract timestamp from release.created_at", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          release: { created_at: "2024-01-03T00:00:00Z" },
        }),
      );

      expect(getEventTimestamp()).toBe(
        new Date("2024-01-03T00:00:00Z").toISOString(),
      );
    });

    it("should use current time for workflow_dispatch event", () => {
      vi.stubEnv("GITHUB_EVENT_NAME", "workflow_dispatch");
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ created_at: "2024-01-01T00:00:00Z" }), // Even if a timestamp exists
      );

      expect(getEventTimestamp()).toBe("2026-03-02T12:00:00.000Z");
      expect(core.info).toHaveBeenCalledWith(
        "Event is 'workflow_dispatch', using current time.",
      );
    });

    it("should use current time for schedule event", () => {
      vi.stubEnv("GITHUB_EVENT_NAME", "schedule");
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      expect(getEventTimestamp()).toBe("2026-03-02T12:00:00.000Z");
    });

    it("should extract timestamp from created_at fallback", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          created_at: "2024-01-04T00:00:00Z",
        }),
      );

      expect(getEventTimestamp()).toBe(
        new Date("2024-01-04T00:00:00Z").toISOString(),
      );
    });

    it("should warn and use current time if extracted timestamp is invalid", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ created_at: "not-a-date" }),
      );

      expect(getEventTimestamp()).toBe("2026-03-02T12:00:00.000Z");
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse timestamp 'not-a-date'"),
      );
    });

    it("should use current time if event payload has no matching timestamp keys", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ some_other_key: "value" }),
      );

      expect(getEventTimestamp()).toBe("2026-03-02T12:00:00.000Z");
      expect(core.debug).toHaveBeenCalledWith(
        expect.stringContaining("No timestamp found in event payload"),
      );
    });
  });

  describe("getOIDCToken", () => {
    it("should return the token successfully", async () => {
      const audience = "test-audience";
      const token = "mock-jwt-token";
      vi.mocked(core.getIDToken).mockResolvedValue(token);

      const result = await getOIDCToken(audience);

      expect(result).toBe(token);
      expect(core.getIDToken).toHaveBeenCalledWith(audience);
    });

    it("should call setFailed and throw if getIDToken fails", async () => {
      const audience = "test-audience";
      const error = new Error("Token failure");
      vi.mocked(core.getIDToken).mockRejectedValue(error);

      await expect(getOIDCToken(audience)).rejects.toThrow("Token failure");

      expect(core.setFailed).toHaveBeenCalledWith(
        "Failed to retrieve OIDC token. Ensure 'id-token: write' permission is granted.",
      );
    });
  });
});
