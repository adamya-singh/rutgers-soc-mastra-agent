# Rutgers SIS API Field Inventory Report

## Data Sources

| Year | Term | Campus | Courses |
|------|------|--------|---------|
| 2024 | Spring | CM | 905 |
| 2024 | Spring | NB | 4530 |
| 2024 | Spring | NK | 1327 |
| 2024 | Fall | CM | 907 |
| 2024 | Fall | NB | 4367 |
| 2024 | Fall | NK | 1286 |
| 2025 | Spring | CM | 918 |
| 2025 | Spring | NB | 4486 |
| 2025 | Spring | NK | 1290 |
| 2025 | Fall | CM | 936 |
| 2025 | Fall | NB | 4421 |
| 2025 | Fall | NK | 1287 |

**Total courses analyzed:** 26660

## High-Level Statistics

- Total sections: 64321
- Total meeting times: 91666
- Unique subjects: 301
- Unique schools: 46
- Unique instructors: 7978

### Cardinality

- Avg sections per course: 2.41
- Max sections per course: 128
- Avg instructors per section: 0.99
- Max instructors per section: 2
- Avg meeting times per section: 1.43
- Max meeting times per section: 5

## Field Inventory

| Path | Types | Null Rate | Required | Sample Values |
|------|-------|-----------|----------|---------------|
| `campusCode` | string | 0.0% | ✓ | ['NB', 'OB', 'NK'] |
| `campusLocations` | array | 0.0% | ✓ |  |
| `campusLocations[*]` | object | 0.0% | ✓ |  |
| `campusLocations[*].code` | string | 0.0% | ✓ | ['O', '3', '1'] |
| `campusLocations[*].description` | string | 0.0% | ✓ | ['O', 'Livingston', 'College Avenue'] |
| `coreCodes` | array | 0.0% | ✓ |  |
| `coreCodes[*]` | object | 0.0% | ✓ |  |
| `coreCodes[*].code` | string | 0.0% | ✓ | ['SOEHS', 'HST', 'CCD'] |
| `coreCodes[*].coreCode` | string | 0.0% | ✓ | ['SOEHS', 'HST', 'CCD'] |
| `coreCodes[*].coreCodeDescription` | string | 0.0% | ✓ | ['SOE Only: Approved Humanities/Social Science', ' |
| `coreCodes[*].coreCodeReferenceId` | string | 0.0% | ✓ | ['121', '20', '78585'] |
| `coreCodes[*].course` | string | 0.0% | ✓ | ['110', '140', '141'] |
| `coreCodes[*].description` | string | 0.0% | ✓ | ['SOE Only: Approved Humanities/Social Science', ' |
| `coreCodes[*].effective` | string | 0.0% | ✓ | ['20251', '20259', '20241'] |
| `coreCodes[*].id` | string | 0.0% | ✓ | ['2025101013110  121', '2025101013140  121', '2025 |
| `coreCodes[*].lastUpdated` | integer | 0.0% | ✓ | [1728323919000, 1468423759000, 1545063307000] |
| `coreCodes[*].offeringUnitCampus` | string | 0.0% | ✓ | ['NB', 'CM', 'NK'] |
| `coreCodes[*].offeringUnitCode` | string | 0.0% | ✓ | ['01', '50', '21'] |
| `coreCodes[*].subject` | string | 0.0% | ✓ | ['013', '014', '016'] |
| `coreCodes[*].supplement` | string | 0.0% | ✓ | ['  '] |
| `coreCodes[*].term` | string | 0.0% | ✓ | ['1', '9'] |
| `coreCodes[*].unit` | string | 0.0% | ✓ | ['01', '03', '04'] |
| `coreCodes[*].year` | string | 0.0% | ✓ | ['2025', '2024'] |
| `courseDescription` | string | 0.0% | ✓ | [''] |
| `courseFee` | string | 0.0% | ✓ | ['0', '7.00', '1.10'] |
| `courseFeeDescr` | null, string | 0.5% |  | ['', 'LAB FEE', 'COURSE FEE'] |
| `courseNotes` | string | 0.0% | ✓ | ['', 'Register in person at any SAS Advising Cente |
| `courseNumber` | string | 0.0% | ✓ | ['110', '140', '141'] |
| `courseString` | string | 0.0% | ✓ | ['01:013:110', '01:013:140', '01:013:141'] |
| `credits` | float, integer, null | 10.9% |  | [3, 4, 1.5] |
| `creditsObject` | object | 0.0% | ✓ |  |
| `creditsObject.code` | string | 0.0% | ✓ | ['3_0', '4_0', '1_5'] |
| `creditsObject.description` | string | 0.0% | ✓ | ['3.0 credits', '4.0 credits', '1.5 credits'] |
| `expandedTitle` | string | 0.0% | ✓ | ['INTRODUCTION TO ARAMAIC                          |
| `level` | string | 0.0% | ✓ | ['U', 'G'] |
| `mainCampus` | string | 0.0% | ✓ | ['NB', 'NK', 'CM'] |
| `offeringUnitCode` | string | 0.0% | ✓ | ['01', '03', '04'] |
| `offeringUnitTitle` | null | 100.0% |  |  |
| `openSections` | integer | 0.0% | ✓ | [1, 0, 2] |
| `preReqNotes` | string | 0.0% | ✓ | ['', '(01:013:140 ELEMENTARY ARABIC I )<em> OR </e |
| `school` | object | 0.0% | ✓ |  |
| `school.code` | string | 0.0% | ✓ | ['01', '03', '04'] |
| `school.description` | string | 0.0% | ✓ | ['School of Arts and Sciences', 'Office of the Pro |
| `sections` | array | 0.0% | ✓ |  |
| `sections[*]` | object | 0.0% | ✓ |  |
| `sections[*].campusCode` | string | 0.0% | ✓ | ['NB', 'OB', 'NK'] |
| `sections[*].comments` | array | 0.0% | ✓ |  |
| `sections[*].commentsText` | string | 0.0% | ✓ | ['Online Course, Go to http://canvas.rutgers.edu', |
| `sections[*].comments[*]` | object | 0.0% | ✓ |  |
| `sections[*].comments[*].code` | string | 0.0% | ✓ | ['56', '05', 'AU'] |
| `sections[*].comments[*].description` | string | 0.0% | ✓ | ['Online Course', 'Go to http://canvas.rutgers.edu |
| `sections[*].courseFee` | null, string | 2.6% |  | ['0000.00', '0001.75', '0105.00'] |
| `sections[*].courseFeeDescr` | null, string | 95.4% |  | ['COURSE FEE', 'LAB FEE', 'COVERS SUPPLIES AND MAT |
| `sections[*].crossListedSectionType` | string | 0.0% | ✓ | ['0', '1', '2'] |
| `sections[*].crossListedSections` | array | 0.0% | ✓ |  |
| `sections[*].crossListedSectionsText` | string | 0.0% | ✓ | ['', '01:074:140:01 (09215)', '01:074:140:02 (0921 |
| `sections[*].crossListedSections[*]` | object | 0.0% | ✓ |  |
| `sections[*].crossListedSections[*].courseNumber` | string | 0.0% | ✓ | ['140', '141', '102'] |
| `sections[*].crossListedSections[*].offeringUnitCampus` | string | 0.0% | ✓ | ['NB', 'OB', 'NK'] |
| `sections[*].crossListedSections[*].offeringUnitCode` | string | 0.0% | ✓ | ['01', '11', '16'] |
| `sections[*].crossListedSections[*].primaryRegistrationIndex` | string | 0.0% | ✓ | ['09214', '09216', '09218'] |
| `sections[*].crossListedSections[*].registrationIndex` | string | 0.0% | ✓ | ['09215', '09217', '09219'] |
| `sections[*].crossListedSections[*].sectionNumber` | string | 0.0% | ✓ | ['01', '02', '90'] |
| `sections[*].crossListedSections[*].subjectCode` | string | 0.0% | ✓ | ['074', '563', '505'] |
| `sections[*].crossListedSections[*].supplementCode` | string | 0.0% | ✓ | ['  ', 'NB', 'DU'] |
| `sections[*].examCode` | string | 0.0% | ✓ | ['T', 'D', 'U'] |
| `sections[*].examCodeText` | string | 0.0% | ✓ | ['T', 'Spanish', 'U'] |
| `sections[*].finalExam` | null, string | 62.3% |  | ['12/16/2025 12:00PM-03:00PM', '12/21/2025 04:00PM |
| `sections[*].honorPrograms` | array | 0.0% | ✓ |  |
| `sections[*].honorPrograms[*]` | object | 0.0% | ✓ |  |
| `sections[*].honorPrograms[*].code` | string | 0.0% | ✓ | ['A', '8', 'E'] |
| `sections[*].index` | string | 0.0% | ✓ | ['09212', '09214', '09216'] |
| `sections[*].instructors` | array | 0.0% | ✓ |  |
| `sections[*].instructorsText` | string | 0.0% | ✓ | ['HABERL, CHARLES', 'HABBAL, MANAR', 'ALI, JAMAL'] |
| `sections[*].instructors[*]` | object | 0.0% | ✓ |  |
| `sections[*].instructors[*].name` | string | 0.0% | ✓ | ['HABERL, CHARLES', 'HABBAL, MANAR', 'ALI, JAMAL'] |
| `sections[*].legendKey` | null, string | 100.0% |  | ['*'] |
| `sections[*].majors` | array | 0.0% | ✓ |  |
| `sections[*].majors[*]` | object | 0.0% | ✓ |  |
| `sections[*].majors[*].code` | string | 0.0% | ✓ | ['014', '082', '01'] |
| `sections[*].majors[*].isMajorCode` | boolean | 0.0% | ✓ | [True, False] |
| `sections[*].majors[*].isUnitCode` | boolean | 0.0% | ✓ | [False, True] |
| `sections[*].meetingTimes` | array | 0.0% | ✓ |  |
| `sections[*].meetingTimes[*]` | object | 0.0% | ✓ |  |
| `sections[*].meetingTimes[*].baClassHours` | string | 0.0% | ✓ | ['B', '', 'A'] |
| `sections[*].meetingTimes[*].buildingCode` | string | 0.0% | ✓ | ['', 'TIL', 'SC'] |
| `sections[*].meetingTimes[*].campusAbbrev` | string | 0.0% | ✓ | ['**', 'LIV', 'CAC'] |
| `sections[*].meetingTimes[*].campusLocation` | string | 0.0% | ✓ | ['O', '3', '1'] |
| `sections[*].meetingTimes[*].campusName` | string | 0.0% | ✓ | ['** INVALID **', 'LIVINGSTON', 'COLLEGE AVENUE'] |
| `sections[*].meetingTimes[*].endTime` | string | 0.0% | ✓ | ['', '0700', '0510'] |
| `sections[*].meetingTimes[*].endTimeMilitary` | string | 0.0% | ✓ | ['', '1900', '1710'] |
| `sections[*].meetingTimes[*].meetingDay` | string | 0.0% | ✓ | ['', 'M', 'W'] |
| `sections[*].meetingTimes[*].meetingModeCode` | string | 0.0% | ✓ | ['90', '02', '19'] |
| `sections[*].meetingTimes[*].meetingModeDesc` | string | 0.0% | ✓ | ['ONLINE INSTRUCTION(INTERNET)', 'LEC', 'PROJ-IND' |
| `sections[*].meetingTimes[*].pmCode` | string | 0.0% | ✓ | ['', 'P', 'A'] |
| `sections[*].meetingTimes[*].roomNumber` | string | 0.0% | ✓ | ['', '103D', '216'] |
| `sections[*].meetingTimes[*].startTime` | string | 0.0% | ✓ | ['', '0540', '0350'] |
| `sections[*].meetingTimes[*].startTimeMilitary` | string | 0.0% | ✓ | ['', '1740', '1550'] |
| `sections[*].minors` | array | 0.0% | ✓ |  |
| `sections[*].minors[*]` | object | 0.0% | ✓ |  |
| `sections[*].minors[*].code` | string | 0.0% | ✓ | ['014', '198', '204'] |
| `sections[*].number` | string | 0.0% | ✓ | ['90', '01', '02'] |
| `sections[*].openStatus` | boolean | 0.0% | ✓ | [True, False] |
| `sections[*].openStatusText` | string | 0.0% | ✓ | ['OPEN', 'CLOSED'] |
| `sections[*].openToText` | string | 0.0% | ✓ | ['', 'MAJ: 014 (Africana/Afro-American and African |
| `sections[*].printed` | string | 0.0% | ✓ | ['Y'] |
| `sections[*].sectionCampusLocations` | array | 0.0% | ✓ |  |
| `sections[*].sectionCampusLocations[*]` | object | 0.0% | ✓ |  |
| `sections[*].sectionCampusLocations[*].code` | string | 0.0% | ✓ | ['O', '3', '1'] |
| `sections[*].sectionCampusLocations[*].description` | string | 0.0% | ✓ | ['O', 'Livingston', 'College Avenue'] |
| `sections[*].sectionCourseType` | string | 0.0% | ✓ | ['O', 'H', 'T'] |
| `sections[*].sectionEligibility` | string | 0.0% | ✓ | ['', 'JUNIORS AND SENIORS', 'ALL EXCEPT 1ST YEAR'] |
| `sections[*].sectionNotes` | string | 0.0% | ✓ | ['', 'PREREQ: 01:013:140 OR 01:074:140 OR PLACEMEN |
| `sections[*].sessionDatePrintIndicator` | string | 0.0% | ✓ | ['N', 'Y'] |
| `sections[*].sessionDates` | null | 100.0% |  |  |
| `sections[*].specialPermissionAddCode` | null, string | 74.1% |  | ['04', '03', '16'] |
| `sections[*].specialPermissionAddCodeDescription` | null, string | 74.1% |  | ['Instructor', 'Department staff', 'Department'] |
| `sections[*].specialPermissionDropCode` | null, string | 94.2% |  | ['3', '2', '1'] |
| `sections[*].specialPermissionDropCodeDescription` | null, string | 94.2% |  | ['3', '2', '1'] |
| `sections[*].subtitle` | string | 0.0% | ✓ | ['', 'ELEMENTARY PERSIAN II                   ', ' |
| `sections[*].subtopic` | string | 0.0% | ✓ | [''] |
| `sections[*].unitMajors` | array | 0.0% | ✓ |  |
| `sections[*].unitMajors[*]` | object | 0.0% | ✓ |  |
| `sections[*].unitMajors[*].majorCode` | string | 0.0% | ✓ | ['198', '202', '460'] |
| `sections[*].unitMajors[*].unitCode` | string | 0.0% | ✓ | ['01', '15', '07'] |
| `subject` | string | 0.0% | ✓ | ['013', '014', '016'] |
| `subjectDescription` | string | 0.0% | ✓ | ['African, Middle Eastern, and South Asian Languag |
| `subjectGroupNotes` | string | 0.0% | ✓ | [''] |
| `subjectNotes` | string | 0.0% | ✓ | ['', 'CURRENT COURSE SYNOPSIS AND SYLLABI CAN BE F |
| `supplementCode` | string | 0.0% | ✓ | ['  ', 'LB', 'NB'] |
| `synopsisUrl` | string | 0.0% | ✓ | ['https://www.amesall.rutgers.edu/academics/underg |
| `title` | string | 0.0% | ✓ | ['INTRO TO ARAMAIC', 'ELEMENTARY ARABIC I', 'ELEME |
| `unitNotes` | string | 0.0% | ✓ | ['', 'For Special Permission -- http://bloustein.r |

## Enumeration Values

### baClassHours

- ``
- `A`
- `B`

### campusCode

- `CM`
- `NB`
- `NK`
- `OB`
- `OC`
- `ON`

### crossListedSectionType

- `0`
- `1`
- `2`
- `3`
- `4`
- `5`
- `6`

### examCode

- `A`
- `B`
- `C`
- `D`
- `F`
- `G`
- `H`
- `I`
- `J`
- `M`
- `N`
- `O`
- `Q`
- `S`
- `T`
- `U`

### level

- `G`
- `U`

### mainCampus

- `CM`
- `NB`
- `NK`

### meetingDay

- ``
- `F`
- `H`
- `M`
- `S`
- `T`
- `U`
- `W`

### meetingModeCode

- `02`
- `03`
- `04`
- `05`
- `06`
- `07`
- `08`
- `09`
- `10`
- `12`
- `14`
- `15`
- `16`
- `18`
- `19`
- `20`
- `21`
- `23`
- `25`
- `26`
- `27`
- `28`
- `29`
- `80`
- `81`
- `82`
- `83`
- `90`
- `91`
- `92`
- `93`
- `98`
- `99`

### openStatusText

- `CLOSED`
- `OPEN`

### pmCode

- ``
- `A`
- `P`

### sectionCourseType

- `H`
- `O`
- `T`

## Prerequisite Analysis

- Courses with prerequisites: 7469

### Pattern Frequency

- course_code: 7451
- html_or: 3839
- parentheses: 7451
- html_and: 815

### Sample Prerequisites

**01:013:141:**
```html
(01:013:140 ELEMENTARY ARABIC I )<em> OR </em>(01:074:140 ELEMENTARY ARABIC I )
```

**01:013:153:**
```html
(01:563:101 ELEM MODERN HEBREW )<em> OR </em>(01:685:101 INTRODUCTION TO THE MODERN MIDDLE EAST )<em> OR </em>(01:013:152 ELEM MODERN HEBREW )
```

**01:013:161:**
```html
(01:013:160 ELEMENTARY HINDI I )<em> OR </em>(01:505:160 ELEMENTARY HINDI I )
```

**01:013:163:**
```html
(01:013:162 ELEMENTARY URDU I )
```

**01:013:177:**
```html
(01:013:176 ELEMENTARY PERSIAN I )<em> OR </em>(01:723:176 ELEMENTARY PERSIAN I )
```
