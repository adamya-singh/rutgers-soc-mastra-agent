import type { ScheduleSnapshot } from '@/lib/scheduleStorage';
import { resolveTermLabel } from '@/lib/scheduleStorage';
import type {
  AcademicPlanGraph,
  CourseStatus,
  PlanEdge,
  PlanNode,
  RequirementStatus,
} from './types';

/**
 * The frontend doesn't import backend code, so we mirror the wire shape of
 * the Degree Navigator capture here. Mirrors
 * cedar-mastra-agent/src/backend/src/degree-navigator/schemas.ts.
 */
export type DnCourseRef = {
  courseCode: string;
  title?: string;
  campus?: string;
  credits?: number;
  grade?: string;
  status?:
    | 'completed'
    | 'current'
    | 'planned'
    | 'ap'
    | 'placement'
    | 'unused'
    | 'unknown';
  specialCode?: string;
  repeatedCourseCode?: string;
  usedAs?: string;
  termLabel?: string;
  rawText?: string;
};

export type DnRequirement = {
  code?: string;
  title: string;
  status?: RequirementStatus;
  summary?: string;
  completedCount?: number;
  totalCount?: number;
  neededCount?: number;
  courses?: DnCourseRef[];
  stillNeeded?: Array<{
    label: string;
    courseOptions?: string[];
  }>;
  notes?: string[];
};

export type DnAudit = {
  programCode?: string;
  title: string;
  versionTerm?: string;
  completedCredits?: number | null;
  completedRequirements?: { completed: number; total: number };
  overallStatus?: string;
  gpa?: {
    label?: string;
    value?: number;
    status?: string;
    qualityPoints?: number;
    credits?: number;
  };
  requirements: DnRequirement[];
  conditions?: string[];
  notes?: string[];
  unusedCourses?: DnCourseRef[];
};

export type DnTranscriptTerm = {
  label: string;
  year?: number;
  termName?: string;
  termCode?: string;
  source: 'transcript' | 'ap_credit' | 'placement' | 'other';
  courses: DnCourseRef[];
};

export type DnProgram = {
  code?: string;
  title: string;
  campus?: string;
  kind?: 'core' | 'major' | 'minor' | 'certificate' | 'other';
};

export type DnCapture = {
  profile?: {
    name?: string;
    ruid?: string;
    netid?: string;
    school?: { code?: string; name?: string };
    declaredGraduation?: { year?: string; month?: string };
    degreeCreditsEarned?: number;
    cumulativeGpa?: number;
    plannedCourseCount?: number;
  };
  programs: DnProgram[];
  audits: DnAudit[];
  transcriptTerms: DnTranscriptTerm[];
  capturedAt?: string;
};

/* -------------------------------------------------------------------------- */
/*  Term parsing                                                              */
/* -------------------------------------------------------------------------- */

const TERM_NAME_TO_KEY: Record<string, number> = {
  winter: 0.0,
  spring: 0.1,
  summer: 0.7,
  fall: 0.9,
};

const TERM_CODE_TO_KEY: Record<string, number> = {
  '0': 0.0,
  '1': 0.1,
  '7': 0.7,
  '9': 0.9,
};

const slugifyCourseCode = (code: string) =>
  code.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

type TermInfo = { id: string; label: string; key: number; year: number; isPlanned: boolean };

const parseTermLabel = (label: string): TermInfo | null => {
  const match = label.match(/(winter|spring|summer|fall)\s+(\d{4})/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const year = Number(match[2]);
  const seasonKey = TERM_NAME_TO_KEY[name] ?? 0.5;
  const key = year + seasonKey;
  return {
    id: `term-${name}-${year}`,
    label: `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`,
    key,
    year,
    isPlanned: false,
  };
};

const termFromCode = (
  termCode: string,
  termYear: number,
): TermInfo => {
  const seasonKey = TERM_CODE_TO_KEY[termCode] ?? 0.5;
  const labelPrefix = resolveTermLabel(termCode);
  const slug = labelPrefix.toLowerCase();
  return {
    id: `term-${slug}-${termYear}`,
    label: `${labelPrefix} ${termYear}`,
    key: termYear + seasonKey,
    year: termYear,
    isPlanned: false,
  };
};

/* -------------------------------------------------------------------------- */
/*  Status mapping                                                            */
/* -------------------------------------------------------------------------- */

const mapCourseStatus = (
  status?: DnCourseRef['status'],
  grade?: string,
): CourseStatus => {
  if (status === 'completed') return 'completed';
  if (status === 'current' || status === 'planned') {
    return status === 'current' ? 'in_progress' : 'planned';
  }
  if (status === 'unused') return 'unmet';
  if (grade && grade.trim().length > 0) return 'completed';
  return 'unknown';
};

const safeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
};

