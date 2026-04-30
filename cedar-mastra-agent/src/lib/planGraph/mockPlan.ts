import type {
  AcademicPlanGraph,
  PlanEdge,
  PlanNode,
} from './types';

/**
 * Hand-crafted demo graph that mirrors the example student in
 * DEGREE_NAVIGATOR_DOCUMENTATION.md so the UI can be exercised before any
 * agent or backend integration. Includes:
 *   - Three programs (SAS Core, Data Science option, CS BS)
 *   - Selected requirements with applied + still-needed courses
 *   - Term nodes for past, current, and planned semesters
 *   - A few prerequisite edges, a recommendation, and a warning
 *
 * The graph deliberately reuses course nodes across programs so the UI can
 * exercise the DAG (a single course satisfies multiple requirements).
 */

type CourseSeed = {
  code: string;
  title: string;
  credits: number;
  status: 'completed' | 'in_progress' | 'planned' | 'recommended';
  grade?: string;
  termId?: string;
};

const program = (
  id: string,
  label: string,
  data: PlanNode<'program'>['data'],
): PlanNode<'program'> => ({ id, kind: 'program', label, data });

const requirement = (
  id: string,
  label: string,
  data: PlanNode<'requirement'>['data'],
): PlanNode<'requirement'> => ({ id, kind: 'requirement', label, data });

const course = (id: string, seed: CourseSeed): PlanNode<'course'> => ({
  id,
  kind: 'course',
  label: `${seed.code} ${seed.title}`,
  data: {
    courseCode: seed.code,
    title: seed.title,
    credits: seed.credits,
    status: seed.status,
    grade: seed.grade,
    termLabel: seed.termId,
  },
});

const term = (
  id: string,
  label: string,
  termKey: number,
  options: { isPlanned?: boolean } = {},
): PlanNode<'term'> => ({
  id,
  kind: 'term',
  label,
  data: { termKey, termLabel: label, isPlanned: options.isPlanned ?? false },
});

const annotation = (
  id: string,
  kind: 'note' | 'recommendation' | 'warning' | 'goal',
  label: string,
  body: string,
  severity: 'info' | 'warn' | 'critical' = 'info',
): PlanNode<'note' | 'recommendation' | 'warning' | 'goal'> => ({
  id,
  kind,
  label,
  data: { body, severity, source: 'agent' },
});

const edge = (
  id: string,
  from: string,
  to: string,
  kind: PlanEdge['kind'],
  label?: string,
): PlanEdge => ({ id, from, to, kind, label });

const TERMS = {
  fa23: term('term-fa23', 'Fall 2023', 2023.9),
  sp24: term('term-sp24', 'Spring 2024', 2024.1),
  fa24: term('term-fa24', 'Fall 2024', 2024.9),
  sp25: term('term-sp25', 'Spring 2025', 2025.1),
  fa25: term('term-fa25', 'Fall 2025', 2025.9),
  sp26: term('term-sp26', 'Spring 2026', 2026.1),
  fa26: term('term-fa26', 'Fall 2026', 2026.9, { isPlanned: true }),
  sp27: term('term-sp27', 'Spring 2027', 2027.1, { isPlanned: true }),
} as const;

