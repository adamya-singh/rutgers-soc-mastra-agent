# Degree Navigator Documentation

Captured from Rutgers Degree Navigator on April 26, 2026 via the local Browserbase test session.

This document records academic information visible in Degree Navigator for the test account. It does not include the account password. Degree Navigator labels several future-term courses as `current`; those statuses are preserved as shown.

## Storage Model

The app stores a validated latest Degree Navigator capture per authenticated user in `public.degree_navigator_profiles`.

The table is defined in `cedar-mastra-agent/supabase/migrations/20260428_create_degree_navigator_profiles.sql` and has RLS enabled with ownership enforced by `user_id = auth.uid()`. The hosted Supabase project has this migration applied.

The capture is intentionally document-shaped:

- Top-level columns keep lookup/freshness fields: `student_name`, `ruid`, `netid`, `school_code`, `school_name`, `graduation_year`, `graduation_month`, `degree_credits_earned`, `cumulative_gpa`, `planned_course_count`, `captured_at`.
- `profile` stores the student profile object.
- `programs` stores declared programs of study.
- `audits` stores program audits, requirements, applied courses, conditions, notes, unused courses, and still-needed items.
- `transcript_terms` stores transcript/AP/placement terms with course entries.
- `run_notes` stores capture metadata such as disclaimers, extraction warnings, and unavailable routes.

The canonical TypeScript/Zod shapes live in `cedar-mastra-agent/src/backend/src/degree-navigator/schemas.ts`; backend read/write helpers live in `cedar-mastra-agent/src/backend/src/degree-navigator/repository.ts`. The backend APIs are `GET /degree-navigator/profile` and `POST /degree-navigator/profile`; both derive ownership from the verified Supabase bearer token.

The app must not store Rutgers passwords, raw Degree Navigator HTML, screenshots, or Browserbase Live View URLs in this table.

## Student Profile

- Name: ADAMYA SINGH
- RUID: 225004061
- NetID: as4487
- School: 01, School of Arts & Sciences
- Declared graduation year: 27
- Declared graduation month: May
- Degree credits earned: 86
- Current GPA: 3.461
- Planned courses: 0 courses in the course plan

## Declared Programs Of Study

- 01: The SAS Core Curriculum (NB)
- NB219SJ: Major in Data Science - Computer Science Option B.S. (NB)
- NB198SJ: Major in Computer Science - B.S. (NB)

## Audit Summaries

### The SAS Core Curriculum (NB)

- Version/report term: Summer 2019
- Completed credits: N/A
- Completed requirements: 6 of 6
- Overall status: Complete or projected complete with in-progress/current courses.

Requirements:

- R1, Contemporary Challenges [CC]: 2 of 2 courses complete.
  - 01:198:142, Data 101, 4 credits, Spring 2024, B+
  - 37:575:309, Working Women in American Society, 3 credits, Spring 2025, A
- R2, Areas of Inquiry: Natural Sciences [NS]: 2 of 2 courses listed, in progress/projected satisfied.
  - 01:750:203, General Physics, 3 credits, Spring 2026, current
  - 01:750:204, General Physics, 3 credits, Fall 2026, current
- R3, Areas of Inquiry: Social [SCL] and Historical [HST] Analysis: 2 of 2 courses listed, in progress/projected satisfied.
  - 37:575:201, Labor and Work before the end of Reconstruction, 3 credits, Spring 2026, current
  - 37:575:309, Working Women in American Society, 3 credits, Spring 2025, A
- R4, Areas of Inquiry: Arts and Humanities [AHo], [AHp], [AHq], [AHr]: 2 of 2 courses complete.
  - 07:700:133, Introduction to Music Theory Online, 3 credits, Fall 2025, B+
  - 07:700:235, Rock 'n' Roll: Origins to Present Online, 3 credits, Fall 2024, A
- R5, Cognitive Skills and Processes: Writing and Communication [WC], [WCr], [WCd]: 3 of 3 courses listed, in progress/projected satisfied.
  - 01:355:101, College Writing, 3 credits, Spring 2024, A
  - 37:575:201, Labor and Work before the end of Reconstruction, 3 credits, Spring 2026, current
  - 37:575:202, History of Labor and Work in the U.S. 1880 to 1945, 3 credits, Spring 2026, current
- R6, Cognitive Skills and Processes: Quantitative and Formal Reasoning [QQ], [QR]: 2 of 2 courses complete.
  - 01:198:111, Introduction to Computer Science, 4 credits, Fall 2023, A
  - 01:960:212, Statistics II, 3 credits, Spring 2025, A

Courses listed as unused for this program include major, AP, placement, repeated, and excluded courses. Degree Navigator specifically marks 01:090:101 as not meeting the university-wide minimum passing grade, repeated attempts for 01:355:101, 01:640:250, and 01:750:203, and 01:960:384 as an exclusive-course unused item.

### Major In Data Science - Computer Science Option B.S. (NB)

- Program code: NB219SJ
- Version/report term: Spring 2024
- Completed credits: N/A
- Completed requirements: 1 of 2
- Major GPA: 3.476
- Major GPA status: satisfied
- Overall status: Foundational courses are projected satisfied; the Computer Science Track still needs 2 more courses.

