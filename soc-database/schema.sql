-- =============================================================================
-- Rutgers Course Database Schema
-- Optimized for: course search, schedule building, notifications, analytics,
-- and prerequisite visualization across multiple terms
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Drop existing tables (in dependency order)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS prerequisites CASCADE;
DROP TABLE IF EXISTS meeting_times CASCADE;
DROP TABLE IF EXISTS cross_listed_sections CASCADE;
DROP TABLE IF EXISTS section_honor_programs CASCADE;
DROP TABLE IF EXISTS section_unit_majors CASCADE;
DROP TABLE IF EXISTS section_minors CASCADE;
DROP TABLE IF EXISTS section_majors CASCADE;
DROP TABLE IF EXISTS section_campus_locations CASCADE;
DROP TABLE IF EXISTS section_comments CASCADE;
DROP TABLE IF EXISTS section_instructors CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS course_core_codes CASCADE;
DROP TABLE IF EXISTS course_campus_locations CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS instructors CASCADE;
DROP TABLE IF EXISTS schools CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS terms CASCADE;

-- -----------------------------------------------------------------------------
-- Lookup/Reference Tables
-- -----------------------------------------------------------------------------

-- Terms: Represents a specific semester at a campus
CREATE TABLE terms (
    id SERIAL PRIMARY KEY,
    year SMALLINT NOT NULL,
    term VARCHAR(2) NOT NULL,  -- '0'=Winter, '1'=Spring, '7'=Summer, '9'=Fall
    campus VARCHAR(10) NOT NULL,  -- 'NB', 'NK', 'CM', 'ONLINE_NB', 'ONLINE_NK', 'ONLINE_CM'
    term_name VARCHAR(20) GENERATED ALWAYS AS (
        CASE term 
            WHEN '0' THEN 'Winter'
            WHEN '1' THEN 'Spring'
            WHEN '7' THEN 'Summer'
            WHEN '9' THEN 'Fall'
            ELSE 'Unknown'
        END
    ) STORED,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, term, campus)
);

-- Schools: Normalized school/offering unit data
CREATE TABLE schools (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT NOT NULL
);

-- Subjects: Normalized subject/department data
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    description TEXT NOT NULL,
    notes TEXT,
    UNIQUE(code)
);

-- Instructors: Normalized for analytics across terms
CREATE TABLE instructors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Core Course Tables
-- -----------------------------------------------------------------------------

-- Courses: Main course information
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    
    -- Course identification
    course_string VARCHAR(20) NOT NULL,  -- e.g., '01:013:110'
    offering_unit_code VARCHAR(10),
    subject_code VARCHAR(10) NOT NULL,
    course_number VARCHAR(10) NOT NULL,
    supplement_code VARCHAR(10),
    
    -- Course details
    title VARCHAR(100) NOT NULL,
    expanded_title VARCHAR(255),
    level VARCHAR(1) NOT NULL,  -- 'U'=Undergraduate, 'G'=Graduate
    credits DECIMAL(3,1),  -- Can be null for "by arrangement"
    credits_code VARCHAR(10),  -- e.g., '3_0', 'BA' (by arrangement)
    credits_description VARCHAR(50),
    
    -- School/Department
    school_id INTEGER REFERENCES schools(id),
    subject_id INTEGER REFERENCES subjects(id),
    
    -- Campus info
    main_campus VARCHAR(10) NOT NULL,  -- Supports ONLINE_NB, etc.
    campus_code VARCHAR(10),
    
    -- Section counts
    open_sections INTEGER DEFAULT 0,
    
    -- URLs and notes
    synopsis_url TEXT,
    course_description TEXT,
    course_notes TEXT,
    unit_notes TEXT,
    prereq_notes TEXT,  -- Raw HTML, also parsed into prerequisites table
    
    -- Fees
    course_fee VARCHAR(20),
    course_fee_description TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint per term
    UNIQUE(term_id, course_string)
);

-- Course Campus Locations: Where a course is offered
CREATE TABLE course_campus_locations (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    description VARCHAR(100)
);

-- Course Core Codes: General education requirements fulfilled
CREATE TABLE course_core_codes (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    core_code VARCHAR(20) NOT NULL,
    core_code_description TEXT,
    effective VARCHAR(10),  -- e.g., '20251'
    last_updated BIGINT
);

-- -----------------------------------------------------------------------------
-- Section Tables
-- -----------------------------------------------------------------------------

