import * as core from "@actions/core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type EnvSuffix = "" | string;

const VERSION = "1.0.0";

function normalizeEnvSuffix(raw: string): EnvSuffix {
  const v = raw.trim();
  if (!v) return "";

  // Allow only simple suffixes to avoid weird hostname construction.
  // Examples: staging", "qa", etc.
  if (!/^[a-z0-9][a-z0-9-]{0,19}$/.test(v)) {
    throw new Error(
      `Invalid pulseowl_env "${raw}". Allowed: lowercase letters, digits, hyphen (max 20 chars).`
    );
  }
  return v;
}

function integrationsBaseUrl(envSuffix: EnvSuffix): string {
  // Blank suffix = prod
  if (!envSuffix) return "https://integrations.pulseowl.dev";
  return `https://integrations-${envSuffix}.pulseowl.dev`;
}

function safeTruncate(s: string, max = 4000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…(truncated)";
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function postJsonWithRetry(
  url: string,
  token: string,
  payload: unknown,
  maxAttempts = 3
): Promise<Response> {
  const body = JSON.stringify(payload);
  let attempt = 0;

  while (true) {
    attempt += 1;

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 15_000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "user-agent": `pulseowl-github-actions-collector/${VERSION}`,
          "x-pulseowl-github-actions-collector-version": VERSION,
        },
        body,
        signal: ac.signal,
      });

      // Retry on transient statuses
      if (
        (res.status === 429 || (res.status >= 500 && res.status <= 599)) &&
        attempt < maxAttempts
      ) {
        const backoffMs = Math.min(2000 * attempt, 8000);
        core.warning(
          `PulseOwl API returned ${res.status}. Retrying in ~${backoffMs}ms (attempt ${attempt}/${maxAttempts})`
        );
        await sleep(backoffMs);
        continue;
      }

      return res;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function run(): Promise<void> {
  try {
    const envInput = core.getInput("pulseowl_env") ?? "";
    const configPathInput = core.getInput("config_path") ?? "";
    const audience =
      (core.getInput("audience") ?? "pulseowl").trim() || "pulseowl";

    const envSuffix = normalizeEnvSuffix(envInput);
    const baseUrl = integrationsBaseUrl(envSuffix);
    const endpoint = `${baseUrl}/github/v1/collector-data`;

    core.info(`PulseOwl env suffix: "${envSuffix || "prod"}"`);
    core.info(`PulseOwl endpoint: ${endpoint}`);

    if (configPathInput.trim()) {
      const full = resolve(process.cwd(), configPathInput.trim());
      const exists = existsSync(full);
      core.info(
        `config_path: ${configPathInput.trim()} (resolved: ${full}) exists=${exists}`
      );
      // For now: do not fail if missing; you said it's optional.
    } else {
      core.info("config_path: (not provided)");
    }

    // Request OIDC token (requires: permissions: id-token: write)
    // GitHub docs: token is minted by token.actions.githubusercontent.com. :contentReference[oaicite:7]{index=7}
    const oidc = await core.getIDToken(audience);

    const payload = {
      kind: "pulseowl-collector-test",
      timestamp: new Date().toISOString(),
      github: {
        repository: process.env.GITHUB_REPOSITORY,
        repository_id: process.env.GITHUB_REPOSITORY_ID,
        run_id: process.env.GITHUB_RUN_ID,
        run_attempt: process.env.GITHUB_RUN_ATTEMPT,
        workflow: process.env.GITHUB_WORKFLOW,
        ref: process.env.GITHUB_REF,
        sha: process.env.GITHUB_SHA,
        actor: process.env.GITHUB_ACTOR,
      },
      inputs: {
        pulseowl_env: envSuffix || "",
        config_path: configPathInput.trim() || "",
      },
    };

    const res = await postJsonWithRetry(endpoint, oidc, payload, 3);
    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `PulseOwl API error ${res.status}: ${safeTruncate(text)}`
      );
    }

    core.info(
      `PulseOwl API OK (${res.status}). Response: ${safeTruncate(text)}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    core.setFailed(msg);
  }
}

await run();
