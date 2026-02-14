import * as core from "@actions/core";

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
