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
  DegreeNavigatorRequirement,
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

function countCourseCodePlaceholderTitles(capture: DegreeNavigatorCapture): number {
  const courses = [
    ...capture.transcriptTerms.flatMap((term) => term.courses),
    ...capture.audits.flatMap((audit) => [
      ...audit.requirements.flatMap((requirement) => requirement.courses ?? []),
      ...(audit.unusedCourses ?? []),
    ]),
  ];

  return courses.filter((course) => course.title?.trim() === course.courseCode.trim()).length;
}

function hasConditionLikeText(values: Array<string | undefined>): boolean {
  return values.some((value) =>
    /\b(no more than|minimum grade|must achieve|required grade|grade equal to|may be used)\b/i.test(value ?? ''),
  );
}

function normalizeConditionLikeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isRuleCondition(value: string): boolean {
  return /\b(no more than|minimum grade|must achieve|required grade|grade equal to|may be used|residency|distinct and separate|cannot be used)\b/i.test(value);
}

function isLearningGoalOrAdvisingNote(value: string): boolean {
  return /\b(students will be able to|students will meet|students must meet|recommended|advising|learning goals?)\b/i.test(value);
}

function dedupeStrings(values: string[] | undefined): string[] | undefined {
  const deduped = [...new Map(
    (values ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => [normalizeConditionLikeText(value), value] as const),
  ).values()];
  return deduped.length > 0 ? deduped : undefined;
}

function splitRequirementNotesAndConditions(
  requirement: DegreeNavigatorRequirement,
): Pick<DegreeNavigatorRequirement, 'notes' | 'conditions'> {
  const notes = [...(requirement.notes ?? [])];
  const conditions: string[] = [];
  for (const condition of requirement.conditions ?? []) {
    if (isLearningGoalOrAdvisingNote(condition) && !isRuleCondition(condition)) {
      notes.push(condition);
    } else {
      conditions.push(condition);
    }
  }

  return {
    notes: dedupeStrings(notes),
    conditions: dedupeStrings(conditions),
  };
}

function normalizeRequirementOptions(requirement: DegreeNavigatorRequirement): DegreeNavigatorRequirement {
  const requirementOptions = requirement.requirementOptions ?? requirement.stillNeeded ?? [];
  const satisfiedCourseCodes = new Set(
    (requirement.courses ?? [])
      .filter((course) => course.status !== 'unused')
      .map((course) => course.courseCode),
  );
  const normalizedOptions = requirementOptions.map((option) => {
    const optionCodes = option.courseOptions ?? [];
    const completedCount = optionCodes.filter((code) => satisfiedCourseCodes.has(code)).length;
    const requiredCount = option.requiredCount ?? (optionCodes.length === 1 ? 1 : undefined);
    const neededCount = requiredCount !== undefined
      ? Math.max(requiredCount - completedCount, 0)
      : option.neededCount;
    return {
      ...option,
      ...(completedCount > 0 ? { completedCount } : {}),
      ...(neededCount !== undefined ? { neededCount } : {}),
    };
  });
  const hasSatisfiedOption = (option: typeof normalizedOptions[number]) =>
    (option.courseOptions ?? []).some((code) => satisfiedCourseCodes.has(code));
  const stillNeeded = requirement.status === 'complete'
    ? []
    : normalizedOptions.filter((option) => {
        if (option.neededCount !== undefined) return option.neededCount > 0;
        return !hasSatisfiedOption(option);
      });
  const splitFields = splitRequirementNotesAndConditions(requirement);

  return {
    ...requirement,
    ...splitFields,
    requirementOptions: normalizedOptions.length > 0 ? normalizedOptions : undefined,
    stillNeeded: stillNeeded.length > 0 ? stillNeeded : [],
  };
}

export function normalizeDegreeNavigatorCaptureForSave(capture: DegreeNavigatorCapture): DegreeNavigatorCapture {
  return {
    ...capture,
    audits: capture.audits.map((audit) => ({
      ...audit,
      requirements: audit.requirements.map(normalizeRequirementOptions),
    })),
  };
}

export function assertCompleteDegreeNavigatorProfileSave(capture: DegreeNavigatorCapture): void {
  const placeholderTitleCount = countCourseCodePlaceholderTitles(capture);
  if (placeholderTitleCount > 5) {
    throw new Error(
      `Refusing to save Degree Navigator profile with ${placeholderTitleCount} course-code placeholder titles after enrichment.`,
    );
  }

  const incompleteRequirementsMissingDetails = capture.audits
    .flatMap((audit) => audit.requirements)
    .filter((requirement) =>
      requirement.status === 'incomplete' &&
      requirement.summary === 'N/A' &&
      (requirement.stillNeeded?.length ?? 0) === 0 &&
      (requirement.notes?.length ?? 0) === 0,
    );

  if (incompleteRequirementsMissingDetails.length > 3) {
    throw new Error(
      `Refusing to save Degree Navigator profile with ${incompleteRequirementsMissingDetails.length} incomplete requirements missing details.`,
    );
  }

  const auditsWithUnassignedConditions = capture.audits.filter((audit) =>
    (audit.conditions?.length ?? 0) > 0 &&
    !audit.requirements.some((requirement) => (requirement.conditions?.length ?? 0) > 0),
  );
  if (auditsWithUnassignedConditions.length > 0) {
    throw new Error('Refusing to save Degree Navigator profile with audit conditions that were not copied to requirements.');
  }

  const requirementsWithMisplacedConditions = capture.audits
    .flatMap((audit) => audit.requirements)
    .filter((requirement) =>
      (requirement.conditions?.length ?? 0) === 0 &&
      hasConditionLikeText([requirement.summary, ...(requirement.notes ?? [])]),
    );
  if (requirementsWithMisplacedConditions.length > 0) {
    throw new Error('Refusing to save Degree Navigator profile with condition text outside requirement conditions.');
  }

  const requirementsWithNotesInConditions = capture.audits
    .flatMap((audit) => audit.requirements)
    .filter((requirement) =>
      (requirement.conditions ?? []).some((condition) =>
        isLearningGoalOrAdvisingNote(condition) && !isRuleCondition(condition),
      ),
    );
  if (requirementsWithNotesInConditions.length > 0) {
    throw new Error('Refusing to save Degree Navigator profile with advising or learning-goal notes in requirement conditions.');
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
  const normalizedCapture = normalizeDegreeNavigatorCaptureForSave(enrichedCapture);
  assertCompleteDegreeNavigatorProfileSave(normalizedCapture);
  const upsertProfile = deps.upsertProfile ?? upsertDegreeNavigatorProfile;
  const profile = await upsertProfile(userId, normalizedCapture);

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