Requirements:

- R1, Foundational Courses: 7 of 7 courses listed, in progress/projected satisfied.
  - 01:198:142, Data 101, 4 credits, Spring 2024, B+
  - 01:198:210, Data Management for Data Science, 4 credits, Fall 2025, B
  - 01:198:336, Principles of Information and Data Management, 4 credits, Spring 2026, current
  - 01:640:151, Calculus I for Mathematical and Physical Sciences, 4 credits, Fall 2023, C+
  - 01:640:250, Introductory Linear Algebra, 3 credits, Spring 2025, A, repeated-course code R
  - 01:960:212, Statistics II, 3 credits, Spring 2025, A
  - 04:547:225, Data In Context, 3 credits, Fall 2026, current, used as 04:189:220
- R2, Computer Science Track: 9 of 11 courses listed; 2 more courses needed.
  - Completed/listed:
    - 01:198:111, Introduction to Computer Science, 4 credits, Fall 2023, A
    - 01:198:112, Data Structures, 4 credits, Spring 2024, B+
    - 01:198:205, Introduction to Discrete Structures, 4 credits, Fall 2024, A
    - 01:198:206, Introduction to Discrete Structures II, 4 credits, Spring 2025, A
    - 01:198:439, Introduction to Data Science, 4 credits, Spring 2025, A
    - 01:640:152, Calculus II for the Mathematical and Physical Sciences, 4 credits, Spring 2024, C
    - 01:960:463, Regression Methods, 3 credits, Fall 2026, current
    - 01:960:486, Applied Statistical Learning, 3 credits, Fall 2026, current
    - 04:547:321, Information Visualization, 3 credits, Fall 2026, current
  - Still needed according to the audit:
    - Multivariable Calculus: 01:640:251
    - Machine Learning/Deep Learning: 01:198:461 or 01:198:462

Conditions and notes:

- Major GPA condition requires at least 2.000 from applied courses; shown GPA is 3.476 (146/42).
- Minimum grade condition requires at least C for all applied courses.
- No courses with D may count toward the Data Science major.
- Recommended calculus for the Computer Science option is 01:640:151.
- Courses not meeting minimum grade for this program: 01:090:101 and 01:960:384.
- Repeated courses listed: 01:355:101, 01:640:250, and 01:750:203.

### Major In Computer Science - B.S. (NB)

- Program code: NB198SJ
- Version/report term: Fall 2011
- Completed credits: N/A
- Completed requirements: 5 of 5
- Major GPA calculation: 3.431
- Overall status: Complete or projected complete with in-progress/current courses.

Requirements:

- R1, Computer Science Core: 6 of 6 courses complete.
  - 01:198:111, Introduction to Computer Science, 4 credits, Fall 2023, A
  - 01:198:112, Data Structures, 4 credits, Spring 2024, B+
  - 01:198:205, Introduction to Discrete Structures, 4 credits, Fall 2024, A
  - 01:198:206, Introduction to Discrete Structures II, 4 credits, Spring 2025, A
  - 01:198:211, Computer Architecture, 4 credits, Fall 2024, A
  - 01:198:344, Design and Analysis of Computer Algorithms, 4 credits, Fall 2025, A
- R2, Mathematics Core: 3 of 3 courses complete.
  - 01:640:151, Calculus I for Mathematical and Physical Sciences, 4 credits, Fall 2023, C+
  - 01:640:152, Calculus II for the Mathematical and Physical Sciences, 4 credits, Spring 2024, C
  - 01:640:250, Introductory Linear Algebra, 3 credits, Spring 2025, A, repeated-course code R
- R3, Computer Science Electives: 7 of 7 courses listed, in progress/projected satisfied.
  - 01:198:210, Data Management for Data Science, 4 credits, Fall 2025, B
  - 01:198:213, Software Methodology, 4 credits, Spring 2026, current
  - 01:198:336, Principles of Information and Data Management, 4 credits, Spring 2026, current
  - 01:198:439, Introduction to Data Science, 4 credits, Spring 2025, A
  - 01:198:440, Introduction to Artificial Intelligence, 4 credits, Fall 2025, A
  - 01:960:384, Intermediate Statistical Analysis, 3 credits, Fall 2023, D
  - 01:960:463, Regression Methods, 3 credits, Fall 2026, current
- R4, Physics or Chemistry Courses: 4-course physics sequence listed, in progress/projected satisfied.
  - 01:750:203, General Physics, 3 credits, Spring 2026, current
  - 01:750:204, General Physics, 3 credits, Fall 2026, current
  - 01:750:205, General Physics Laboratory, 1 credit, Fall 2025, A
  - 01:750:206, General Physics Laboratory, 1 credit, Fall 2026, current
