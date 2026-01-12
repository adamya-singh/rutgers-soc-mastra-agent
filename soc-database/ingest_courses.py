#!/usr/bin/env python3
"""
Rutgers Course Data Ingestion Script (Parallelized + Bulk Insert)

Fetches course data from the Rutgers SIS API and loads it into the optimized schema.
Uses ProcessPoolExecutor for parallel processing and execute_values for bulk inserts.

Performance optimizations:
- Parallel chunk processing with ProcessPoolExecutor
- Bulk inserts using psycopg2's execute_values (not individual INSERTs)
- Pre-populated lookup tables (schools, subjects, instructors)
- Buffered row accumulation before bulk insert
- Two-phase insert approach for foreign key dependencies
"""

import os
import re
import json
import requests
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass
from html import unescape
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
import time

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
load_dotenv()

BASE_URL = "https://sis.rutgers.edu/soc/api/courses.json"

# PostgreSQL connection from environment
PG_HOST = os.getenv("PG_HOST", os.getenv("host"))
PG_PORT = os.getenv("PG_PORT", os.getenv("port", "5432"))
PG_DATABASE = os.getenv("PG_DATABASE", os.getenv("dbname", "postgres"))
PG_USER = os.getenv("PG_USER", os.getenv("user"))
PG_PASSWORD = os.getenv("PG_PASSWORD", os.getenv("password"))

# Parallelization settings
NUM_WORKERS = min(8, os.cpu_count() or 4)
BULK_INSERT_BUFFER_SIZE = 2000  # Rows to buffer before bulk insert

# -----------------------------------------------------------------------------
# Data Classes
# -----------------------------------------------------------------------------
@dataclass
class Prerequisite:
    """Parsed prerequisite information"""
    course_string: str
    course_title: str
    logic_group: int
    is_or: bool
    source_text: str

# -----------------------------------------------------------------------------
# Prerequisite Parser
# -----------------------------------------------------------------------------
def parse_prerequisites(prereq_notes: str) -> List[Prerequisite]:
    """
    Parse prerequisite HTML into structured data.
    
    Input examples:
    - "(01:013:140 ELEMENTARY ARABIC I )<em> OR </em>(01:074:140 ELEMENTARY ARABIC I )"
    - "(01:640:151 CALCULUS I )<em> AND </em>(01:750:203 PHYSICS I )"
    """
    if not prereq_notes or not prereq_notes.strip():
        return []
    
    prerequisites = []
    
    # Pattern to match course codes and titles
    # Format: (XX:XXX:XXX COURSE TITLE )
    course_pattern = r'\((\d{2}:\d{3}:\d{3})\s+([^)]+)\)'
    
    # Split by OR/AND while preserving the delimiter
    # OR creates new logic groups, AND keeps same group
    parts = re.split(r'<em>\s*(OR|AND)\s*</em>', prereq_notes, flags=re.IGNORECASE)
    
    logic_group = 0
    current_is_or = False
    
    for i, part in enumerate(parts):
        part = part.strip()
        
        # Check if this is an OR/AND delimiter
        if part.upper() == 'OR':
            logic_group += 1
            current_is_or = True
            continue
        elif part.upper() == 'AND':
            # Same logic group, not OR
            current_is_or = False
            continue
        
        # Find all course codes in this part
        matches = re.findall(course_pattern, part)
        for course_string, course_title in matches:
            prerequisites.append(Prerequisite(
                course_string=course_string,
                course_title=unescape(course_title.strip()),
                logic_group=logic_group,
                is_or=current_is_or,
                source_text=part[:200]  # Truncate for storage
            ))
    
    return prerequisites

