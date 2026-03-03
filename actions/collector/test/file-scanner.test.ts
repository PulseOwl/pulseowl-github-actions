import * as core from "@actions/core";
import { glob } from "glob";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigurationError } from "../src/errors";
import {
  calculateSha256,
  MAX_SCANNED_FILES,
  scanFiles,
  ScanningRule,
} from "../src/file-scanner";

// Mock dependencies
vi.mock("glob");
vi.mock("node:fs/promises");
vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

describe("file-scanner", () => {
  let originalWorkspace: string | undefined;
  // Use path.resolve to ensure cross-platform compatibility (e.g. C:\github\workspace on Windows)
  const MOCK_WORKSPACE = path.resolve("/github/workspace");

  beforeEach(() => {
    vi.clearAllMocks();

    // Set a deterministic workspace for path resolution
    originalWorkspace = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = MOCK_WORKSPACE;

    // Default mock implementations for the security checks
    vi.mocked(fs.lstat).mockResolvedValue({
      isSymbolicLink: () => false,
    } as any);
    vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalWorkspace === undefined) {
      delete process.env.GITHUB_WORKSPACE;
    } else {
      process.env.GITHUB_WORKSPACE = originalWorkspace;
    }
  });

  describe("calculateSha256", () => {
    it("should calculate correct SHA-256 hash", async () => {
      // echo -n "hello world" | shasum -a 256
      const content = "hello world";
      const hash = await calculateSha256(content);
      expect(hash).toBe(
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      );
    });

    it("should return different hashes for different content", async () => {
      const hash1 = await calculateSha256("content A");
      const hash2 = await calculateSha256("content B");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("scanFiles", () => {
    const defaultRules: ScanningRule[] = [
      {
        id: "rule-1",
        sourceFileGlobPatterns: ["src/**/*.ts"],
      },
    ];

    it("should scan and read files successfully", async () => {
      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (pattern === "**/go.mod") return [];
        return ["src/file1.ts", "src/file2.ts"] as any; // Cast to bypass any type mismatch
      });

      vi.mocked(fs.readFile).mockResolvedValue("file content");

      const results = await scanFiles(defaultRules);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        path: "src/file1.ts",
        content: "file content",
        contentHash: expect.any(String),
        matchedRuleIds: ["rule-1"],
      });
      expect(results[1]?.path).toBe("src/file2.ts");
      expect(fs.readFile).toHaveBeenCalledTimes(2);
    });

    it("should deduplicate overlapping files and aggregate rule IDs", async () => {
      const overlappingRules: ScanningRule[] = [
        { id: "rule-1", sourceFileGlobPatterns: ["src/**/*.ts"] },
        { id: "rule-2", sourceFileGlobPatterns: ["**/*.ts"] },
      ];

      vi.mocked(glob).mockImplementation(async (pattern) => {
        if (pattern === "**/go.mod") return [];
        // Both rules match the exact same file
        return ["src/index.ts"] as any;
      });

      vi.mocked(fs.readFile).mockResolvedValue("index content");

      const results = await scanFiles(overlappingRules);

      expect(results).toHaveLength(1);
      expect(results[0]?.path).toBe("src/index.ts");
      expect(results[0]?.matchedRuleIds).toEqual(["rule-1", "rule-2"]);
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    describe("Vendor Ignore Detection", () => {
      it("should configure vendor ignores if a root go.mod is found", async () => {
        vi.mocked(glob).mockImplementation(async (pattern) => {
          if (pattern === "**/go.mod") return ["go.mod"] as any;
          return ["src/test.ts"] as any;
        });
        vi.mocked(fs.readFile).mockResolvedValue("test");

        await scanFiles(defaultRules);

        expect(core.info).toHaveBeenCalledWith(
          expect.stringContaining("Detected 1 Go module(s)"),
        );
        expect(core.info).toHaveBeenCalledWith(
          expect.stringContaining('["vendor/**"]'),
        );

        // Verify glob for rule includes vendor/** in ignore list
        const globCalls = vi.mocked(glob).mock.calls;
        const ruleGlobCall = globCalls.find(
          (call) => call[0] === "src/**/*.ts",
        );
        expect(ruleGlobCall?.[1]?.ignore).toContain("vendor/**");
      });

      it("should configure vendor ignores if a nested go.mod is found", async () => {
        vi.mocked(glob).mockImplementation(async (pattern) => {
          if (pattern === "**/go.mod") return ["backend/go.mod"] as any;
          return ["src/test.ts"] as any;
        });
        vi.mocked(fs.readFile).mockResolvedValue("test");

        await scanFiles(defaultRules);

        // Verify glob for rule includes backend/vendor/** in ignore list
        const globCalls = vi.mocked(glob).mock.calls;
        const ruleGlobCall = globCalls.find(
          (call) => call[0] === "src/**/*.ts",
        );
        expect(ruleGlobCall?.[1]?.ignore).toContain("backend/vendor/**");
      });

      it("should handle errors during vendor detection gracefully", async () => {
        vi.mocked(glob).mockImplementation(async (pattern) => {
          if (pattern === "**/go.mod") throw new Error("Go mod error");
          return ["src/test.ts"] as any;
        });
        vi.mocked(fs.readFile).mockResolvedValue("test");

        const results = await scanFiles(defaultRules);

        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            "Error detecting project structure: Error: Go mod error",
          ),
        );
        // It still falls back and scans the files
        expect(results).toHaveLength(1);
        expect(results[0]?.path).toBe("src/test.ts");
      });
    });

    describe("Security & Path Traversal Mitigations", () => {
      it("should skip files that resolve outside the workspace", async () => {
        // Simulates a directory traversal attack in the glob results
        vi.mocked(glob).mockImplementation(
          async () => ["../../etc/passwd"] as any,
        );

        const results = await scanFiles(defaultRules);

        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            "Skipping file outside workspace: ../../etc/passwd",
          ),
        );
        expect(results).toHaveLength(0);
        expect(fs.readFile).not.toHaveBeenCalled();
      });

      it("should skip symbolic links", async () => {
        // Simulates a file that is a symlink
        vi.mocked(glob).mockImplementation(
          async () => ["src/symlink.ts"] as any,
        );
        vi.mocked(fs.lstat).mockResolvedValue({
          isSymbolicLink: () => true,
        } as any);

        const results = await scanFiles(defaultRules);

        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining("Skipping symlink: src/symlink.ts"),
        );
        expect(results).toHaveLength(0);
        expect(fs.readFile).not.toHaveBeenCalled();
      });

      it("should skip real paths that escape the workspace (symlink chains)", async () => {
        vi.mocked(glob).mockImplementation(
          async () => ["src/sneaky-link.ts"] as any,
        );
        vi.mocked(fs.lstat).mockResolvedValue({
          isSymbolicLink: () => false,
        } as any);

        // Simulates a path that looks safe initially, but resolves outside via realpath
        const externalPath = path.resolve("/etc/passwd");
        vi.mocked(fs.realpath).mockResolvedValue(externalPath);

        const results = await scanFiles(defaultRules);

        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            "Skipping path escaping workspace: src/sneaky-link.ts",
          ),
        );
        expect(results).toHaveLength(0);
        expect(fs.readFile).not.toHaveBeenCalled();
      });
    });

    describe("Error Handling & Hard Limit", () => {
      it("should throw ConfigurationError if max limit is reached", async () => {
        // Generate MAX_SCANNED_FILES + 1 fake file paths
        const maxFiles = Array.from(
          { length: MAX_SCANNED_FILES },
          (_, i) => `src/file${i}.ts`,
        );
        const oneTooMany = "src/file_extra.ts";

        vi.mocked(glob).mockImplementation(async (pattern) => {
          if (pattern === "**/go.mod") return [];
          return [...maxFiles, oneTooMany] as any;
        });

        await expect(scanFiles(defaultRules)).rejects.toThrow(
          ConfigurationError,
        );

        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            `Matched more than the hard limit of ${MAX_SCANNED_FILES} files`,
          ),
        );
        expect(fs.readFile).not.toHaveBeenCalled();
      });

      it("should catch and log standard glob errors but continue", async () => {
        const rules: ScanningRule[] = [
          { id: "rule-error", sourceFileGlobPatterns: ["bad/**/*.ts"] },
          { id: "rule-success", sourceFileGlobPatterns: ["good/**/*.ts"] },
        ];

        vi.mocked(glob).mockImplementation(async (pattern) => {
          if (pattern === "**/go.mod") return [];
          if (pattern === "bad/**/*.ts") throw new Error("Permission denied");
          return ["good/file.ts"] as any;
        });

        vi.mocked(fs.readFile).mockResolvedValue("good content");

        const results = await scanFiles(rules);

        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            "Error globbing pattern bad/**/*.ts for rule rule-error: Error: Permission denied",
          ),
        );
        expect(results).toHaveLength(1);
        expect(results[0]?.path).toBe("good/file.ts");
      });

      it("should catch and log file read errors but continue", async () => {
        vi.mocked(glob).mockImplementation(async (pattern) => {
          if (pattern === "**/go.mod") return [];
          return ["src/success.ts", "src/fail.ts"] as any;
        });

        vi.mocked(fs.readFile).mockImplementation(async (path) => {
          if (path.toString().includes("src/fail.ts"))
            throw new Error("File locked");
          return "success content";
        });

        const results = await scanFiles(defaultRules);

        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(
            "Failed to read file src/fail.ts: Error: File locked",
          ),
        );
        expect(results).toHaveLength(1);
        expect(results[0]?.path).toBe("src/success.ts");
      });
    });
  });
});