- R5, Residency Requirement in RU-NB: 7 of 7 courses complete.
  - 01:198:111, Introduction to Computer Science, 4 credits, Fall 2023, A
  - 01:198:205, Introduction to Discrete Structures, 4 credits, Fall 2024, A
  - 01:198:206, Introduction to Discrete Structures II, 4 credits, Spring 2025, A
  - 01:198:211, Computer Architecture, 4 credits, Fall 2024, A
  - 01:198:344, Design and Analysis of Computer Algorithms, 4 credits, Fall 2025, A
  - 01:198:439, Introduction to Data Science, 4 credits, Spring 2025, A
  - 01:198:440, Introduction to Artificial Intelligence, 4 credits, Fall 2025, A

Conditions and notes:

- No more than one course with a grade of D may be used across the CS major requirements; the audit shows 1 applied.
- Eligibility courses require minimum C in 01:198:111, 01:198:112, 01:198:205, 01:640:151, and 01:640:152.
- Pass/No Credit courses may not be used for CS major/minor requirements, except specified Spring/Summer/Fall 2020 and Spring 2021 PA exceptions.
- No more than 2 CS electives outside department 198 may be used in R3.
- Courses not meeting minimum grade for this program: 01:090:101.
- Repeated courses listed: 01:355:101, 01:640:250, and 01:750:203.
- Exclusive-course unused item: 01:960:212.

## Transcript / Course List

### Fall 2026

- 01:750:204, General Physics (NB), 3 credits, current
- 01:750:206, General Physics Laboratory (NB), 1 credit, current
- 01:960:463, Regression Methods (NB), 3 credits, current
- 01:960:486, Applied Statistical Learning (NB), 3 credits, current
- 04:547:225, Data In Context (NB), 3 credits, current
- 04:547:321, Information Visualization (NB), 3 credits, current

### Spring 2026

- 01:198:213, Software Methodology (NB), 4 credits, current
- 01:198:336, Principles of Information and Data Management (NB), 4 credits, current
- 01:750:203, General Physics (NB), 3 credits, current
- 37:575:201, Labor and Work before the end of Reconstruction (NB), 3 credits, current
- 37:575:202, History of Labor and Work in the U.S. 1880 to 1945 (NB), 3 credits, current

### Fall 2025

- 01:198:210, Data Management for Data Science (NB), 4 credits, B
- 01:198:344, Design and Analysis of Computer Algorithms (NB), 4 credits, A
- 01:198:440, Introduction to Artificial Intelligence (NB), 4 credits, A
- 01:750:203, General Physics (NB), 3 credits, D
- 01:750:205, General Physics Laboratory (NB), 1 credit, A
- 07:700:133, Introduction to Music Theory Online (NB), 3 credits, B+

### Spring 2025

- 01:198:206, Introduction to Discrete Structures II (NB), 4 credits, A
- 01:198:439, Introduction to Data Science (NB), 4 credits, A
- 01:640:250, Introductory Linear Algebra (NB), 3 credits, A, special code R
- 01:960:212, Statistics II (NB), 3 credits, A
- 37:575:309, Working Women in American Society (NB), 3 credits, A

### Fall 2024

- 01:185:201, Cognitive Science: A Multidisciplinary Introduction (NB), 4 credits, A
- 01:198:205, Introduction to Discrete Structures (NB), 4 credits, A
- 01:198:211, Computer Architecture (NB), 4 credits, A
- 07:700:235, Rock 'n' Roll: Origins to Present Online (NB), 3 credits, A

### Spring 2024

- 01:198:112, Data Structures (NB), 4 credits, B+
- 01:198:142, Data 101 (NB), 4 credits, B+
- 01:355:101, College Writing (NB), 3 credits, A
- 01:640:152, Calculus II for the Mathematical and Physical Sciences (NB), 4 credits, C
- 01:640:250, Introductory Linear Algebra (NB), 3 credits, D, special code E

### Fall 2023

- 01:090:101, The Byrne First Year Seminars (NB), 1 credit, NC, special code P
- 01:198:111, Introduction to Computer Science (NB), 4 credits, A
- 01:355:101, College Writing (NB), 3 credits, NC
- 01:640:151, Calculus I for Mathematical and Physical Sciences (NB), 4 credits, C+
- 01:960:384, Intermediate Statistical Analysis (NB), 3 credits, D

### 2023 AP Credit

- 01:198:110, Principles of Computer Science (NB), 3 credits, AP, special code AP
- 01:830:101, General Psychology (NB), 3 credits, AP, special code AP
- 01:960:211, Statistics I (NB), 3 credits, AP, special code AP

### Placement

- CH:160:CHM, Placement into General Chemistry (NB), 0 credits, PL, special code PL
- EN:355:101, Placement into College Writing (NB), 0 credits, PL, special code PL
- GB:119:115, Placement into General Biology I, 0 credits, PL, special code PL
- MA:640:CLS, Placement into Calculus (NB), 0 credits, PL, special code PL
- NB:940:FSH, Placement into Advanced Spanish Courses (NB), 0 credits, PL, special code PL

## Run Notes

- Degree Navigator displayed the standard advisory disclaimer: the report is an advising/planning tool, not an official transcript or contract; requirements should be verified by an academic adviser.
- The `All My Notes` route returned an unknown Degree Navigator error during this run, so no personal/advising notes were captured.
- The transcript view exposed titles as link metadata; requirement audit views primarily listed course numbers, credits, terms, grades, and status.
