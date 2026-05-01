import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { extractBrowserSessionIdFromAdditionalContext } from '../../../browser/runtimeContext.js';
import { enrichDegreeNavigatorCourseTitles } from '../../../degree-navigator/courseTitleEnrichment.js';
import { upsertDegreeNavigatorProfile } from '../../../degree-navigator/repository.js';
import {
  DegreeNavigatorCapture,
  DegreeNavigatorCaptureInput,
  DegreeNavigatorCaptureInputSchema,
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
  enrichCapture?: (input: DegreeNavigatorCapture) => Promise<DegreeNavigatorCapture>;
};

export const SAVE_DEGREE_NAVIGATOR_PROFILE_DESCRIPTION = `Save a validated Degree Navigator capture for the authenticated user.
Use after extracting and normalizing the student's Degree Navigator information. Do not include or infer a user id; ownership comes from authenticated runtime context.`;

export function assertSafeDegreeNavigatorProfileSave(capture: DegreeNavigatorCapture): void {
  const transcriptCourseCount = capture.transcriptTerms.reduce(
    (sum, term) => sum + term.courses.length,
    0,
  );
  const studentName = capture.profile.name?.trim() ?? '';
  const netid = capture.profile.netid?.trim() ?? '';

  if (capture.programs.length > 15) {
    throw new Error(
      `Refusing to save Degree Navigator profile with ${capture.programs.length} programs; expected no more than 15.`,
    );
  }

  if (transcriptCourseCount > 150) {
    throw new Error(
      `Refusing to save Degree Navigator profile with ${transcriptCourseCount} transcript courses; expected no more than 150.`,
    );
  }

  if (/^RUID\s*:/i.test(studentName)) {
    throw new Error('Refusing to save Degree Navigator profile with a malformed student name.');
  }

  if (netid === ':') {
    throw new Error('Refusing to save Degree Navigator profile with a malformed NetID.');
  }
}

function requireAuthenticatedUserId(runtimeContext: RuntimeContextLike): string {
  const authenticatedUserId = runtimeContext.get('authenticatedUserId');
  if (typeof authenticatedUserId === 'string' && authenticatedUserId.trim().length > 0) {
    return authenticatedUserId;
  }

  throw new Error('Missing authenticated user context for Degree Navigator profile save.');
}

export async function runSaveDegreeNavigatorProfile(
  context: DegreeNavigatorCaptureInput,
  runtimeContext: RuntimeContextLike,
  deps: SaveDegreeNavigatorProfileDeps = {},
) {
  const userId = requireAuthenticatedUserId(runtimeContext);
  const additionalContext = runtimeContext.get('additionalContext');
  const runtimeSessionId = extractBrowserSessionIdFromAdditionalContext(additionalContext);
  const capture = DegreeNavigatorCaptureSchema.parse({
    ...context,
    schemaVersion: 1,
    source: 'degree_navigator',
    sourceSessionId: runtimeSessionId ?? context.sourceSessionId,
  });
  assertSafeDegreeNavigatorProfileSave(capture);
  const enrichCapture = deps.enrichCapture ?? enrichDegreeNavigatorCourseTitles;
  const enrichedCapture = await enrichCapture(capture);
  const upsertProfile = deps.upsertProfile ?? upsertDegreeNavigatorProfile;
  const profile = await upsertProfile(userId, enrichedCapture);

  return { profile };
}

export const saveDegreeNavigatorProfile = createTool({
  id: 'saveDegreeNavigatorProfile',
  description: SAVE_DEGREE_NAVIGATOR_PROFILE_DESCRIPTION,
  inputSchema: DegreeNavigatorCaptureInputSchema,
  outputSchema: z.object({ profile: DegreeNavigatorProfileRowSchema }),
  execute: async ({ context, runtimeContext }) =>
    runSaveDegreeNavigatorProfile(context, runtimeContext as RuntimeContextLike),
});

export type SaveDegreeNavigatorProfileOutput = z.infer<typeof DegreeNavigatorProfileResponseSchema>;
