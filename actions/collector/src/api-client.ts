import * as core from "@actions/core";

import {
  CollectorConfigResponseSchema,
  CollectorConfigResponse,
} from "./schemas";

const VERSION = "1.0.0"; // Should ideally come from package.json

export class ApiClient {
  private baseUrl: string;
  private token: string;
  private userAgent: string;

  constructor(envSuffix: string, token: string) {
    this.baseUrl = envSuffix
      ? `https://integrations-${envSuffix}.pulseowl.dev`
      : "https://integrations.pulseowl.dev";
    this.token = token;
    this.userAgent = `pulseowl-github-actions-collector/${VERSION}`;
  }

  private async fetchWithRetry(
    url: string,
    payload: unknown,
    maxAttempts = 3,
  ): Promise<Response> {
    const body = JSON.stringify(payload);
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 15_000); // 15s timeout

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.token}`,
            "user-agent": this.userAgent,
            "x-pulseowl-github-actions-collector-version": VERSION,
          },
          body,
          signal: ac.signal,
        });

        if (
          (res.status === 429 || res.status >= 500) &&
          attempt < maxAttempts
        ) {
          const backoff = Math.min(2000 * attempt, 8000);
          core.warning(`API ${res.status}. Retrying in ${backoff}ms...`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        return res;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error("Max retry attempts reached");
  }

  async fetchConfig(payload: unknown): Promise<CollectorConfigResponse> {
    const url = `${this.baseUrl}/github/v1/collector/config`;
    const res = await this.fetchWithRetry(url, payload);

    if (!res.ok) {
      throw new Error(
        `Failed to fetch config: ${res.status} ${await res.text()}`,
      );
    }

    const json = await res.json();
    return CollectorConfigResponseSchema.parse(json);
  }

  async sendIngest(payload: unknown): Promise<void> {
    const url = `${this.baseUrl}/github/v1/collector/ingest`;
    const res = await this.fetchWithRetry(url, payload);

    if (!res.ok) {
      throw new Error(
        `Failed to ingest data: ${res.status} ${await res.text()}`,
      );
    }
    core.info("Successfully ingested data to PulseOwl.");
  }
}
