import { z } from "zod";

export const GithubContextSchema = z.object({
  repository: z.string(),
  repositoryId: z.string(),
  repositoryOwner: z.string(),
  repositoryOwnerId: z.string(),
  runId: z.string(),
  runAttempt: z.string(),
  workflow: z.string(),
  ref: z.string(),
  sha: z.string(),
  actor: z.string(),
});
export type GithubContext = z.infer<typeof GithubContextSchema>;

export const BaseRequestSchema = z.object({
  timestamp: z.iso.datetime(),
  github: GithubContextSchema,
  inputs: z.object({
    pulseowlEnv: z.string().optional(),
    callerVersion: z.string().optional(),
    reusableWorkflowPin: z.string().optional(),
  }),
});
export type BaseRequest = z.infer<typeof BaseRequestSchema>;

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
export type CollectorConfigResponse = z.infer<
  typeof CollectorConfigResponseSchema
>;

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
export type IngestRequest = z.infer<typeof IngestRequestSchema>;