# -----------------------------------------------------------------------------
# SQL Templates for Bulk Insert
# -----------------------------------------------------------------------------
SQL_TEMPLATES = {
    "courses": """
        INSERT INTO courses (
            term_id, course_string, offering_unit_code, subject_code,
            course_number, supplement_code, title, expanded_title,
            level, credits, credits_code, credits_description,
            school_id, subject_id, main_campus, campus_code,
            open_sections, synopsis_url, course_description,
            course_notes, unit_notes, prereq_notes,
            course_fee, course_fee_description
        ) VALUES %s
        ON CONFLICT (term_id, course_string)
        DO UPDATE SET
            open_sections = EXCLUDED.open_sections,
            updated_at = NOW()
        RETURNING id, course_string
    """,
    "course_campus_locations": """
        INSERT INTO course_campus_locations (course_id, code, description)
        VALUES %s
    """,
    "course_core_codes": """
        INSERT INTO course_core_codes (
            course_id, core_code, core_code_description, effective, last_updated
        ) VALUES %s
    """,
    "prerequisites": """
        INSERT INTO prerequisites (
            course_id, required_course_string, required_course_title,
            logic_group, is_or, source_text
        ) VALUES %s
    """,
    "sections": """
        INSERT INTO sections (
            course_id, index_number, section_number,
            open_status, open_status_text, section_course_type,
            exam_code, exam_code_text, final_exam,
            section_eligibility, open_to_text,
            cross_listed_section_type, cross_listed_sections_text,
            section_notes, comments_text, subtitle, subtopic,
            special_permission_add_code, special_permission_add_description,
            special_permission_drop_code, special_permission_drop_description,
            course_fee, course_fee_description,
            campus_code, printed, session_date_print_indicator, session_dates
        ) VALUES %s
        ON CONFLICT (course_id, index_number)
        DO UPDATE SET
            open_status = EXCLUDED.open_status,
            open_status_text = EXCLUDED.open_status_text,
            session_dates = EXCLUDED.session_dates,
            updated_at = NOW()
        RETURNING id, index_number
    """,
    "section_instructors": """
        INSERT INTO section_instructors (section_id, instructor_id)
        VALUES %s
        ON CONFLICT (section_id, instructor_id) DO NOTHING
    """,
    "section_comments": """
        INSERT INTO section_comments (section_id, code, description)
        VALUES %s
    """,
    "section_campus_locations": """
        INSERT INTO section_campus_locations (section_id, code, description)
        VALUES %s
    """,
    "section_majors": """
        INSERT INTO section_majors (section_id, code, is_major_code, is_unit_code)
        VALUES %s
    """,
    "section_minors": """
        INSERT INTO section_minors (section_id, code)
        VALUES %s
    """,
    "section_unit_majors": """
        INSERT INTO section_unit_majors (section_id, unit_code, major_code)
        VALUES %s
    """,
    "section_honor_programs": """
        INSERT INTO section_honor_programs (section_id, code)
        VALUES %s
    """,
    "cross_listed_sections": """
        INSERT INTO cross_listed_sections (
            section_id, course_number, supplement_code, section_number,
            offering_unit_campus, offering_unit_code, subject_code,
            registration_index, primary_registration_index
        ) VALUES %s
    """,
    "meeting_times": """
        INSERT INTO meeting_times (
            section_id, meeting_day, start_time_military, end_time_military,
            start_time, end_time, pm_code, campus_location, campus_name,
            campus_abbrev, building_code, room_number,
            meeting_mode_code, meeting_mode_desc, ba_class_hours
        ) VALUES %s
    """,
}

# -----------------------------------------------------------------------------
# Bulk Inserter Class
# -----------------------------------------------------------------------------
class BulkInserter:
    """
    Buffers rows per table and performs bulk inserts using execute_values.
    This dramatically reduces DB round-trips compared to individual INSERTs.
    """
    
    def __init__(self, cursor, buffer_size: int = BULK_INSERT_BUFFER_SIZE):
        self.cursor = cursor
        self.buffer_size = buffer_size
        self.buffers: Dict[str, List[tuple]] = defaultdict(list)
        self.stats: Dict[str, int] = defaultdict(int)
    
    def add(self, table_name: str, row: tuple) -> None:
        """Add a row to the buffer for the specified table."""
        self.buffers[table_name].append(row)
        if len(self.buffers[table_name]) >= self.buffer_size:
            self.flush_table(table_name)
    
    def add_many(self, table_name: str, rows: List[tuple]) -> None:
        """Add multiple rows to the buffer."""
        self.buffers[table_name].extend(rows)
        if len(self.buffers[table_name]) >= self.buffer_size:
            self.flush_table(table_name)
    
    def flush_table(self, table_name: str) -> Optional[List[tuple]]:
        """Flush the buffer for a specific table and return results if any."""
        if not self.buffers[table_name]:
            return None
        
        rows = self.buffers[table_name]
        sql = SQL_TEMPLATES.get(table_name)
        if not sql:
            raise ValueError(f"No SQL template for table: {table_name}")
        
        self.stats[table_name] += len(rows)
        
        # Use fetch=True for tables that return IDs
        if "RETURNING" in sql:
            results = execute_values(self.cursor, sql, rows, fetch=True)
            self.buffers[table_name] = []
            return results
        else:
            execute_values(self.cursor, sql, rows, page_size=1000)
            self.buffers[table_name] = []
            return None
    
    def flush_all(self) -> None:
        """Flush all table buffers."""
        for table_name in list(self.buffers.keys()):
            self.flush_table(table_name)
    
    def get_stats(self) -> Dict[str, int]:
        """Return statistics on rows inserted per table."""
        return dict(self.stats)


