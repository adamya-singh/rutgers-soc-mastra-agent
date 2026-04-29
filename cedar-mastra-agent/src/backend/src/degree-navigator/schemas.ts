import { z } from 'zod';

export const DegreeNavigatorCourseStatusSchema = z.enum([
  'completed',
  'current',
  'planned',
  'ap',
  'placement',
  'unused',
  'unknown',
]);

export const DegreeNavigatorRequirementStatusSchema = z.enum([
  'complete',
  'projected',
  'in_progress',
  'incomplete',
  'unknown',
]);

export const DegreeNavigatorCourseRefSchema = z.object({
  courseCode: z.string().min(1),
  title: z.string().min(1).optional(),
  campus: z.string().min(1).optional(),
  credits: z.number().optional(),
  grade: z.string().min(1).optional(),
  status: DegreeNavigatorCourseStatusSchema.optional(),
  specialCode: z.string().min(1).optional(),
  repeatedCourseCode: z.string().min(1).optional(),
  usedAs: z.string().min(1).optional(),
  termLabel: z.string().min(1).optional(),
  rawText: z.string().min(1).optional(),
});

export const DegreeNavigatorProfileSchema = z.object({
  name: z.string().min(1).optional(),
  ruid: z.string().min(1).optional(),
  netid: z.string().min(1).optional(),
  school: z.object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  }).optional(),
  declaredGraduation: z.object({
    year: z.string().min(1).optional(),
    month: z.string().min(1).optional(),
  }).optional(),
  degreeCreditsEarned: z.number().optional(),
  cumulativeGpa: z.number().optional(),
  plannedCourseCount: z.number().int().optional(),
});

export const DegreeNavigatorProgramSchema = z.object({
  code: z.string().min(1).optional(),
  title: z.string().min(1),
  campus: z.string().min(1).optional(),
  kind: z.enum(['core', 'major', 'minor', 'certificate', 'other']).optional(),
});

export const DegreeNavigatorRequirementSchema: z.ZodType<{
  code?: string;
  title: string;
  status?: z.infer<typeof DegreeNavigatorRequirementStatusSchema>;
  summary?: string;
  completedCount?: number;
  totalCount?: number;
  neededCount?: number;
  courses?: z.infer<typeof DegreeNavigatorCourseRefSchema>[];
  stillNeeded?: Array<{
    label: string;
    courseOptions?: string[];
  }>;
  notes?: string[];
}> = z.object({
  code: z.string().min(1).optional(),
  title: z.string().min(1),
  status: DegreeNavigatorRequirementStatusSchema.optional(),
  summary: z.string().min(1).optional(),
  completedCount: z.number().int().optional(),
  totalCount: z.number().int().optional(),
  neededCount: z.number().int().optional(),
  courses: z.array(DegreeNavigatorCourseRefSchema).optional(),
  stillNeeded: z.array(z.object({
    label: z.string().min(1),
    courseOptions: z.array(z.string().min(1)).optional(),
  })).optional(),
  notes: z.array(z.string().min(1)).optional(),
});

export const DegreeNavigatorAuditSchema = z.object({
  programCode: z.string().min(1).optional(),
  title: z.string().min(1),
  versionTerm: z.string().min(1).optional(),
  completedCredits: z.number().nullable().optional(),
  completedRequirements: z.object({
    completed: z.number().int(),
    total: z.number().int(),
  }).optional(),
  overallStatus: z.string().min(1).optional(),
  gpa: z.object({
    label: z.string().min(1).optional(),
    value: z.number().optional(),
    status: z.string().min(1).optional(),
    qualityPoints: z.number().optional(),
    credits: z.number().optional(),
  }).optional(),
  requirements: z.array(DegreeNavigatorRequirementSchema),
  conditions: z.array(z.string().min(1)).optional(),
  notes: z.array(z.string().min(1)).optional(),
  unusedCourses: z.array(DegreeNavigatorCourseRefSchema).optional(),
});

export const DegreeNavigatorTranscriptTermSchema = z.object({
  label: z.string().min(1),
  year: z.number().int().optional(),
  termName: z.string().min(1).optional(),
  termCode: z.string().min(1).optional(),
  source: z.enum(['transcript', 'ap_credit', 'placement', 'other']),
  courses: z.array(DegreeNavigatorCourseRefSchema),
});

export const DegreeNavigatorRunNotesSchema = z.object({
  capturedFrom: z.string().min(1).optional(),
  capturedAt: z.string().min(1).optional(),
  disclaimer: z.string().min(1).optional(),
  extractionWarnings: z.array(z.string().min(1)).optional(),
  unavailableRoutes: z.array(z.string().min(1)).optional(),
});

export const DegreeNavigatorCaptureSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  profile: DegreeNavigatorProfileSchema,
  programs: z.array(DegreeNavigatorProgramSchema).default([]),
  audits: z.array(DegreeNavigatorAuditSchema).default([]),
  transcriptTerms: z.array(DegreeNavigatorTranscriptTermSchema).default([]),
  runNotes: DegreeNavigatorRunNotesSchema.default({}),
  source: z.literal('degree_navigator').default('degree_navigator'),
  sourceSessionId: z.string().min(1).optional(),
  capturedAt: z.string().datetime().optional(),
});

export const DegreeNavigatorCaptureInputSchema = DegreeNavigatorCaptureSchema.omit({
  schemaVersion: true,
  source: true,
});

export const DegreeNavigatorProfileRowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  schemaVersion: z.number().int(),
  studentName: z.string().nullable(),
  ruid: z.string().nullable(),
  netid: z.string().nullable(),
  schoolCode: z.string().nullable(),
  schoolName: z.string().nullable(),
  graduationYear: z.string().nullable(),
  graduationMonth: z.string().nullable(),
  degreeCreditsEarned: z.number().nullable(),
  cumulativeGpa: z.number().nullable(),
  plannedCourseCount: z.number().int().nullable(),
  profile: DegreeNavigatorProfileSchema,
  programs: z.array(DegreeNavigatorProgramSchema),
  audits: z.array(DegreeNavigatorAuditSchema),
  transcriptTerms: z.array(DegreeNavigatorTranscriptTermSchema),
  runNotes: DegreeNavigatorRunNotesSchema,
  source: z.literal('degree_navigator'),
  sourceSessionId: z.string().nullable(),
  capturedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const UpsertDegreeNavigatorProfileRequestSchema = DegreeNavigatorCaptureSchema;

export const DegreeNavigatorProfileResponseSchema = z.object({
  profile: DegreeNavigatorProfileRowSchema.nullable(),
});

export type DegreeNavigatorCourseRef = z.infer<typeof DegreeNavigatorCourseRefSchema>;
export type DegreeNavigatorProfile = z.infer<typeof DegreeNavigatorProfileSchema>;
export type DegreeNavigatorProgram = z.infer<typeof DegreeNavigatorProgramSchema>;
export type DegreeNavigatorRequirement = z.infer<typeof DegreeNavigatorRequirementSchema>;
export type DegreeNavigatorAudit = z.infer<typeof DegreeNavigatorAuditSchema>;
export type DegreeNavigatorTranscriptTerm = z.infer<typeof DegreeNavigatorTranscriptTermSchema>;
export type DegreeNavigatorRunNotes = z.infer<typeof DegreeNavigatorRunNotesSchema>;
export type DegreeNavigatorCapture = z.infer<typeof DegreeNavigatorCaptureSchema>;
export type DegreeNavigatorCaptureInput = z.infer<typeof DegreeNavigatorCaptureInputSchema>;
export type DegreeNavigatorProfileRow = z.infer<typeof DegreeNavigatorProfileRowSchema>;
