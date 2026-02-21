import * as core from "@actions/core";
import * as fs from "fs";

import { GithubContext } from "./schemas";

export function getGithubContext(): GithubContext {
  return {
    repository: process.env.GITHUB_REPOSITORY || "",
    repository_id: process.env.GITHUB_REPOSITORY_ID || "",
    repository_owner: process.env.GITHUB_REPOSITORY_OWNER || "",
    repository_owner_id: process.env.GITHUB_REPOSITORY_OWNER_ID || "",
    run_id: process.env.GITHUB_RUN_ID || "",
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    ref: process.env.GITHUB_REF || "",
    sha: process.env.GITHUB_SHA || "",
    actor: process.env.GITHUB_ACTOR || "",
  };
}

export function getEventTimestamp(): string {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));

      // For 'push' events: use the commit timestamp
      if (event.head_commit?.timestamp) {
        core.info(`Using commit timestamp: ${event.head_commit.timestamp}`);
        return event.head_commit.timestamp;
      }

      // For 'pull_request' events: use the last update time
      if (event.pull_request?.updated_at) {
        core.info(
          `Using pull request updated timestamp: ${event.pull_request.updated_at}`,
        );
        return event.pull_request.updated_at;
      }

      // For 'release' events
      if (event.release?.created_at) {
        core.info(
          `Using release created timestamp: ${event.release.created_at}`,
        );
        return event.release.created_at;
      }

      // For 'workflow_dispatch' or other events, try to find a created_at
      if (event.created_at) {
        core.info(`Using created timestamp: ${event.created_at}`);
        return event.created_at;
      }
    } catch (error) {
      // If parsing fails, fall back to current time
      core.warning(`Failed to parse event payload: ${error}`);
    }
  }

  // Fallback if no specific timestamp found
  core.info("No specific timestamp found, using current time");
  return new Date().toISOString();
}

export async function getOIDCToken(audience: string): Promise<string> {
  try {
    return await core.getIDToken(audience);
  } catch (error) {
    core.setFailed(
      `Failed to retrieve OIDC token. Ensure 'id-token: write' permission is granted.`,
    );
    throw error;
  }
}
