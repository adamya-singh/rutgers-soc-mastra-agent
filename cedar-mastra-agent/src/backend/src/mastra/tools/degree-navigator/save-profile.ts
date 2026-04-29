import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { extractBrowserSessionIdFromAdditionalContext } from '../../../browser/runtimeContext.js';
import { upsertDegreeNavigatorProfile } from '../../../degree-navigator/repository.js';
import {
  DegreeNavigatorCapture,
  DegreeNavigatorCaptureSchema,
  DegreeNavigatorProfileResponseSchema,
  DegreeNavigatorProfileRowSchema,
  DegreeNavigatorProfileRow,
} from '../../../degree-navigator/schemas.js';

type RuntimeContextLike = {
  get: (key: string) => unknown;
};

type SaveDegreeNavigatorProfileDeps = {
  upsertProfile?: (
    userId: string,
    input: DegreeNavigatorCapture,
  ) => Promise<DegreeNavigatorProfileRow>;
};

export const SAVE_DEGREE_NAVIGATOR_PROFILE_DESCRIPTION = `Save a validated Degree Navigator capture for the authenticated user.
Use after extracting and normalizing the student's Degree Navigator information. Do not include or infer a user id; ownership comes from authenticated runtime context.`;

function requireAuthenticatedUserId(runtimeContext: RuntimeContextLike): string {
  const authenticatedUserId = runtimeContext.get('authenticatedUserId');
  if (typeof authenticatedUserId === 'string' && authenticatedUserId.trim().length > 0) {
    return authenticatedUserId;
  }

  throw new Error('Missing authenticated user context for Degree Navigator profile save.');
}

export async function runSaveDegreeNavigatorProfile(
  context: DegreeNavigatorCapture,
  runtimeContext: RuntimeContextLike,
  deps: SaveDegreeNavigatorProfileDeps = {},
) {
  const userId = requireAuthenticatedUserId(runtimeContext);
  const additionalContext = runtimeContext.get('additionalContext');
  const runtimeSessionId = extractBrowserSessionIdFromAdditionalContext(additionalContext);
  const capture = DegreeNavigatorCaptureSchema.parse({
    ...context,
    sourceSessionId: runtimeSessionId ?? context.sourceSessionId,
  });
  const upsertProfile = deps.upsertProfile ?? upsertDegreeNavigatorProfile;
  const profile = await upsertProfile(userId, capture);

  return { profile };
}

export const saveDegreeNavigatorProfile = createTool({
  id: 'saveDegreeNavigatorProfile',
  description: SAVE_DEGREE_NAVIGATOR_PROFILE_DESCRIPTION,
  inputSchema: DegreeNavigatorCaptureSchema,
  outputSchema: z.object({ profile: DegreeNavigatorProfileRowSchema }),
  execute: async ({ context, runtimeContext }) =>
    runSaveDegreeNavigatorProfile(context, runtimeContext as RuntimeContextLike),
});

export type SaveDegreeNavigatorProfileOutput = z.infer<typeof DegreeNavigatorProfileResponseSchema>;
