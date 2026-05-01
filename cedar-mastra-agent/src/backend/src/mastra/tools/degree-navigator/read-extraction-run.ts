import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { getDegreeNavigatorExtractionRun } from '../../../degree-navigator/extractionRunRepository.js';
import {
  DegreeNavigatorExtractionRun,
  DegreeNavigatorExtractionRunSchema,
} from '../../../degree-navigator/schemas.js';

type RuntimeContextLike = {
  get: (key: string) => unknown;
};

type ReadDegreeNavigatorExtractionRunDeps = {
  getExtractionRun?: (userId: string, runId: string) => Promise<DegreeNavigatorExtractionRun | null>;
};

export const READ_DEGREE_NAVIGATOR_EXTRACTION_RUN_DESCRIPTION = `Read a temporary raw Degree Navigator extraction run for the authenticated user.
Use this when a sync prompt provides a runId. Inspect the evidence bundle, normalize it into the Degree Navigator capture schema, then call saveDegreeNavigatorProfile exactly once.`;

const ReadDegreeNavigatorExtractionRunInputSchema = z.object({
  runId: z.string().uuid(),
});

const ReadDegreeNavigatorExtractionRunOutputSchema = z.object({
  run: DegreeNavigatorExtractionRunSchema.nullable(),
});

function requireAuthenticatedUserId(runtimeContext: RuntimeContextLike): string {
  const authenticatedUserId = runtimeContext.get('authenticatedUserId');
  if (typeof authenticatedUserId === 'string' && authenticatedUserId.trim().length > 0) {
    return authenticatedUserId;
  }

  throw new Error('Missing authenticated user context for Degree Navigator extraction run read.');
}

export async function runReadDegreeNavigatorExtractionRun(
  context: z.infer<typeof ReadDegreeNavigatorExtractionRunInputSchema>,
  runtimeContext: RuntimeContextLike,
  deps: ReadDegreeNavigatorExtractionRunDeps = {},
) {
  const userId = requireAuthenticatedUserId(runtimeContext);
  const readRun = deps.getExtractionRun ?? getDegreeNavigatorExtractionRun;
  const run = await readRun(userId, context.runId);

  return { run };
}

export const readDegreeNavigatorExtractionRun = createTool({
  id: 'readDegreeNavigatorExtractionRun',
  description: READ_DEGREE_NAVIGATOR_EXTRACTION_RUN_DESCRIPTION,
  inputSchema: ReadDegreeNavigatorExtractionRunInputSchema,
  outputSchema: ReadDegreeNavigatorExtractionRunOutputSchema,
  execute: async ({ context, runtimeContext }) =>
    runReadDegreeNavigatorExtractionRun(context, runtimeContext as RuntimeContextLike),
});

export type ReadDegreeNavigatorExtractionRunOutput = z.infer<
  typeof ReadDegreeNavigatorExtractionRunOutputSchema
>;
