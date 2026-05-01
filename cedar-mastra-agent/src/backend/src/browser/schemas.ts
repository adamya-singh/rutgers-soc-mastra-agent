import { z } from 'zod';
import { DegreeNavigatorExtractionSummarySchema } from '../degree-navigator/schemas.js';

export const BrowserTargetSchema = z.enum(['degree_navigator']);

export const BrowserSessionStatusSchema = z.enum([
  'created',
  'awaiting_login',
  'ready',
  'error',
  'closed',
]);

export const BrowserSessionStateSchema = z.object({
  provider: z.literal('browserbase'),
  sessionId: z.string().min(1),
  liveViewUrl: z.string().url(),
  target: BrowserTargetSchema,
  status: BrowserSessionStatusSchema,
  ownerId: z.string().min(1),
  createdAt: z.string().min(1),
  lastHeartbeatAt: z.string().min(1),
});

export const CreateBrowserSessionRequestSchema = z.object({
  target: BrowserTargetSchema.default('degree_navigator'),
});

export const StatusBrowserSessionRequestSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
});

export const DegreeNavigatorReadinessSchema = z.enum([
  'awaiting_login',
  'ready',
  'unknown',
]);

export const DegreeNavigatorReadinessRequestSchema = StatusBrowserSessionRequestSchema;

export const DegreeNavigatorReadinessResponseSchema = z.object({
  readiness: DegreeNavigatorReadinessSchema,
  urlHost: z.string().optional(),
  urlPath: z.string().optional(),
  title: z.string().optional(),
  checkedAt: z.string().min(1),
});

export const DegreeNavigatorExtractionRequestSchema = StatusBrowserSessionRequestSchema;

export const DegreeNavigatorExtractionResponseSchema = z.object({
  runId: z.string().uuid(),
  summary: DegreeNavigatorExtractionSummarySchema,
});

export const CloseBrowserSessionRequestSchema = StatusBrowserSessionRequestSchema;

export const BrowserSessionCloseReasonSchema = z.enum([
  'manual_stop',
  'pagehide',
  'beforeunload',
  'hidden_timeout',
  'idle_timeout',
  'startup_cleanup',
  'reaper',
]);

export const CloseBrowserSessionWithPolicyRequestSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  reason: BrowserSessionCloseReasonSchema.optional(),
  allowUntracked: z.boolean().default(false),
});

export const CloseBrowserSessionBeaconRequestSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  reason: BrowserSessionCloseReasonSchema.optional(),
  allowUntracked: z.boolean().default(true),
  accessToken: z.string().min(1).optional(),
});

export const BrowserSessionResponseSchema = z.object({
  session: BrowserSessionStateSchema,
});

export const CloseBrowserSessionResponseSchema = z.object({
  accepted: z.boolean(),
  terminated: z.boolean(),
  terminationMethod: z.string(),
  terminationVerified: z.boolean().optional(),
  providerStillRunning: z.boolean().optional(),
  session: BrowserSessionStateSchema.nullable().optional(),
});

export const CloseBrowserSessionBeaconResponseSchema = z.object({
  accepted: z.boolean(),
  terminated: z.boolean(),
});

export const BrowserActionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
  needsConfirmation: z.boolean().optional(),
  confirmationRequiredFor: z.string().optional(),
});

export type BrowserTarget = z.infer<typeof BrowserTargetSchema>;
export type BrowserSessionStatus = z.infer<typeof BrowserSessionStatusSchema>;
export type BrowserSessionState = z.infer<typeof BrowserSessionStateSchema>;
export type DegreeNavigatorReadiness = z.infer<typeof DegreeNavigatorReadinessSchema>;