const COURSES: Record<string, PlanNode<'course'>> = {
  cs111: course('course-cs111', {
    code: '01:198:111',
    title: 'Introduction to Computer Science',
    credits: 4,
    status: 'completed',
    grade: 'A',
    termId: 'Fall 2023',
  }),
  cs112: course('course-cs112', {
    code: '01:198:112',
    title: 'Data Structures',
    credits: 4,
    status: 'completed',
    grade: 'B+',
    termId: 'Spring 2024',
  }),
  cs205: course('course-cs205', {
    code: '01:198:205',
    title: 'Introduction to Discrete Structures',
    credits: 4,
    status: 'completed',
    grade: 'A',
    termId: 'Fall 2024',
  }),
  cs206: course('course-cs206', {
    code: '01:198:206',
    title: 'Introduction to Discrete Structures II',
    credits: 4,
    status: 'completed',
    grade: 'A',
    termId: 'Spring 2025',
  }),
  cs211: course('course-cs211', {
    code: '01:198:211',
    title: 'Computer Architecture',
    credits: 4,
    status: 'completed',
    grade: 'A',
    termId: 'Fall 2024',
  }),
  cs213: course('course-cs213', {
    code: '01:198:213',
    title: 'Software Methodology',
    credits: 4,
    status: 'in_progress',
    termId: 'Spring 2026',
  }),
  cs336: course('course-cs336', {
    code: '01:198:336',
    title: 'Principles of Information and Data Management',
    credits: 4,
    status: 'in_progress',
    termId: 'Spring 2026',
  }),
  cs344: course('course-cs344', {
    code: '01:198:344',
    title: 'Design and Analysis of Computer Algorithms',
    credits: 4,
    status: 'completed',
    grade: 'A',
    termId: 'Fall 2025',
  }),
  cs439: course('course-cs439', {
    code: '01:198:439',
    title: 'Introduction to Data Science',
    credits: 4,
    status: 'completed',
    grade: 'A',
    termId: 'Spring 2025',
  }),
  cs440: course('course-cs440', {
    code: '01:198:440',
    title: 'Introduction to Artificial Intelligence',
    credits: 4,
    status: 'completed',
    grade: 'A',
    termId: 'Fall 2025',
  }),
  cs461: course('course-cs461', {
    code: '01:198:461',
    title: 'Machine Learning',
    credits: 4,
    status: 'recommended',
  }),
  cs462: course('course-cs462', {
    code: '01:198:462',
    title: 'Deep Learning',
    credits: 4,
    status: 'recommended',
  }),
  ds210: course('course-ds210', {
    code: '01:198:210',
    title: 'Data Management for Data Science',
    credits: 4,
    status: 'completed',
    grade: 'B',
    termId: 'Fall 2025',
  }),
  data101: course('course-data101', {
    code: '01:198:142',
    title: 'Data 101',
    credits: 4,
    status: 'completed',
    grade: 'B+',
    termId: 'Spring 2024',
  }),
  calc1: course('course-calc1', {
    code: '01:640:151',
    title: 'Calculus I',
    credits: 4,
    status: 'completed',
    grade: 'C+',
    termId: 'Fall 2023',
  }),
  calc2: course('course-calc2', {
    code: '01:640:152',
    title: 'Calculus II',
    credits: 4,
    status: 'completed',
    grade: 'C',
    termId: 'Spring 2024',
  }),
  calc3: course('course-calc3', {
    code: '01:640:251',
    title: 'Multivariable Calculus',
    credits: 4,
    status: 'recommended',
  }),
  linalg: course('course-linalg', {
    code: '01:640:250',
    title: 'Introductory Linear Algebra',
    credits: 3,
    status: 'completed',
    grade: 'A',
    termId: 'Spring 2025',
  }),
  stat212: course('course-stat212', {
    code: '01:960:212',
    title: 'Statistics II',
    credits: 3,
    status: 'completed',
    grade: 'A',
    termId: 'Spring 2025',
  }),
  stat463: course('course-stat463', {
    code: '01:960:463',
    title: 'Regression Methods',
    credits: 3,
    status: 'planned',
    termId: 'Fall 2026',
  }),
  stat486: course('course-stat486', {
    code: '01:960:486',
    title: 'Applied Statistical Learning',
    credits: 3,
    status: 'planned',
    termId: 'Fall 2026',
  }),
  infovis: course('course-infovis', {
    code: '04:547:321',
    title: 'Information Visualization',
    credits: 3,
    status: 'planned',
    termId: 'Fall 2026',
  }),
  dataInContext: course('course-data-context', {
    code: '04:547:225',
    title: 'Data In Context',
    credits: 3,
    status: 'planned',
    termId: 'Fall 2026',
  }),
};

const REQUIREMENTS = {
  csCore: requirement('req-cs-core', 'CS Core', {
    status: 'complete',
    completedCount: 6,
    totalCount: 6,
  }),
  csElectives: requirement('req-cs-electives', 'CS Electives', {
    status: 'projected',
    completedCount: 7,
    totalCount: 7,
  }),
  csMath: requirement('req-cs-math', 'CS Mathematics Core', {
    status: 'complete',
    completedCount: 3,
    totalCount: 3,
  }),
  dsFoundational: requirement(
    'req-ds-foundational',
    'Data Science Foundational',
    { status: 'projected', completedCount: 7, totalCount: 7 },
  ),
  dsTrack: requirement('req-ds-track', 'Data Science CS Track', {
    status: 'in_progress',
    completedCount: 9,
    totalCount: 11,
    neededCount: 2,
    summary: 'Need Multivariable Calculus and Machine Learning/Deep Learning',
  }),
};

