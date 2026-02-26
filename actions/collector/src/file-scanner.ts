import * as core from "@actions/core";
import { glob } from "glob";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { ConfigurationError } from "./errors";

export const MAX_SCANNED_FILES = 50;

export interface ScannedFile {
  path: string;
  content: string;
  contentHash: string;
  matchedRuleIds: string[];
}

export interface ScanningRule {
  id: string;
  sourceFileGlobPatterns: string[];
}

// Base ignores that are always safe
const BASE_IGNORE_PATTERNS = [
  // Version Control
  "**/.git/**",

  // Dependencies & Environments
  "**/node_modules/**", // Node.js
  "**/__pycache__/**", // Python
  "**/.venv/**", // Python
  "**/venv/**", // Python
  "**/vendor/bundle/**", // Ruby Bundler

  // Build Artifacts
  "**/.gradle/**", // Gradle

  // IDEs & System
  "**/.idea/**",
  "**/.vscode/**",
  "**/.vs/**",
  "**/.DS_Store",
];

/**
 * Calculates the SHA-256 hash of the given content.
 *
 * @param content - The content to hash.
 * @returns The SHA-256 hash of the content.
 */
export async function calculateSha256(content: string): Promise<string> {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Detects project-specific vendor directories (like Go modules)
 * and returns specific ignore patterns for them.
 */
async function detectVendorIgnores(): Promise<string[]> {
  const specificIgnores: string[] = [];

  try {
    // Go Modules: Find all go.mod files
    // Go vendor directories MUST be in the same directory as go.mod
    const goModFiles = await glob("**/go.mod", {
      ignore: BASE_IGNORE_PATTERNS,
      nodir: true,
      maxDepth: 5, // Limit depth to avoid scanning massive trees unnecessarily
    });

    if (goModFiles.length > 0) {
      core.info(
        `Detected ${goModFiles.length} Go module(s). Configuring vendor ignores.`,
      );

      for (const goModFile of goModFiles) {
        const dir = path.dirname(goModFile);
        // If dir is '.', it means root. pattern is 'vendor/**'
        // If dir is 'sub/dir', pattern is 'sub/dir/vendor/**'
        const vendorPattern = dir === "." ? "vendor/**" : `${dir}/vendor/**`;
        specificIgnores.push(vendorPattern);
      }
    }
  } catch (err) {
    core.warning(`Error detecting project structure: ${err}`);
  }

  if (specificIgnores.length > 0) {
    core.info(
      `Ignoring detected vendor directories: ${JSON.stringify(specificIgnores)}`,
    );
  }

  return specificIgnores;
}

/**
 * Scans files for matching rules and returns a list of scanned files.
 *
 * @param rules - The rules to scan for.
 * @returns A list of scanned files.
 */
export async function scanFiles(rules: ScanningRule[]): Promise<ScannedFile[]> {
  // Calculate dynamic ignore list
  const dynamicIgnores = await detectVendorIgnores();
  const allIgnores = [...BASE_IGNORE_PATTERNS, ...dynamicIgnores];

  const fileRulesMap = new Map<string, Set<string>>();

  // Map files to rules
  for (const rule of rules) {
    for (const pattern of rule.sourceFileGlobPatterns) {
      try {
        const matches = await glob(pattern, {
          nodir: true,
          ignore: allIgnores,
        });
        for (const filePath of matches) {
          if (!fileRulesMap.has(filePath)) {
            if (fileRulesMap.size >= MAX_SCANNED_FILES) {
              const msg = `Configuration error: Matched more than the hard limit of ${MAX_SCANNED_FILES} files. This typically happens if a glob pattern is too broad. Please refine your rules.`;
              core.warning(msg);
              throw new ConfigurationError(msg);
            }
            fileRulesMap.set(filePath, new Set());
          }
          fileRulesMap.get(filePath)?.add(rule.id);
        }
      } catch (err) {
        if (err instanceof ConfigurationError) {
          throw err;
        }
        core.warning(
          `Error globbing pattern ${pattern} for rule ${rule.id}: ${err}`,
        );
      }
    }
  }

  core.info(`Found ${fileRulesMap.size} unique files to scan.`);

  const results: ScannedFile[] = [];

  // Read content, hash, and build result
  for (const [filePath, ruleIds] of fileRulesMap) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const contentHash = await calculateSha256(content);

      results.push({
        path: filePath,
        content,
        contentHash,
        matchedRuleIds: Array.from(ruleIds),
      });
    } catch (err) {
      core.warning(`Failed to read file ${filePath}: ${err}`);
    }
  }

  return results;
}
