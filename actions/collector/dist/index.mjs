import * as core from "@actions/core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

//#region src/index.ts
const VERSION = "1.0.0";
function normalizeEnvSuffix(raw) {
	const v = raw.trim();
	if (!v) return "";
	if (!/^[a-z0-9][a-z0-9-]{0,19}$/.test(v)) throw new Error(`Invalid pulseowl_env "${raw}". Allowed: lowercase letters, digits, hyphen (max 20 chars).`);
	return v;
}
function integrationsBaseUrl(envSuffix) {
	if (!envSuffix) return "https://integrations.pulseowl.dev";
	return `https://integrations-${envSuffix}.pulseowl.dev`;
}
function safeTruncate(s, max = 4e3) {
	if (s.length <= max) return s;
	return s.slice(0, max) + "…(truncated)";
}
async function sleep(ms) {
	await new Promise((r) => setTimeout(r, ms));
}
async function postJsonWithRetry(url, token, payload, maxAttempts = 3) {
	const body = JSON.stringify(payload);
	let attempt = 0;
	while (true) {
		attempt += 1;
		const ac = new AbortController();
		const timeout = setTimeout(() => ac.abort(), 15e3);
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${token}`,
					"user-agent": `pulseowl-github-actions-collector/${VERSION}`,
					"x-pulseowl-github-actions-collector-version": VERSION
				},
				body,
				signal: ac.signal
			});
			if ((res.status === 429 || res.status >= 500 && res.status <= 599) && attempt < maxAttempts) {
				const backoffMs = Math.min(2e3 * attempt, 8e3);
				core.warning(`PulseOwl API returned ${res.status}. Retrying in ~${backoffMs}ms (attempt ${attempt}/${maxAttempts})`);
				await sleep(backoffMs);
				continue;
			}
			return res;
		} finally {
			clearTimeout(timeout);
		}
	}
}
async function run() {
	try {
		const envInput = core.getInput("pulseowl-env") ?? "";
		const configPathInput = core.getInput("config-path") ?? "";
		const audience = (core.getInput("audience") ?? "pulseowl").trim() || "pulseowl";
		const envSuffix = normalizeEnvSuffix(envInput);
		const endpoint = `${integrationsBaseUrl(envSuffix)}/github/v1/collector-data`;
		core.info(`PulseOwl env suffix: "${envSuffix || "prod"}"`);
		core.info(`PulseOwl endpoint: ${endpoint}`);
		if (configPathInput.trim()) {
			const full = resolve(process.cwd(), configPathInput.trim());
			const exists = existsSync(full);
			core.info(`config_path: ${configPathInput.trim()} (resolved: ${full}) exists=${exists}`);
		} else core.info("config_path: (not provided)");
		const res = await postJsonWithRetry(endpoint, await core.getIDToken(audience), {
			kind: "pulseowl-collector-test",
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			github: {
				repository: process.env.GITHUB_REPOSITORY,
				repository_id: process.env.GITHUB_REPOSITORY_ID,
				run_id: process.env.GITHUB_RUN_ID,
				run_attempt: process.env.GITHUB_RUN_ATTEMPT,
				workflow: process.env.GITHUB_WORKFLOW,
				ref: process.env.GITHUB_REF,
				sha: process.env.GITHUB_SHA,
				actor: process.env.GITHUB_ACTOR
			},
			inputs: {
				pulseowl_env: envSuffix || "",
				config_path: configPathInput.trim() || ""
			}
		}, 3);
		const text = await res.text();
		if (!res.ok) throw new Error(`PulseOwl API error ${res.status}: ${safeTruncate(text)}`);
		core.info(`PulseOwl API OK (${res.status}). Response: ${safeTruncate(text)}`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		core.setFailed(msg);
	}
}
await run();

//#endregion
export {  };
//# sourceMappingURL=index.mjs.map