const PROGRAMS = {
  csBs: program('prog-cs-bs', 'B.S. Computer Science (NB)', {
    programCode: 'NB198SJ',
    kind: 'major',
    campus: 'NB',
    versionTerm: 'Fall 2011',
    overallStatus: 'Complete or projected complete',
    gpa: 3.431,
  }),
  dsBs: program('prog-ds-bs', 'B.S. Data Science - CS Option (NB)', {
    programCode: 'NB219SJ',
    kind: 'major',
    campus: 'NB',
    versionTerm: 'Spring 2024',
    overallStatus: 'CS track needs 2 more courses',
    gpa: 3.476,
  }),
};

const ANNOTATIONS = {
  recCalc3: annotation(
    'rec-calc3',
    'recommendation',
    'Take Multivariable Calculus next',
    'Required for the Data Science CS track. Spring 2027 is the latest you can take it without delaying graduation.',
    'info',
  ),
  recMl: annotation(
    'rec-ml',
    'recommendation',
    'Pick one: Machine Learning or Deep Learning',
    'Either 01:198:461 (Machine Learning) or 01:198:462 (Deep Learning) closes the last DS CS track requirement.',
    'info',
  ),
  warnFa26Load: annotation(
    'warn-fa26',
    'warning',
    'Fall 2026 is heavy (16 credits + lab)',
    'Four upper-division STEM courses plus a lab. Consider moving Data In Context to Spring 2027.',
    'warn',
  ),
};