# -----------------------------------------------------------------------------
# Lookup Extraction (Pre-populate before workers)
# -----------------------------------------------------------------------------
def extract_lookups(courses: List[Dict]) -> Tuple[Dict[str, str], Dict[str, Tuple[str, str]], Set[str]]:
    """
    Scan all courses to extract unique schools, subjects, and instructors.
    This allows us to bulk-insert lookup tables once before spawning workers.
    
    Returns:
        - schools: {code: description}
        - subjects: {code: (description, notes)}
        - instructors: set of names
    """
    schools: Dict[str, str] = {}
    subjects: Dict[str, Tuple[str, str]] = {}
    instructors: Set[str] = set()
    
    for course in courses:
        # Extract school
        if course.get("school"):
            code = course["school"].get("code", "")
            desc = course["school"].get("description", "")
            if code:
                schools[code] = desc
        
        # Extract subject
        if course.get("subject"):
            code = course["subject"]
            desc = course.get("subjectDescription", "")
            notes = course.get("subjectNotes")
            subjects[code] = (desc, notes)
        
        # Extract instructors from all sections
        for section in course.get("sections", []):
            for instr in section.get("instructors", []):
                name = instr.get("name")
                if name:
                    instructors.add(name)
    
    return schools, subjects, instructors


def populate_lookups(conn, schools: Dict[str, str], subjects: Dict[str, Tuple[str, str]], 
                     instructors: Set[str]) -> Tuple[Dict[str, int], Dict[str, int], Dict[str, int]]:
    """
    Bulk insert lookup tables and return ID mappings.
    This is done once in the main process before spawning workers.
    """
    cursor = conn.cursor()
    
    # Insert schools
    school_cache: Dict[str, int] = {}
    if schools:
        school_rows = [(code, desc) for code, desc in schools.items()]
        execute_values(cursor, """
            INSERT INTO schools (code, description)
            VALUES %s
            ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
            RETURNING id, code
        """, school_rows, fetch=True)
        for row in cursor.fetchall():
            school_cache[row[1]] = row[0]
    
    # Insert subjects
    subject_cache: Dict[str, int] = {}
    if subjects:
        subject_rows = [(code, desc, notes) for code, (desc, notes) in subjects.items()]
        execute_values(cursor, """
            INSERT INTO subjects (code, description, notes)
            VALUES %s
            ON CONFLICT (code) DO UPDATE SET 
                description = EXCLUDED.description,
                notes = COALESCE(EXCLUDED.notes, subjects.notes)
            RETURNING id, code
        """, subject_rows, fetch=True)
        for row in cursor.fetchall():
            subject_cache[row[1]] = row[0]
    
    # Insert instructors
    instructor_cache: Dict[str, int] = {}
    if instructors:
        instructor_rows = [(name,) for name in instructors]
        execute_values(cursor, """
            INSERT INTO instructors (name)
            VALUES %s
            ON CONFLICT (name) DO NOTHING
        """, instructor_rows)
        
        # Fetch all instructor IDs (including pre-existing ones)
        cursor.execute("SELECT id, name FROM instructors WHERE name = ANY(%s)", (list(instructors),))
        for row in cursor.fetchall():
            instructor_cache[row[1]] = row[0]
    
    conn.commit()
    cursor.close()
    
    return school_cache, subject_cache, instructor_cache


