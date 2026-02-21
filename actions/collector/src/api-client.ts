import * as core from "@actions/core";
import * as zlib from "node:zlib";
import pkg from "../package.json";

import { ApiError } from "./errors";
import {
  CollectorConfigResponse,
  CollectorConfigResponseSchema,
} from "./schemas";

const VERSION = pkg.version;

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
    const jsonString = JSON.stringify(payload);
    let body: BodyInit | null | undefined = jsonString;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.token}`,
      "user-agent": this.userAgent,
      "x-pulseowl-github-actions-collector-version": VERSION,
    };

    // Compress if larger than 1KB
    if (jsonString.length > 1024) {
      body = zlib.gzipSync(jsonString);
      headers["content-encoding"] = "gzip";
    }

    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 15_000); // 15s timeout

      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
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
    throw new Error("Invalid maxAttempts: must be at least 1");
  }

  async fetchConfig(
    payload: unknown,
    maxAttempts?: number,
  ): Promise<CollectorConfigResponse> {
    const url = `${this.baseUrl}/github/v1/collector/config`;
    const res = await this.fetchWithRetry(url, payload, maxAttempts);

    if (!res.ok) {
      const errorText = await res.text();
      throw new ApiError(
        `Failed to fetch config: ${res.status} ${errorText}`,
        res.status,
      );
    }

    const json = await res.json();
    return CollectorConfigResponseSchema.parse(json);
  }

  async sendIngest(payload: unknown, maxAttempts?: number): Promise<void> {
    const url = `${this.baseUrl}/github/v1/collector/ingest`;
    const res = await this.fetchWithRetry(url, payload, maxAttempts);

    if (!res.ok) {
      const errorText = await res.text();
      throw new ApiError(
        `Failed to ingest data: ${res.status} ${errorText}`,
        res.status,
      );
    }
    core.info("Successfully ingested data to PulseOwl.");
  }
}