export function buildMockPlanGraph(): AcademicPlanGraph {
  const nodes: PlanNode[] = [
    ...Object.values(TERMS),
    ...Object.values(PROGRAMS),
    ...Object.values(REQUIREMENTS),
    ...Object.values(COURSES),
    ...Object.values(ANNOTATIONS),
  ];

  const edges: PlanEdge[] = [];
  let edgeCounter = 0;
  const addEdge = (
    from: string,
    to: string,
    kind: PlanEdge['kind'],
    label?: string,
  ) => {
    edgeCounter += 1;
    edges.push(edge(`e-${edgeCounter}`, from, to, kind, label));
  };

  // CS BS structure ---------------------------------------------------------
  addEdge(PROGRAMS.csBs.id, REQUIREMENTS.csCore.id, 'contains');
  addEdge(PROGRAMS.csBs.id, REQUIREMENTS.csElectives.id, 'contains');
  addEdge(PROGRAMS.csBs.id, REQUIREMENTS.csMath.id, 'contains');

  for (const c of [
    COURSES.cs111,
    COURSES.cs112,
    COURSES.cs205,
    COURSES.cs206,
    COURSES.cs211,
    COURSES.cs344,
  ]) {
    addEdge(REQUIREMENTS.csCore.id, c.id, 'satisfies');
  }
  for (const c of [
    COURSES.ds210,
    COURSES.cs213,
    COURSES.cs336,
    COURSES.cs439,
    COURSES.cs440,
    COURSES.stat463,
  ]) {
    addEdge(REQUIREMENTS.csElectives.id, c.id, 'satisfies');
  }
  for (const c of [COURSES.calc1, COURSES.calc2, COURSES.linalg]) {
    addEdge(REQUIREMENTS.csMath.id, c.id, 'satisfies');
  }

  // DS BS structure ---------------------------------------------------------
  addEdge(PROGRAMS.dsBs.id, REQUIREMENTS.dsFoundational.id, 'contains');
  addEdge(PROGRAMS.dsBs.id, REQUIREMENTS.dsTrack.id, 'contains');

  for (const c of [
    COURSES.data101,
    COURSES.ds210,
    COURSES.cs336,
    COURSES.calc1,
    COURSES.linalg,
    COURSES.stat212,
    COURSES.dataInContext,
  ]) {
    addEdge(REQUIREMENTS.dsFoundational.id, c.id, 'satisfies');
  }
  for (const c of [
    COURSES.cs111,
    COURSES.cs112,
    COURSES.cs205,
    COURSES.cs206,
    COURSES.cs439,
    COURSES.calc2,
    COURSES.stat463,
    COURSES.stat486,
    COURSES.infovis,
  ]) {
    addEdge(REQUIREMENTS.dsTrack.id, c.id, 'satisfies');
  }
  // Still-needed: Multivariable Calculus + ML or DL
  addEdge(REQUIREMENTS.dsTrack.id, COURSES.calc3.id, 'satisfies', 'still needed');
  addEdge(REQUIREMENTS.dsTrack.id, COURSES.cs461.id, 'satisfies', 'still needed (option)');
  addEdge(REQUIREMENTS.dsTrack.id, COURSES.cs462.id, 'satisfies', 'still needed (option)');
  addEdge(COURSES.cs461.id, COURSES.cs462.id, 'alternative_to');

  // Term placement ----------------------------------------------------------
  const termPlacements: Array<[PlanNode<'course'>, PlanNode<'term'>]> = [
    [COURSES.cs111, TERMS.fa23],
    [COURSES.calc1, TERMS.fa23],
    [COURSES.cs112, TERMS.sp24],
    [COURSES.calc2, TERMS.sp24],
    [COURSES.data101, TERMS.sp24],
    [COURSES.cs205, TERMS.fa24],
    [COURSES.cs211, TERMS.fa24],
    [COURSES.cs206, TERMS.sp25],
    [COURSES.cs439, TERMS.sp25],
    [COURSES.linalg, TERMS.sp25],
    [COURSES.stat212, TERMS.sp25],
    [COURSES.cs344, TERMS.fa25],
    [COURSES.cs440, TERMS.fa25],
    [COURSES.ds210, TERMS.fa25],
    [COURSES.cs213, TERMS.sp26],
    [COURSES.cs336, TERMS.sp26],
    [COURSES.stat463, TERMS.fa26],
    [COURSES.stat486, TERMS.fa26],
    [COURSES.infovis, TERMS.fa26],
    [COURSES.dataInContext, TERMS.fa26],
    [COURSES.calc3, TERMS.sp27],
    [COURSES.cs461, TERMS.sp27],
  ];
  for (const [c, t] of termPlacements) {
    addEdge(c.id, t.id, 'planned_in');
  }

  // Prerequisite edges ------------------------------------------------------
  addEdge(COURSES.cs111.id, COURSES.cs112.id, 'prerequisite_for');
  addEdge(COURSES.cs112.id, COURSES.cs205.id, 'prerequisite_for');
  addEdge(COURSES.cs205.id, COURSES.cs206.id, 'prerequisite_for');
  addEdge(COURSES.cs112.id, COURSES.cs344.id, 'prerequisite_for');
  addEdge(COURSES.cs205.id, COURSES.cs344.id, 'prerequisite_for');
  addEdge(COURSES.cs112.id, COURSES.cs213.id, 'prerequisite_for');
  addEdge(COURSES.cs112.id, COURSES.cs336.id, 'prerequisite_for');
  addEdge(COURSES.calc1.id, COURSES.calc2.id, 'prerequisite_for');
  addEdge(COURSES.calc2.id, COURSES.calc3.id, 'prerequisite_for');
  addEdge(COURSES.calc2.id, COURSES.linalg.id, 'prerequisite_for');
  addEdge(COURSES.stat212.id, COURSES.stat463.id, 'prerequisite_for');
  addEdge(COURSES.stat212.id, COURSES.stat486.id, 'prerequisite_for');
  addEdge(COURSES.cs439.id, COURSES.cs461.id, 'prerequisite_for');
  addEdge(COURSES.cs439.id, COURSES.cs462.id, 'prerequisite_for');

  // Annotations -------------------------------------------------------------
  addEdge(ANNOTATIONS.recCalc3.id, COURSES.calc3.id, 'recommends');
  addEdge(ANNOTATIONS.recMl.id, COURSES.cs461.id, 'recommends');
  addEdge(ANNOTATIONS.recMl.id, COURSES.cs462.id, 'recommends');
  addEdge(ANNOTATIONS.warnFa26Load.id, TERMS.fa26.id, 'recommends', 'attached to term');

  return {
    version: 1,
    nodes,
    edges,
    rootIds: [PROGRAMS.csBs.id, PROGRAMS.dsBs.id],
    meta: {
      title: 'Mock plan: ADAMYA SINGH',
      capturedAt: new Date().toISOString(),
      source: 'mock',
    },
  };
}
