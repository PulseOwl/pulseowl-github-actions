import * as core from "@actions/core";
import { glob } from "glob";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";

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

// Defines a list of directories and files to universally ignore during scanning
// to prevent picking up build artifacts, dependencies, and system files.
// We only include high-confidence patterns here to avoid false positives.
const DEFAULT_IGNORE_PATTERNS = [
  // Version Control
  "**/.git/**",

  // Dependencies & Environments (High Confidence)
  "**/node_modules/**", // Node.js
  "**/__pycache__/**", // Python
  "**/.venv/**", // Python
  "**/venv/**", // Python
  "**/vendor/bundle/**", // Ruby Bundler

  // Build Artifacts (High Confidence)
  "**/.gradle/**", // Gradle

  // IDEs & System
  "**/.idea/**",
  "**/.vscode/**",
  "**/.vs/**",
  "**/.DS_Store",
];

export async function calculateSha256(content: string): Promise<string> {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function scanFiles(rules: ScanningRule[]): Promise<ScannedFile[]> {
  const fileRulesMap = new Map<string, Set<string>>();

  // 1. Map files to rules
  for (const rule of rules) {
    for (const pattern of rule.sourceFileGlobPatterns) {
      try {
        const matches = await glob(pattern, {
          nodir: true,
          ignore: DEFAULT_IGNORE_PATTERNS,
        });
        for (const filePath of matches) {
          if (!fileRulesMap.has(filePath)) {
            fileRulesMap.set(filePath, new Set());
          }
          fileRulesMap.get(filePath)?.add(rule.id);
        }
      } catch (err) {
        core.warning(
          `Error globbing pattern ${pattern} for rule ${rule.id}: ${err}`,
        );
      }
    }
  }

  core.info(`Found ${fileRulesMap.size} unique files to scan.`);

  const results: ScannedFile[] = [];

  // 2. Read content, hash, and build result
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
