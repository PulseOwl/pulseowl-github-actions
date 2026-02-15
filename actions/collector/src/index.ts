import * as core from "@actions/core";

import { ApiClient } from "./api-client";
import { scanFiles } from "./file-scanner";
import { getGithubContext, getOIDCToken } from "./github-context";

async function run(): Promise<void> {
  try {
    // Gather Inputs
    const envSuffix = core.getInput("pulseowl-env") || "";
    const configPath =
      core.getInput("config-path") || ".config/pulseowl/config.yml";
    const audience = core.getInput("audience") || "pulseowl";

    // Auth & Context
    const oidcToken = await getOIDCToken(audience);
    const githubContext = getGithubContext();

    const apiClient = new ApiClient(envSuffix, oidcToken);

    // Prepare Base Payload
    const basePayload = {
      timestamp: new Date().toISOString(),
      github: githubContext,
      inputs: {
        pulseowl_env: envSuffix,
        config_path: configPath,
      },
    };

    // Fetch Config
    core.info("Fetching Collector Configuration...");
    const configResponse = await apiClient.fetchConfig({
      ...basePayload,
      data: {}, // Empty data for config request
    });

    const rules = configResponse.data.rules;
    core.info(`Received ${rules.length} collection rules.`);

    if (rules.length === 0) {
      core.info("No rules found. Exiting.");
      return;
    }

    // Collect Files
    core.info(`Scanning files for ${rules.length} rules...`);
    const scannedFiles = await scanFiles(rules);
    core.info(`Scanned ${scannedFiles.length} files successfully.`);

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
    core.setFailed(msg);
  }
}

await run();
