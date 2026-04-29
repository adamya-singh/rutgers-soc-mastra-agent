import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getDegreeNavigatorProfile } from '../../../degree-navigator/repository.js';
import {
  DegreeNavigatorProfileResponseSchema,
  DegreeNavigatorProfileRow,
} from '../../../degree-navigator/schemas.js';

type RuntimeContextLike = {
  get: (key: string) => unknown;
};

type ReadDegreeNavigatorProfileDeps = {
  getProfile?: (userId: string) => Promise<DegreeNavigatorProfileRow | null>;
};

export const READ_DEGREE_NAVIGATOR_PROFILE_DESCRIPTION = `Read the latest saved Degree Navigator profile for the authenticated user.
Use this before answering questions about the user's declared programs, completed courses, remaining requirements, possible requirement options, audit notes, GPA, credits, or transcript history. This is read-only and ownership comes from authenticated runtime context.`;

function requireAuthenticatedUserId(runtimeContext: RuntimeContextLike): string {
  const authenticatedUserId = runtimeContext.get('authenticatedUserId');
  if (typeof authenticatedUserId === 'string' && authenticatedUserId.trim().length > 0) {
    return authenticatedUserId;
  }

  throw new Error('Missing authenticated user context for Degree Navigator profile read.');
}

export async function runReadDegreeNavigatorProfile(
  _context: Record<string, never>,
  runtimeContext: RuntimeContextLike,
  deps: ReadDegreeNavigatorProfileDeps = {},
) {
  const userId = requireAuthenticatedUserId(runtimeContext);
  const readProfile = deps.getProfile ?? getDegreeNavigatorProfile;
  const profile = await readProfile(userId);

  return { profile };
}

export const readDegreeNavigatorProfile = createTool({
  id: 'readDegreeNavigatorProfile',
  description: READ_DEGREE_NAVIGATOR_PROFILE_DESCRIPTION,
  inputSchema: z.object({}),
  outputSchema: DegreeNavigatorProfileResponseSchema,
  execute: async ({ context, runtimeContext }) =>
    runReadDegreeNavigatorProfile(context, runtimeContext as RuntimeContextLike),
});

export type ReadDegreeNavigatorProfileOutput = z.infer<typeof DegreeNavigatorProfileResponseSchema>;