/* -------------------------------------------------------------------------- */
/*  Builder                                                                   */
/* -------------------------------------------------------------------------- */

export type BuildFromExistingArgs = {
  capture?: DnCapture | null;
  schedule?: ScheduleSnapshot | null;
};

/**
 * Derive an AcademicPlanGraph from existing degree-navigator capture data
 * and the active schedule snapshot. The graph is intentionally permissive:
 * missing inputs simply produce a smaller graph.
 */
export function buildPlanGraphFromExisting(
  args: BuildFromExistingArgs,
): AcademicPlanGraph {
  const nodes: PlanNode[] = [];
  const edges: PlanEdge[] = [];
  let edgeCounter = 0;
  const seenNodeIds = new Set<string>();
  const termsById = new Map<string, TermInfo>();

  const addNode = (node: PlanNode) => {
    if (seenNodeIds.has(node.id)) return;
    seenNodeIds.add(node.id);
    nodes.push(node);
  };

  const addEdge = (
    from: string,
    to: string,
    kind: PlanEdge['kind'],
    label?: string,
  ) => {
    if (from === to) return;
    edgeCounter += 1;
    edges.push({ id: `e-${edgeCounter}`, from, to, kind, label });
  };

  const ensureTerm = (info: TermInfo) => {
    if (!termsById.has(info.id)) {
      termsById.set(info.id, info);
      addNode({
        id: info.id,
        kind: 'term',
        label: info.label,
        data: {
          termKey: info.key,
          termYear: info.year,
          termLabel: info.label,
          isPlanned: info.isPlanned,
        },
      });
    } else if (info.isPlanned) {
      const existing = termsById.get(info.id)!;
      existing.isPlanned = existing.isPlanned || info.isPlanned;
    }
    return termsById.get(info.id)!;
  };

  const ensureCourseNode = (
    course: DnCourseRef,
    options: { fallbackTermLabel?: string } = {},
  ): string => {
    const id = `course-${slugifyCourseCode(course.courseCode)}`;
    if (!seenNodeIds.has(id)) {
      addNode({
        id,
        kind: 'course',
        label: course.title
          ? `${course.courseCode} ${course.title}`
          : course.courseCode,
        data: {
          courseCode: course.courseCode,
          title: course.title,
          credits: safeNumber(course.credits),
          status: mapCourseStatus(course.status, course.grade),
          grade: course.grade,
          termLabel: course.termLabel ?? options.fallbackTermLabel,
        },
      });
    }
    return id;
  };

  const rootIds: string[] = [];

  /* ------------------------------ Degree audits ----------------------------- */
  const capture = args.capture ?? null;
  if (capture) {
    const programByCode = new Map<string, string>();
    for (const program of capture.programs ?? []) {
      const id = `prog-${slugifyCourseCode(program.code ?? program.title)}`;
      addNode({
        id,
        kind: 'program',
        label: program.title,
        data: {
          programCode: program.code,
          kind: program.kind,
          campus: program.campus,
        },
      });
      rootIds.push(id);
      if (program.code) programByCode.set(program.code, id);
    }

    capture.audits?.forEach((audit, auditIndex) => {
      const auditKey = audit.programCode ?? audit.title;
      let programId = audit.programCode
        ? programByCode.get(audit.programCode)
        : undefined;
      if (!programId) {
        programId = `prog-${slugifyCourseCode(auditKey)}-audit-${auditIndex}`;
        addNode({
          id: programId,
          kind: 'program',
          label: audit.title,
          data: {
            programCode: audit.programCode,
            versionTerm: audit.versionTerm,
            overallStatus: audit.overallStatus,
            gpa: audit.gpa?.value,
          },
        });
        rootIds.push(programId);
      } else {
        const existing = nodes.find((node) => node.id === programId);
        if (existing && existing.kind === 'program') {
          existing.data = {
            ...(existing.data ?? {}),
            versionTerm: audit.versionTerm,
            overallStatus: audit.overallStatus,
            gpa: audit.gpa?.value,
          } as PlanNode<'program'>['data'];
        }
      }

      audit.requirements.forEach((req, reqIndex) => {
        const reqId = `req-${slugifyCourseCode(`${auditKey}-${req.code ?? req.title}-${reqIndex}`)}`;
        addNode({
          id: reqId,
          kind: 'requirement',
          label: req.title,
          data: {
            status: req.status,
            summary: req.summary,
            completedCount: req.completedCount,
            totalCount: req.totalCount,
            neededCount: req.neededCount,
          },
        });
        addEdge(programId!, reqId, 'contains');

        for (const course of req.courses ?? []) {
          const courseId = ensureCourseNode(course);
          addEdge(reqId, courseId, 'satisfies');
          if (course.termLabel) {
            const termInfo = parseTermLabel(course.termLabel);
            if (termInfo) {
              ensureTerm(termInfo);
              addEdge(courseId, termInfo.id, 'planned_in');
            }
          }
        }

        (req.stillNeeded ?? []).forEach((needed, neededIndex) => {
          const options = needed.courseOptions ?? [];
          if (options.length === 0) {
            const noteId = `note-${reqId}-need-${neededIndex}`;
            addNode({
              id: noteId,
              kind: 'note',
              label: needed.label,
              data: { body: needed.label, severity: 'info', source: 'system' },
            });
            addEdge(reqId, noteId, 'contains', 'still needed');
            return;
          }
          const placeholderCourses = options.map((code) =>
            ensureCourseNode(
              {
                courseCode: code,
                status: 'planned',
              },
              {},
            ),
          );
          for (const id of placeholderCourses) {
            addEdge(reqId, id, 'satisfies', 'still needed');
          }
          if (placeholderCourses.length > 1) {
            for (let i = 0; i < placeholderCourses.length - 1; i += 1) {
              addEdge(
                placeholderCourses[i],
                placeholderCourses[i + 1],
                'alternative_to',
              );
            }
          }
        });
      });
    });
  }

  /* ----------------------------- Transcript terms --------------------------- */
  for (const transcriptTerm of capture?.transcriptTerms ?? []) {
    const termInfo =
      parseTermLabel(transcriptTerm.label) ??
      (transcriptTerm.termCode && transcriptTerm.year
        ? termFromCode(transcriptTerm.termCode, transcriptTerm.year)
        : null);
    if (!termInfo) continue;
    ensureTerm(termInfo);
    for (const course of transcriptTerm.courses ?? []) {
      const courseId = ensureCourseNode(course, {
        fallbackTermLabel: transcriptTerm.label,
      });
      addEdge(courseId, termInfo.id, 'planned_in');
    }
  }

  /* -------------------------------- Schedule -------------------------------- */
  const schedule = args.schedule ?? null;
  if (schedule && schedule.sections.length > 0) {
    const termInfo = termFromCode(schedule.termCode, schedule.termYear);
    termInfo.isPlanned = true;
    ensureTerm(termInfo);

    for (const section of schedule.sections) {
      const courseCode = section.courseString ?? section.indexNumber;
      const sectionId = `section-${section.indexNumber}`;
      addNode({
        id: sectionId,
        kind: 'section',
        label: section.courseString
          ? `${section.courseString}${section.sectionNumber ? `-${section.sectionNumber}` : ''}`
          : `Section ${section.indexNumber}`,
        data: {
          indexNumber: section.indexNumber,
          sectionNumber: section.sectionNumber,
          instructors: section.instructors,
          isOnline: section.isOnline,
          campus: section.meetingTimes?.[0]?.campus ?? null,
        },
      });

      const courseId = ensureCourseNode({
        courseCode,
        title: section.courseTitle ?? undefined,
        credits: safeNumber(section.credits),
        status: 'planned',
        termLabel: termInfo.label,
      });
      addEdge(courseId, sectionId, 'contains', 'section');
      addEdge(sectionId, termInfo.id, 'planned_in');
      addEdge(courseId, termInfo.id, 'planned_in');
    }
  }

  return {
    version: 1,
    nodes,
    edges,
    rootIds,
    meta: {
      title: capture?.profile?.name
        ? `Plan for ${capture.profile.name}`
        : 'Derived plan',
      capturedAt: capture?.capturedAt ?? new Date().toISOString(),
      source: 'derived',
    },
  };
}
