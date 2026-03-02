import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "../src/api-client";
import { shouldFailOnError } from "../src/errors";
import { scanFiles } from "../src/file-scanner";
import {
  getEventTimestamp,
  getGithubContext,
  getOIDCToken,
} from "../src/github-context";
import { run } from "../src/main";

// Mock dependencies
vi.mock("@actions/core");
vi.mock("../src/api-client");
vi.mock("../src/errors");
vi.mock("../src/file-scanner");
vi.mock("../src/github-context");

describe("main run function", () => {
  const mockOidcToken = "mock-oidc-token";
  const mockTimestamp = "2026-03-02T12:00:00.000Z";
  const mockGithubContext = { repository: "owner/repo", runId: "123" } as any;

  let mockFetchConfig: any;
  let mockSendIngest: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default successful mocks
    vi.mocked(getOIDCToken).mockResolvedValue(mockOidcToken);
    vi.mocked(getEventTimestamp).mockReturnValue(mockTimestamp);
    vi.mocked(getGithubContext).mockReturnValue(mockGithubContext);

    mockFetchConfig = vi.fn().mockResolvedValue({
      data: {
        rules: [
          { id: "rule1", name: "Rule 1", sourceFileGlobPatterns: ["*.ts"] },
        ],
      },
    });
    mockSendIngest = vi.fn().mockResolvedValue({});

    vi.mocked(ApiClient).mockImplementation(function () {
      return {
        fetchConfig: mockFetchConfig,
        sendIngest: mockSendIngest,
      } as any;
    } as any);

    vi.mocked(scanFiles).mockResolvedValue([
      {
        path: "src/index.ts",
        content: "test",
        contentHash: "hash",
        matchedRuleIds: ["rule1"],
      },
    ]);

    // Default inputs
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      switch (name) {
        case "pulseowl-env":
          return "";
        case "config-path":
          return "";
        case "audience":
          return "";
        case "caller-version":
          return "";
        case "reusable-workflow-pin":
          return "";
        default:
          return "";
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Happy Path", () => {
    it("should complete a full successful run when files are found", async () => {
      await run();

      // Verify Auth & Context
      expect(getOIDCToken).toHaveBeenCalledWith("pulseowl"); // default audience
      expect(ApiClient).toHaveBeenCalledWith("", mockOidcToken); // default envSuffix

      // Verify fetchConfig payload
      expect(mockFetchConfig).toHaveBeenCalledWith({
        timestamp: mockTimestamp,
        github: mockGithubContext,
        inputs: {
          pulseowlEnv: "",
          configPath: ".config/pulseowl/config.yml",
          callerVersion: "unknown",
          reusableWorkflowPin: "unknown",
        },
        data: {},
      });

      // Verify file scanning
      expect(scanFiles).toHaveBeenCalledWith([
        { id: "rule1", name: "Rule 1", sourceFileGlobPatterns: ["*.ts"] },
      ]);

      // Verify ingest payload
      expect(mockSendIngest).toHaveBeenCalledWith({
        timestamp: mockTimestamp,
        github: mockGithubContext,
        inputs: {
          pulseowlEnv: "",
          configPath: ".config/pulseowl/config.yml",
          callerVersion: "unknown",
          reusableWorkflowPin: "unknown",
        },
        data: {
          files: [
            {
              path: "src/index.ts",
              content: "test",
              contentHash: "hash",
              matchedRuleIds: ["rule1"],
            },
          ],
        },
      });

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should exit early if no rules are returned from config", async () => {
      mockFetchConfig.mockResolvedValue({ data: { rules: [] } });

      await run();

      expect(mockFetchConfig).toHaveBeenCalled();
      expect(scanFiles).not.toHaveBeenCalled();
      expect(mockSendIngest).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith("Exiting.");
    });

    it("should not call sendIngest if rules exist but no files match", async () => {
      vi.mocked(scanFiles).mockResolvedValue([]);

      await run();

      expect(mockFetchConfig).toHaveBeenCalled();
      expect(scanFiles).toHaveBeenCalled();
      expect(mockSendIngest).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith(
        "No matching files found to ingest.",
      );
    });
  });

  describe("Input Handling", () => {
    it("should use provided inputs correctly", async () => {
      vi.mocked(core.getInput).mockImplementation((name: string) => {
        switch (name) {
          case "pulseowl-env":
            return "-dev";
          case "config-path":
            return "custom/config.yml";
          case "audience":
            return "custom-audience";
          case "caller-version":
            return "v1.2.3";
          case "reusable-workflow-pin":
            return "v1";
          default:
            return "";
        }
      });

      await run();

      expect(getOIDCToken).toHaveBeenCalledWith("custom-audience");
      expect(ApiClient).toHaveBeenCalledWith("-dev", mockOidcToken);

      expect(mockFetchConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: {
            pulseowlEnv: "-dev",
            configPath: "custom/config.yml",
            callerVersion: "v1.2.3",
            reusableWorkflowPin: "v1",
          },
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should call setFailed on critical errors (shouldFailOnError = true)", async () => {
      const error = new Error("Critical Auth Failure");
      vi.mocked(getOIDCToken).mockRejectedValue(error);
      vi.mocked(shouldFailOnError).mockReturnValue(true);

      await run();

      expect(shouldFailOnError).toHaveBeenCalledWith(error);
      expect(core.setFailed).toHaveBeenCalledWith("Critical Auth Failure");
      expect(core.warning).not.toHaveBeenCalled();
    });

    it("should call warning on transient errors (shouldFailOnError = false)", async () => {
      const error = new Error("Server Timeout");
      mockFetchConfig.mockRejectedValue(error);
      vi.mocked(shouldFailOnError).mockReturnValue(false);

      await run();

      expect(shouldFailOnError).toHaveBeenCalledWith(error);
      expect(core.warning).toHaveBeenCalledWith(
        "PulseOwl collection skipped: Server Timeout",
      );
      expect(core.setFailed).not.toHaveBeenCalled();
    });

    it("should handle non-Error objects being thrown", async () => {
      mockFetchConfig.mockRejectedValue("String Error");
      vi.mocked(shouldFailOnError).mockReturnValue(true);

      await run();

      expect(core.setFailed).toHaveBeenCalledWith("String Error");
    });
  });
});