# -----------------------------------------------------------------------------
# Worker Process Function
# -----------------------------------------------------------------------------
def process_chunk(
    chunk: List[Dict],
    chunk_index: int,
    db_config: Dict[str, str],
    term_id: int,
    school_cache: Dict[str, int],
    subject_cache: Dict[str, int],
    instructor_cache: Dict[str, int]
) -> Tuple[int, int, Dict[str, int]]:
    """
    Process a chunk of courses in a worker process.
    
    Uses a two-phase approach:
    1. Insert all courses, collect course_string -> course_id mapping
    2. Insert all sections with course_ids, collect index_number -> section_id mapping
    3. Bulk insert all section child data
    
    Returns:
        (courses_processed, sections_processed, insert_stats)
    """
    # Each worker gets its own connection
    conn = psycopg2.connect(**db_config)
    cursor = conn.cursor()
    bulk = BulkInserter(cursor)
    
    courses_processed = 0
    sections_processed = 0
    
    try:
        # =======================================================================
        # PHASE 1: Insert all courses, build course_string -> course_id mapping
        # =======================================================================
        course_id_map: Dict[str, int] = {}  # course_string -> course_id
        course_data_map: Dict[str, Dict] = {}  # course_string -> course data (for child tables)
        seen_courses: Set[str] = set()  # Track seen course_strings to avoid duplicates in batch
        
        for course in chunk:
            course_string = course.get("courseString")
            if not course_string:
                continue
            
            # Skip duplicates within this batch (ON CONFLICT can't handle same key twice in one INSERT)
            if course_string in seen_courses:
                continue
            seen_courses.add(course_string)
            
            # Get school_id and subject_id from caches
            school_id = None
            if course.get("school"):
                school_code = course["school"].get("code", "")
                school_id = school_cache.get(school_code)
            
            subject_id = None
            if course.get("subject"):
                subject_id = subject_cache.get(course["subject"])
            
            # Parse credits
            credits = course.get("credits")
            if isinstance(credits, (int, float)):
                credits = float(credits)
            else:
                credits = None
            
            # Prepare course row
            course_row = (
                term_id,
                course_string,
                course.get("offeringUnitCode"),
                course.get("subject"),
                course.get("courseNumber"),
                course.get("supplementCode"),
                course.get("title"),
                course.get("expandedTitle", "").strip() if course.get("expandedTitle") else None,
                course.get("level"),
                credits,
                course.get("creditsObject", {}).get("code") if course.get("creditsObject") else None,
                course.get("creditsObject", {}).get("description") if course.get("creditsObject") else None,
                school_id,
                subject_id,
                course.get("mainCampus"),
                course.get("campusCode"),
                course.get("openSections", 0),
                course.get("synopsisUrl"),
                course.get("courseDescription"),
                course.get("courseNotes"),
                course.get("unitNotes"),
                course.get("preReqNotes"),
                course.get("courseFee"),
                course.get("courseFeeDescr")
            )
            
            bulk.add("courses", course_row)
            course_data_map[course_string] = course
        
        # Flush courses and collect IDs
        results = bulk.flush_table("courses")
        if results:
            for row in results:
                course_id_map[row[1]] = row[0]  # course_string -> id
        
        courses_processed = len(course_id_map)
        
        # =======================================================================
        # PHASE 1.5: Insert course child data (campus_locations, core_codes, prereqs)
        # =======================================================================
        for course_string, course_id in course_id_map.items():
            course = course_data_map.get(course_string, {})
            
            # Campus locations
            for loc in course.get("campusLocations", []):
                bulk.add("course_campus_locations", (
                    course_id, loc.get("code"), loc.get("description")
                ))
            
            # Core codes
            for cc in course.get("coreCodes", []):
                bulk.add("course_core_codes", (
                    course_id,
                    cc.get("coreCode"),
                    cc.get("coreCodeDescription"),
                    cc.get("effective"),
                    cc.get("lastUpdated")
                ))
            
            # Prerequisites
            if course.get("preReqNotes"):
                for prereq in parse_prerequisites(course["preReqNotes"]):
                    bulk.add("prerequisites", (
                        course_id,
                        prereq.course_string,
                        prereq.course_title,
                        prereq.logic_group,
                        prereq.is_or,
                        prereq.source_text
                    ))
        
        # Flush course child data
        bulk.flush_table("course_campus_locations")
        bulk.flush_table("course_core_codes")
        bulk.flush_table("prerequisites")
        
        # =======================================================================
        # PHASE 2: Insert all sections, build (course_id, index) -> section_id mapping
        # =======================================================================
        section_id_map: Dict[Tuple[int, str], int] = {}  # (course_id, index) -> section_id
        section_data_map: Dict[Tuple[int, str], Dict] = {}  # (course_id, index) -> section data
        seen_sections: Set[Tuple[int, str]] = set()  # Track seen (course_id, index) to avoid duplicates
        
        for course_string, course_id in course_id_map.items():
            course = course_data_map.get(course_string, {})
            
            for section in course.get("sections", []):
                index_number = section.get("index")
                if not index_number:
                    continue
                
                # Skip duplicates within this batch
                section_key = (course_id, index_number)
                if section_key in seen_sections:
                    continue
                seen_sections.add(section_key)
                
                section_row = (
                    course_id,
                    index_number,
                    section.get("number"),
                    bool(section.get("openStatus")),
                    section.get("openStatusText"),
                    section.get("sectionCourseType"),
                    section.get("examCode"),
                    section.get("examCodeText"),
                    section.get("finalExam"),
                    section.get("sectionEligibility"),
                    section.get("openToText"),
                    section.get("crossListedSectionType"),
                    section.get("crossListedSectionsText"),
                    section.get("sectionNotes"),
                    section.get("commentsText"),
                    section.get("subtitle", "").strip() if section.get("subtitle") else None,
                    section.get("subtopic"),
                    section.get("specialPermissionAddCode"),
                    section.get("specialPermissionAddCodeDescription"),
                    section.get("specialPermissionDropCode"),
                    section.get("specialPermissionDropCodeDescription"),
                    section.get("courseFee"),
                    section.get("courseFeeDescr"),
                    section.get("campusCode"),
                    section.get("printed"),
                    section.get("sessionDatePrintIndicator"),
                    section.get("sessionDates")
                )
                
                bulk.add("sections", section_row)
                section_data_map[(course_id, index_number)] = section
        
        # Flush sections and collect IDs
        results = bulk.flush_table("sections")
        if results:
            # Results contain (section_id, index_number), but we need course_id too
            # We need to match by index_number within the current batch
            # Since we process one chunk at a time, we can use a reverse lookup
            for row in results:
                section_id, index_number = row
                # Find the course_id for this index_number
                for (course_id, idx), section in section_data_map.items():
                    if idx == index_number:
                        section_id_map[(course_id, index_number)] = section_id
                        break
        
        sections_processed = len(section_id_map)
        
        # =======================================================================
        # PHASE 3: Insert all section child data
        # =======================================================================
        for (course_id, index_number), section_id in section_id_map.items():
            section = section_data_map.get((course_id, index_number), {})
            
            # Instructors (using pre-populated cache)
            for instr in section.get("instructors", []):
                name = instr.get("name")
                if name and name in instructor_cache:
                    bulk.add("section_instructors", (section_id, instructor_cache[name]))
            
            # Comments
            for comment in section.get("comments", []):
                bulk.add("section_comments", (
                    section_id, comment.get("code"), comment.get("description")
                ))
            
            # Campus locations
            for loc in section.get("sectionCampusLocations", []):
                bulk.add("section_campus_locations", (
                    section_id, loc.get("code"), loc.get("description")
                ))
            
            # Majors
            for major in section.get("majors", []):
                bulk.add("section_majors", (
                    section_id,
                    major.get("code"),
                    major.get("isMajorCode", False),
                    major.get("isUnitCode", False)
                ))
            
            # Minors
            for minor in section.get("minors", []):
                bulk.add("section_minors", (section_id, minor.get("code")))
            
            # Unit majors
            for um in section.get("unitMajors", []):
                bulk.add("section_unit_majors", (
                    section_id, um.get("unitCode"), um.get("majorCode")
                ))
            
            # Honor programs
            for hp in section.get("honorPrograms", []):
                bulk.add("section_honor_programs", (section_id, hp.get("code")))
            
            # Cross-listed sections
            for xl in section.get("crossListedSections", []):
                bulk.add("cross_listed_sections", (
                    section_id,
                    xl.get("courseNumber"),
                    xl.get("supplementCode"),
                    xl.get("sectionNumber"),
                    xl.get("offeringUnitCampus"),
                    xl.get("offeringUnitCode"),
                    xl.get("subjectCode"),
                    xl.get("registrationIndex"),
                    xl.get("primaryRegistrationIndex")
                ))
            
            # Meeting times
            for mt in section.get("meetingTimes", []):
                bulk.add("meeting_times", (
                    section_id,
                    mt.get("meetingDay"),
                    mt.get("startTimeMilitary"),
                    mt.get("endTimeMilitary"),
                    mt.get("startTime"),
                    mt.get("endTime"),
                    mt.get("pmCode"),
                    mt.get("campusLocation"),
                    mt.get("campusName"),
                    mt.get("campusAbbrev"),
                    mt.get("buildingCode"),
                    mt.get("roomNumber"),
                    mt.get("meetingModeCode"),
                    mt.get("meetingModeDesc"),
                    mt.get("baClassHours")
                ))
        
        # Flush all remaining buffers
        bulk.flush_all()
        
        # Commit the transaction
        conn.commit()
        
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"Worker {chunk_index} failed: {e}") from e
    finally:
        cursor.close()
        conn.close()
    
    return courses_processed, sections_processed, bulk.get_stats()


