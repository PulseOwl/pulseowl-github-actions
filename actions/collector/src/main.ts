import * as core from "@actions/core";

import { ApiClient } from "./api-client";
import { shouldFailOnError } from "./errors";
import { scanFiles } from "./file-scanner";
import {
  getEventTimestamp,
  getGithubContext,
  getOIDCToken,
} from "./github-context";
import { BaseRequest, CollectorConfigResponse } from "./schemas";

export async function run(): Promise<void> {
  try {
    // Gather Inputs
    const envSuffix = core.getInput("pulseowl-env") || "";
    const configPath =
      core.getInput("config-path") || ".config/pulseowl/config.yml";
    const audience = core.getInput("audience") || "pulseowl";
    const callerVersion = core.getInput("caller-version") || "unknown";
    const reusableWorkflowPin =
      core.getInput("reusable-workflow-pin") || "unknown";

    // Auth & Context
    const oidcToken = await getOIDCToken(audience);
    const githubContext = getGithubContext();

    const apiClient = new ApiClient(envSuffix, oidcToken);

    // Prepare Base Payload
    const basePayload: Omit<BaseRequest, "data"> = {
      timestamp: getEventTimestamp(),
      github: githubContext,
      inputs: {
        pulseowlEnv: envSuffix,
        configPath: configPath,
        callerVersion: callerVersion,
        reusableWorkflowPin: reusableWorkflowPin,
      },
    };

    // Fetch Config
    core.info("Fetching Collector Configuration...");
    const configResponse: CollectorConfigResponse = await apiClient.fetchConfig(
      {
        ...basePayload,
        data: {}, // Empty data for config request
      },
    );

    const rules = configResponse.data.rules;

    core.startGroup(`Received ${rules.length} collection rules`);
    if (rules.length === 0) {
      core.info("No rules found.");
    } else {
      for (const rule of rules) {
        core.info(`- ${rule.name} (ID: ${rule.id})`);
      }
    }
    core.endGroup();

    if (rules.length === 0) {
      core.info("Exiting.");
      return;
    }

    // Collect Files
    core.info(`Scanning files for ${rules.length} rules...`);
    const scannedFiles = await scanFiles(rules);

    core.startGroup(`Found ${scannedFiles.length} unique files to scan`);
    if (scannedFiles.length === 0) {
      core.info("No matching files found.");
    } else {
      for (const file of scannedFiles) {
        core.info(`- ${file.path}`);
      }
    }
    core.endGroup();

    // Ingest Data
    if (scannedFiles.length > 0) {
      core.info("Sending data to PulseOwl...");
      await apiClient.sendIngest({
        ...basePayload,
        data: {
          files: scannedFiles,
        },
      });
    } else {
      core.info("No matching files found to ingest.");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (shouldFailOnError(error)) {
      // Fail on configuration/auth/validation errors
      core.setFailed(msg);
    } else {
      // Warn on transient/server errors - don't break the user's workflow
      core.warning(`PulseOwl collection skipped: ${msg}`);
    }
  }
}
