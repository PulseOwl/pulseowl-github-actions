import * as core from "@actions/core";
import { glob } from "glob";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";

export interface ScannedFile {
  path: string;
  content: string;
  contentHash: string;
}

export async function calculateSha256(content: string): Promise<string> {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export async function scanFiles(patterns: string[]): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];

  const uniquePaths = new Set<string>();

  for (const pattern of patterns) {
    try {
      const matches = await glob(pattern, { nodir: true });
      matches.forEach((m) => uniquePaths.add(m));
    } catch (err) {
      core.warning(`Error globbing pattern ${pattern}: ${err}`);
    }
  }

  core.info(`Found ${uniquePaths.size} unique files to scan.`);

  for (const filePath of uniquePaths) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const contentHash = await calculateSha256(content);

      files.push({
        path: filePath,
        content,
        contentHash,
      });
    } catch (err) {
      core.warning(`Failed to read file ${filePath}: ${err}`);
    }
  }

  return files;
}
