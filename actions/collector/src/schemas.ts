import { z } from "zod";

export const GithubContextSchema = z.object({
  repository: z.string(),
  repository_id: z.string(),
  repository_owner: z.string(),
  repository_owner_id: z.string(),
  run_id: z.string(),
  run_attempt: z.string(),
  workflow: z.string(),
  ref: z.string(),
  sha: z.string(),
  actor: z.string(),
});

export const BaseRequestSchema = z.object({
  timestamp: z.iso.datetime(),
  github: GithubContextSchema,
  inputs: z.object({
    pulseowl_env: z.string().optional(),
    config_path: z.string().optional(),
  }),
});

export const CollectorConfigResponseSchema = z.object({
  data: z.object({
    rules: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        sourceFileGlobPatterns: z.array(z.string()),
      }),
    ),
  }),
});

export const IngestFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  contentHash: z.string(),
  matchedRuleIds: z.array(z.string()).default([]),
});

export const IngestRequestSchema = BaseRequestSchema.extend({
  data: z.object({
    files: z.array(IngestFileSchema),
  }),
});

export type GithubContext = z.infer<typeof GithubContextSchema>;
export type CollectorConfigResponse = z.infer<
  typeof CollectorConfigResponseSchema
>;
export type IngestRequest = z.infer<typeof IngestRequestSchema>;