-- Sections: Individual class sections
CREATE TABLE sections (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    
    -- Section identification
    index_number VARCHAR(10) NOT NULL,  -- Registration index
    section_number VARCHAR(10) NOT NULL,  -- e.g., '01', '90', 'M1'
    
    -- Status (critical for notifications)
    open_status BOOLEAN NOT NULL DEFAULT false,
    open_status_text VARCHAR(20),  -- 'OPEN' or 'CLOSED'
    
    -- Type and mode
    section_course_type VARCHAR(1),  -- 'O'=Online, 'H'=Hybrid, 'T'=Traditional
    exam_code VARCHAR(1),
    exam_code_text VARCHAR(50),
    final_exam TEXT,  -- e.g., '12/16/2025 12:00PM-03:00PM'
    
    -- Eligibility
    section_eligibility TEXT,  -- e.g., 'JUNIORS AND SENIORS'
    open_to_text TEXT,  -- Major/minor restrictions
    
    -- Cross-listing
    cross_listed_section_type VARCHAR(1),
    cross_listed_sections_text TEXT,
    
    -- Notes and comments
    section_notes TEXT,
    comments_text TEXT,
    subtitle TEXT,
    subtopic TEXT,
    
    -- Permissions
    special_permission_add_code VARCHAR(10),
    special_permission_add_description TEXT,
    special_permission_drop_code VARCHAR(10),
    special_permission_drop_description TEXT,
    
    -- Fees (section-level)
    course_fee VARCHAR(20),
    course_fee_description TEXT,
    
    -- Misc
    campus_code VARCHAR(10),  -- Supports ONLINE_NB, etc.
    printed VARCHAR(1),
    session_date_print_indicator VARCHAR(1),
    session_dates VARCHAR(50),  -- Summer/Winter session date range (e.g., "07/07/2025 - 08/01/2025")
    
    -- For tracking status changes (notifications feature)
    status_changed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(course_id, index_number)
);

-- Section Instructors: Many-to-many between sections and instructors
CREATE TABLE section_instructors (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    instructor_id INTEGER NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
    UNIQUE(section_id, instructor_id)
);

-- Section Comments: Structured comments for each section
CREATE TABLE section_comments (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    description TEXT NOT NULL
);

-- Section Campus Locations: Where section meets
CREATE TABLE section_campus_locations (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    description VARCHAR(100)
);

-- Section Majors: Major restrictions
CREATE TABLE section_majors (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    is_major_code BOOLEAN DEFAULT false,
    is_unit_code BOOLEAN DEFAULT false
);

-- Section Minors: Minor restrictions
CREATE TABLE section_minors (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL
);

-- Section Unit Majors: Combined unit/major restrictions
CREATE TABLE section_unit_majors (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    unit_code VARCHAR(10) NOT NULL,
    major_code VARCHAR(10) NOT NULL
);

-- Section Honor Programs: Honors sections
CREATE TABLE section_honor_programs (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL
);

-- Cross-Listed Sections: Links between equivalent sections
CREATE TABLE cross_listed_sections (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    course_number VARCHAR(10),
    supplement_code VARCHAR(10),
    section_number VARCHAR(10),
    offering_unit_campus VARCHAR(2),
    offering_unit_code VARCHAR(10),
    subject_code VARCHAR(10),
    registration_index VARCHAR(10),
    primary_registration_index VARCHAR(10)
);

-- -----------------------------------------------------------------------------
-- Meeting Times (Critical for Schedule Builder)
-- -----------------------------------------------------------------------------

CREATE TABLE meeting_times (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    
    -- Day and time (key for conflict detection)
    meeting_day VARCHAR(1),  -- M, T, W, H (Thursday), F, S, U (Sunday)
    start_time_military VARCHAR(4),  -- e.g., '1740' for 5:40 PM
    end_time_military VARCHAR(4),  -- e.g., '1900' for 7:00 PM
    start_time VARCHAR(4),  -- 12-hour format
    end_time VARCHAR(4),
    pm_code VARCHAR(1),  -- 'A'=AM, 'P'=PM
    
    -- Location
    campus_location VARCHAR(10),  -- Supports ONLINE_XX codes
    campus_name VARCHAR(50),
    campus_abbrev VARCHAR(10),
    building_code VARCHAR(20),
    room_number VARCHAR(20),
    building_code_norm TEXT,
    room_number_norm TEXT,
    
    -- Mode
    meeting_mode_code VARCHAR(2),  -- '90'=Online, '02'=Lecture, etc.
    meeting_mode_desc VARCHAR(50),
    
    -- Other
    ba_class_hours VARCHAR(1)
);

-- -----------------------------------------------------------------------------
-- Prerequisites (Parsed from preReqNotes HTML)
-- -----------------------------------------------------------------------------