# -----------------------------------------------------------------------------
# Main Ingestion Orchestrator
# -----------------------------------------------------------------------------
class ParallelCourseIngester:
    """
    Orchestrates parallel ingestion of course data.
    """
    
    def __init__(self, db_config: Dict[str, str], num_workers: int = NUM_WORKERS):
        self.db_config = db_config
        self.num_workers = num_workers
    
    def get_or_create_term(self, conn, year: str, term: str, campus: str) -> int:
        """Get or create a term record"""
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO terms (year, term, campus)
            VALUES (%s, %s, %s)
            ON CONFLICT (year, term, campus) 
            DO UPDATE SET fetched_at = NOW()
            RETURNING id
        """, (int(year), term, campus))
        term_id = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        return term_id
    
    def clear_term_data(self, conn, term_id: int):
        """Clear all data for a term (for fresh re-import)"""
        cursor = conn.cursor()
        cursor.execute("DELETE FROM courses WHERE term_id = %s", (term_id,))
        conn.commit()
        cursor.close()
        print(f"Cleared existing data for term {term_id}")
    
    def ingest_term(self, year: str, term: str, campus: str, 
                    clear_existing: bool = False, 
                    json_file: Optional[str] = None) -> Tuple[int, int]:
        """
        Ingest all courses for a specific term using parallel processing.
        
        Args:
            year: Academic year
            term: Term code (1=Spring, 7=Summer, 9=Fall)
            campus: Campus code (NB, NK, CM)
            clear_existing: Whether to clear existing data before import
            json_file: Optional path to local JSON file instead of API
        
        Returns:
            (total_courses, total_sections)
        """
        start_time = time.time()
        
        # Load data
        if json_file:
            print(f"Loading data from file: {json_file}")
            with open(json_file, 'r') as f:
                courses = json.load(f)
        else:
            url = f"{BASE_URL}?year={year}&term={term}&campus={campus}"
            print(f"Fetching: {url}")
            response = requests.get(url, timeout=120)
            response.raise_for_status()
            courses = response.json()
        
        print(f"Loaded {len(courses)} courses")
        
        # Connect to database for setup
        conn = psycopg2.connect(**self.db_config)
        
        try:
            # Get or create term
            term_id = self.get_or_create_term(conn, year, term, campus)
            print(f"Term ID: {term_id}")
            
            # Optionally clear existing data
            if clear_existing:
                self.clear_term_data(conn, term_id)
            
            # =======================================================================
            # Pre-populate lookup tables (schools, subjects, instructors)
            # =======================================================================
            print("Extracting lookup data...")
            schools, subjects, instructors = extract_lookups(courses)
            print(f"  Found {len(schools)} schools, {len(subjects)} subjects, {len(instructors)} instructors")
            
            print("Populating lookup tables...")
            school_cache, subject_cache, instructor_cache = populate_lookups(
                conn, schools, subjects, instructors
            )
            print("  Lookup tables populated")
            
            conn.close()  # Close main connection before spawning workers
            
            # =======================================================================
            # Split data into chunks for parallel processing
            # =======================================================================
            chunk_size = max(1, len(courses) // self.num_workers + 1)
            chunks = [courses[i:i+chunk_size] for i in range(0, len(courses), chunk_size)]
            actual_workers = len(chunks)
            
            print(f"\nParallel processing with {actual_workers} workers (chunk size: {chunk_size})")
            
            # =======================================================================
            # Process chunks in parallel
            # =======================================================================
            total_courses = 0
            total_sections = 0
            all_stats: Dict[str, int] = defaultdict(int)
            
            with ProcessPoolExecutor(max_workers=actual_workers) as executor:
                futures = {}
                for i, chunk in enumerate(chunks):
                    future = executor.submit(
                        process_chunk,
                        chunk,
                        i,
                        self.db_config,
                        term_id,
                        school_cache,
                        subject_cache,
                        instructor_cache
                    )
                    futures[future] = i
                
                # Collect results as they complete
                for future in as_completed(futures):
                    chunk_index = futures[future]
                    try:
                        courses_count, sections_count, stats = future.result()
                        total_courses += courses_count
                        total_sections += sections_count
                        for table, count in stats.items():
                            all_stats[table] += count
                        print(f"  Worker {chunk_index + 1}/{actual_workers} completed: "
                              f"{courses_count} courses, {sections_count} sections")
                    except Exception as e:
                        print(f"  Worker {chunk_index + 1}/{actual_workers} FAILED: {e}")
                        raise
            
            elapsed = time.time() - start_time
            
            print(f"\n{'='*60}")
            print(f"Completed in {elapsed:.2f} seconds")
            print(f"Total: {total_courses} courses, {total_sections} sections")
            print(f"Rate: {total_courses/elapsed:.1f} courses/sec, {total_sections/elapsed:.1f} sections/sec")
            print(f"\nInsert statistics:")
            for table, count in sorted(all_stats.items()):
                print(f"  {table}: {count:,} rows")
            print(f"{'='*60}")
            
            return total_courses, total_sections
            
        except Exception as e:
            print(f"Ingestion failed: {e}")
            raise
        finally:
            if not conn.closed:
                conn.close()


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Ingest Rutgers course data (parallelized)")
    parser.add_argument("--year", default="2025", help="Year to fetch (default: 2025)")
    parser.add_argument("--term", default="1", choices=["0", "1", "7", "9"],
                        help="Term: 0=Winter, 1=Spring, 7=Summer, 9=Fall (default: 1)")
    parser.add_argument("--campus", default="NB", choices=["NB", "NK", "CM", "ONLINE_NB", "ONLINE_NK", "ONLINE_CM"],
                        help="Campus: NB=New Brunswick, NK=Newark, CM=Camden, ONLINE_XX=Online variants (default: NB)")
    parser.add_argument("--all-campuses", action="store_true",
                        help="Fetch all campuses for the given year/term")
    parser.add_argument("--clear", action="store_true",
                        help="Clear existing data for the term before importing")
    parser.add_argument("--init-schema", action="store_true",
                        help="Initialize the database schema before importing")
    parser.add_argument("--json-file", type=str,
                        help="Load from local JSON file instead of API")
    parser.add_argument("--workers", type=int, default=NUM_WORKERS,
                        help=f"Number of worker processes (default: {NUM_WORKERS})")
    
    args = parser.parse_args()
    
    # Database configuration
    db_config = {
        "host": PG_HOST,
        "port": PG_PORT,
        "database": PG_DATABASE,
        "user": PG_USER,
        "password": PG_PASSWORD
    }
    
    # Initialize schema if requested
    if args.init_schema:
        print("Initializing schema...")
        conn = psycopg2.connect(**db_config)
        schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
        with open(schema_path, "r") as f:
            schema_sql = f.read()
        cursor = conn.cursor()
        cursor.execute(schema_sql)
        conn.commit()
        cursor.close()
        conn.close()
        print("Schema initialized successfully")
    
    # Create ingester
    ingester = ParallelCourseIngester(db_config, num_workers=args.workers)
    
    # Process campuses
    campuses = ["NB", "NK", "CM"] if args.all_campuses else [args.campus]
    
    grand_total_courses = 0
    grand_total_sections = 0
    
    for campus in campuses:
        print(f"\n{'='*60}")
        print(f"Processing {args.year} Term {args.term} Campus {campus}")
        print(f"{'='*60}")
        
        courses, sections = ingester.ingest_term(
            args.year, 
            args.term, 
            campus, 
            clear_existing=args.clear,
            json_file=args.json_file
        )
        grand_total_courses += courses
        grand_total_sections += sections
    
    if len(campuses) > 1:
        print(f"\n{'='*60}")
        print(f"GRAND TOTAL: {grand_total_courses} courses, {grand_total_sections} sections")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()
