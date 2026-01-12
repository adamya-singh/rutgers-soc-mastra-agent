-- =============================================================================
-- Schema Amendments Based on Full API Fuzzing
-- Generated from full_fuzz_api.py analysis
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Amendment 1: Add session_dates to sections table
-- Discovery: Summer term sections have session_dates like "07/07/2025 - 08/01/2025"
-- This is used for summer sessions that run for specific date ranges
-- -----------------------------------------------------------------------------

ALTER TABLE sections 
ADD COLUMN IF NOT EXISTS session_dates VARCHAR(50);

COMMENT ON COLUMN sections.session_dates IS 'Date range for summer/winter sessions (e.g., "07/07/2025 - 08/01/2025")';

-- -----------------------------------------------------------------------------
-- Amendment 2: Update terms table to support Winter term
-- Discovery: Term code "0" = Winter session (126 courses in Winter 2025 NB)
-- -----------------------------------------------------------------------------

-- Update the generated column to include Winter
-- Note: In PostgreSQL, we need to drop and recreate the generated column
ALTER TABLE terms DROP COLUMN IF EXISTS term_name;
ALTER TABLE terms ADD COLUMN term_name VARCHAR(20) GENERATED ALWAYS AS (
    CASE term 
        WHEN '0' THEN 'Winter'
        WHEN '1' THEN 'Spring'
        WHEN '7' THEN 'Summer'
        WHEN '9' THEN 'Fall'
        ELSE 'Unknown'
    END
) STORED;

-- -----------------------------------------------------------------------------
-- Amendment 3: Update campus codes for ONLINE variants
-- Discovery: ONLINE_NB, ONLINE_NK, ONLINE_CM are valid campus codes
-- The VARCHAR(2) constraint is too small - need VARCHAR(10)
-- -----------------------------------------------------------------------------

-- Terms table
ALTER TABLE terms ALTER COLUMN campus TYPE VARCHAR(10);

-- Courses table
ALTER TABLE courses ALTER COLUMN main_campus TYPE VARCHAR(10);
ALTER TABLE courses ALTER COLUMN campus_code TYPE VARCHAR(10);

-- Sections table
ALTER TABLE sections ALTER COLUMN campus_code TYPE VARCHAR(10);

-- Meeting times table (if exists)
ALTER TABLE meeting_times ALTER COLUMN campus_location TYPE VARCHAR(10);

-- Core codes table
ALTER TABLE course_core_codes ALTER COLUMN offering_unit_campus TYPE VARCHAR(10);

-- Cross-listed sections
ALTER TABLE cross_listed_sections ALTER COLUMN offering_unit_campus TYPE VARCHAR(10);

-- -----------------------------------------------------------------------------
-- Amendment 4: Add index for session_dates queries (summer course filtering)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sections_session_dates 
ON sections(session_dates) 
WHERE session_dates IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Amendment 5: Create view for open sections lookup
-- Discovery: /openSections.json returns just index numbers (8140 items)
-- This view supports quick open section lookups
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_open_sections AS
SELECT 
    s.index_number,
    c.course_string,
    c.title,
    t.year,
    t.term,
    t.term_name,
    t.campus
FROM sections s
JOIN courses c ON s.course_id = c.id
JOIN terms t ON c.term_id = t.id
WHERE s.open_status = true;

-- -----------------------------------------------------------------------------
-- Amendment 6: Create view for summer sessions with date ranges
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_summer_sessions AS
SELECT 
    c.course_string,
    c.title,
    c.credits,
    s.index_number,
    s.section_number,
    s.session_dates,
    s.open_status,
    STRING_AGG(DISTINCT i.name, ', ') AS instructors,
    t.year,
    t.campus
FROM sections s
JOIN courses c ON s.course_id = c.id
JOIN terms t ON c.term_id = t.id
LEFT JOIN section_instructors si ON s.id = si.section_id
LEFT JOIN instructors i ON si.instructor_id = i.id
WHERE t.term = '7'  -- Summer
AND s.session_dates IS NOT NULL
GROUP BY c.course_string, c.title, c.credits, s.index_number, 
         s.section_number, s.session_dates, s.open_status, t.year, t.campus;

-- -----------------------------------------------------------------------------
-- Summary of Findings
-- -----------------------------------------------------------------------------
/*
Key Discoveries from Full API Fuzzing:

1. ENDPOINTS FOUND:
   - /courses.json (main endpoint)
   - /openSections.json (returns array of index numbers only)
   - Other endpoints (subjects, buildings, etc.) return 404

2. PARAMETERS:
   - level (U/G) and subject (e.g., 198) parameters EXIST but don't filter
   - They return the same data regardless of value
   - Only year, term, campus affect results

3. TERM CODES:
   - 0 = Winter (126 courses in 2025-Winter-NB)
   - 1 = Spring
   - 7 = Summer (has session_dates field)
   - 9 = Fall

4. CAMPUS CODES:
   - NB, NK, CM (physical)
   - ONLINE_NB, ONLINE_NK, ONLINE_CM (online variants)

5. DATA BY TERM (2023-2025):
   - Spring: 21,572 courses (most data)
   - Fall: 19,769 courses
   - Summer: 5,329 courses
   - Winter: 596 courses (smallest)

6. NEW FIELD DISCOVERED:
   - session_dates: Only appears in summer term
   - Format: "MM/DD/YYYY - MM/DD/YYYY"
   - Example: "07/07/2025 - 08/01/2025"

7. ERROR HANDLING:
   - Invalid params return empty array [] with 200 status
   - Missing required params return 400 status
   - Required params: year, term, campus (all three needed)
*/
