import * as core from "@actions/core";
import * as fs from "fs";

import { GithubContext } from "./schemas";

export function getGithubContext(): GithubContext {
  return {
    repository: process.env.GITHUB_REPOSITORY || "",
    repositoryId: process.env.GITHUB_REPOSITORY_ID || "",
    repositoryOwner: process.env.GITHUB_REPOSITORY_OWNER || "",
    repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID || "",
    runId: process.env.GITHUB_RUN_ID || "",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    ref: process.env.GITHUB_REF || "",
    sha: process.env.GITHUB_SHA || "",
    actor: process.env.GITHUB_ACTOR || "",
  };
}

export function getEventTimestamp(): string {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
      let rawTimestamp: string | undefined;

      // Identify the raw timestamp based on event type
      if (event.head_commit?.timestamp) {
        core.info(`Using commit timestamp: ${event.head_commit.timestamp}`);
        rawTimestamp = event.head_commit.timestamp;
      } else if (event.pull_request?.updated_at) {
        core.info(
          `Using PR updated timestamp: ${event.pull_request.updated_at}`,
        );
        rawTimestamp = event.pull_request.updated_at;
      } else if (event.release?.created_at) {
        core.info(
          `Using release created timestamp: ${event.release.created_at}`,
        );
        rawTimestamp = event.release.created_at;
      } else if (
        eventName === "workflow_dispatch" ||
        eventName === "schedule"
      ) {
        core.info(`Event is '${eventName}', using current time.`);
        return new Date().toISOString();
      } else if (event.created_at) {
        core.info(`Using created timestamp: ${event.created_at}`);
        rawTimestamp = event.created_at;
      }

      // Normalize to ISO string if we found a timestamp
      if (rawTimestamp) {
        try {
          return new Date(rawTimestamp).toISOString();
        } catch (e) {
          core.warning(`Failed to parse timestamp '${rawTimestamp}': ${e}`);
        }
      }

      core.debug(
        `No timestamp found in event payload. Event: ${eventName}. Keys: ${Object.keys(event).join(", ")}`,
      );
    } catch (error) {
      core.warning(`Failed to parse event payload: ${error}`);
    }
  }

  // Default to current time if no timestamp is found
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