CREATE TABLE prerequisites (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    
    -- The required course (may or may not exist in our database)
    required_course_string VARCHAR(20) NOT NULL,  -- e.g., '01:013:140'
    required_course_title TEXT,  -- e.g., 'ELEMENTARY ARABIC I'
    
    -- Logical grouping for OR/AND relationships
    logic_group INTEGER NOT NULL DEFAULT 0,  -- Groups prerequisites together
    is_or BOOLEAN DEFAULT false,  -- true if this is part of an OR group
    
    -- Source
    source_text TEXT  -- The original HTML fragment this was parsed from
);

-- -----------------------------------------------------------------------------
-- Status History (For Notifications Feature)
-- -----------------------------------------------------------------------------

CREATE TABLE section_status_history (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    old_status BOOLEAN,
    new_status BOOLEAN NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Course Search Indexes
-- -----------------------------------------------------------------------------

-- Search by subject within a term
CREATE INDEX idx_courses_term_subject ON courses(term_id, subject_code);

-- Search by school
CREATE INDEX idx_courses_school ON courses(school_id);

-- Search by credits
CREATE INDEX idx_courses_credits ON courses(credits);

-- Search by level (undergrad/grad)
CREATE INDEX idx_courses_level ON courses(level);

-- Full-text search on title
CREATE INDEX idx_courses_title_search ON courses USING gin(to_tsvector('english', title));

-- Search by course string (for prereq lookups)
CREATE INDEX idx_courses_course_string ON courses(course_string);

-- Open sections count (find courses with availability)
CREATE INDEX idx_courses_open_sections ON courses(term_id, open_sections) WHERE open_sections > 0;

-- -----------------------------------------------------------------------------
-- Schedule Builder Indexes
-- -----------------------------------------------------------------------------

-- Meeting time conflict detection (most critical index)
CREATE INDEX idx_meeting_times_schedule ON meeting_times(section_id, meeting_day, start_time_military, end_time_military);

-- Find all meeting times for a section
CREATE INDEX idx_meeting_times_section ON meeting_times(section_id);

-- Find sections by meeting day
CREATE INDEX idx_meeting_times_day ON meeting_times(meeting_day) WHERE meeting_day != '';

-- Find online classes (no physical meeting)
CREATE INDEX idx_meeting_times_online ON meeting_times(meeting_mode_code) WHERE meeting_mode_code = '90';

-- Find sections by normalized building code
CREATE INDEX idx_meeting_times_building_norm ON meeting_times(building_code_norm) WHERE building_code_norm <> '';

-- Find sections by normalized building+room
CREATE INDEX idx_meeting_times_building_room_norm ON meeting_times(building_code_norm, room_number_norm) WHERE building_code_norm <> '';

-- -----------------------------------------------------------------------------
-- Notifications Indexes
-- -----------------------------------------------------------------------------

-- Find open/closed sections
CREATE INDEX idx_sections_status ON sections(open_status);

-- Track status changes
CREATE INDEX idx_sections_status_changed ON sections(status_changed_at) WHERE status_changed_at IS NOT NULL;

-- Section by index number (for direct lookup)
CREATE INDEX idx_sections_index ON sections(index_number);

-- Status history for a section
CREATE INDEX idx_status_history_section ON section_status_history(section_id, changed_at DESC);

-- Session dates for summer/winter courses
CREATE INDEX idx_sections_session_dates ON sections(session_dates) WHERE session_dates IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Analytics Indexes
-- -----------------------------------------------------------------------------

-- Instructor analytics
CREATE INDEX idx_section_instructors_instructor ON section_instructors(instructor_id);

-- Find all sections for an instructor
CREATE INDEX idx_instructors_name ON instructors(name);

-- Course popularity by term
CREATE INDEX idx_courses_term ON courses(term_id);

-- Core code analysis
CREATE INDEX idx_core_codes_code ON course_core_codes(core_code);

-- -----------------------------------------------------------------------------
-- Prerequisites Indexes
-- -----------------------------------------------------------------------------

-- Find prerequisites for a course
CREATE INDEX idx_prerequisites_course ON prerequisites(course_id);

-- Find courses that require a specific course
CREATE INDEX idx_prerequisites_required ON prerequisites(required_course_string);

-- Logic groups for building prereq trees
CREATE INDEX idx_prerequisites_group ON prerequisites(course_id, logic_group);

-- =============================================================================
-- VIEWS (For Common Queries)
-- =============================================================================

-- Course search view with denormalized data
CREATE VIEW v_course_search AS
SELECT 
    c.id,
    c.course_string,
    c.title,
    c.expanded_title,
    c.credits,
    c.level,
    c.open_sections,
    c.synopsis_url,
    c.prereq_notes,
    t.year,
    t.term,
    t.term_name,
    t.campus,
    sc.code AS school_code,
    sc.description AS school_name,
    sub.code AS subject_code,
    sub.description AS subject_name
FROM courses c
JOIN terms t ON c.term_id = t.id
LEFT JOIN schools sc ON c.school_id = sc.id
LEFT JOIN subjects sub ON c.subject_id = sub.id;

-- Section detail view
CREATE VIEW v_section_details AS
SELECT 
    s.id AS section_id,
    s.index_number,
    s.section_number,
    s.open_status,
    s.open_status_text,
    s.section_course_type,
    s.final_exam,
    s.section_eligibility,
    s.comments_text,
    c.course_string,
    c.title AS course_title,
    c.credits,
    t.year,
    t.term,
    t.campus,
    STRING_AGG(DISTINCT i.name, ', ') AS instructors
FROM sections s
JOIN courses c ON s.course_id = c.id
JOIN terms t ON c.term_id = t.id
LEFT JOIN section_instructors si ON s.id = si.section_id
LEFT JOIN instructors i ON si.instructor_id = i.id
GROUP BY s.id, s.index_number, s.section_number, s.open_status, 
         s.open_status_text, s.section_course_type, s.final_exam,
         s.section_eligibility, s.comments_text, c.course_string,
         c.title, c.credits, t.year, t.term, t.campus;

-- Schedule builder view
CREATE VIEW v_schedule_builder AS
SELECT 
    s.id AS section_id,
    s.index_number,
    s.open_status,
    c.course_string,
    c.title,
    c.credits,
    mt.meeting_day,
    mt.start_time_military,
    mt.end_time_military,
    mt.campus_name,
    mt.building_code,
    mt.room_number,
    mt.building_code_norm,
    mt.room_number_norm,
    mt.meeting_mode_desc,
    t.year,
    t.term,
    t.campus AS term_campus
FROM sections s
JOIN courses c ON s.course_id = c.id
JOIN terms t ON c.term_id = t.id
LEFT JOIN meeting_times mt ON s.id = mt.section_id;

-- Instructor analytics view
CREATE VIEW v_instructor_stats AS
SELECT 
    i.id AS instructor_id,
    i.name,
    COUNT(DISTINCT c.id) AS courses_taught,
    COUNT(DISTINCT s.id) AS sections_taught,
    ARRAY_AGG(DISTINCT sub.description) AS subjects_taught,
    ARRAY_AGG(DISTINCT t.year || ' ' || t.term_name) AS terms_active
FROM instructors i
JOIN section_instructors si ON i.id = si.instructor_id
JOIN sections s ON si.section_id = s.id
JOIN courses c ON s.course_id = c.id
JOIN terms t ON c.term_id = t.id
LEFT JOIN subjects sub ON c.subject_id = sub.id
GROUP BY i.id, i.name;

-- Open sections view (matches /openSections.json endpoint)
CREATE VIEW v_open_sections AS
SELECT 
    s.index_number,
    c.course_string,
    c.title,
    c.credits,
    t.year,
    t.term,
    t.term_name,
    t.campus
FROM sections s
JOIN courses c ON s.course_id = c.id
JOIN terms t ON c.term_id = t.id
WHERE s.open_status = true;

-- Summer sessions view (with date ranges)
CREATE VIEW v_summer_sessions AS
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

-- Winter sessions view
CREATE VIEW v_winter_sessions AS
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
WHERE t.term = '0'  -- Winter
GROUP BY c.course_string, c.title, c.credits, s.index_number, 
         s.section_number, s.session_dates, s.open_status, t.year, t.campus;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE terms IS 'Academic terms (year/semester/campus combinations)';
COMMENT ON TABLE courses IS 'Main course catalog entries, one per course per term';
COMMENT ON TABLE sections IS 'Individual class sections with enrollment status';
COMMENT ON TABLE meeting_times IS 'When and where sections meet (critical for schedule conflicts)';
COMMENT ON TABLE instructors IS 'Normalized instructor data for cross-term analytics';
COMMENT ON TABLE prerequisites IS 'Parsed prerequisite relationships from preReqNotes HTML';
COMMENT ON TABLE section_status_history IS 'Track open/closed status changes for notifications';

COMMENT ON INDEX idx_meeting_times_schedule IS 'Primary index for schedule conflict detection';
COMMENT ON INDEX idx_courses_term_subject IS 'Optimizes course search by subject within a term';
COMMENT ON INDEX idx_sections_status IS 'Quickly find all open or closed sections';
