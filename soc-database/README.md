# Rutgers Course Database - Beta 3

Optimized schema and ingestion pipeline for Rutgers course data, supporting:
- **Course Search** - Find courses by subject, credits, time, instructor, open status
- **Schedule Builder** - Conflict detection with efficient meeting time queries
- **Notifications** - Track section open/closed status changes
- **Analytics** - Instructor statistics, enrollment trends across terms
- **Prerequisites** - Parsed prerequisite graph from HTML

## Files

| File | Description |
|------|-------------|
| `schema.sql` | PostgreSQL schema with tables, indexes, and views |
| `schema_amendments.sql` | Schema changes based on fuzzing findings |
| `ingest_courses.py` | Python script to fetch and load course data |
| `analyze_api.py` | Initial API analysis tool |
| `full_fuzz_api.py` | Comprehensive API fuzzing script |
| `full_fuzz_report.md` | Complete fuzzing results report |
| `parameter_discovery.json` | Discovered API parameters |
| `endpoint_discovery.json` | Discovered API endpoints |
| `field_inventory_report.md` | Field documentation |
| `field_inventory.json` | Raw field analysis data |
| `OPTIMIZATION.md` | Performance optimization notes |

## Quick Start

### 1. Set up environment
```bash
cp .env.example .env
# Get connection string from Supabase Dashboard:
# Project Settings > Database > Connect > Session pooler

pip install psycopg2-binary python-dotenv requests
```

### 2. Initialize database schema
```bash
python ingest_courses.py --init-schema
```

> **Note:** For Supabase projects, the schema is typically managed via migrations.
> Only use `--init-schema` for fresh local PostgreSQL instances.

### 3. Import course data
```bash
# Winter term (smallest dataset, good for testing)
python ingest_courses.py --year 2025 --term 0 --campus NB

# Single campus
python ingest_courses.py --year 2025 --term 1 --campus NB

# All campuses for a term
python ingest_courses.py --year 2025 --term 1 --all-campuses

# Fresh import (clears existing term data)
python ingest_courses.py --year 2025 --term 1 --campus NB --clear
```

## Schema Overview

```
terms (year, term, campus)
    └── courses
            ├── course_campus_locations
            ├── course_core_codes
            ├── prerequisites (parsed from preReqNotes)
            └── sections
                    ├── section_instructors → instructors (normalized)
                    ├── section_comments
                    ├── section_campus_locations
                    ├── section_majors
                    ├── section_minors
                    ├── section_unit_majors
                    ├── section_honor_programs
                    ├── cross_listed_sections
                    └── meeting_times
```

## Key Indexes

| Use Case | Index |
|----------|-------|
| Course search by subject | `idx_courses_term_subject` |
| Schedule conflict detection | `idx_meeting_times_schedule` |
| Open section notifications | `idx_sections_status` |
| Instructor analytics | `idx_section_instructors_instructor` |
| Prerequisite lookup | `idx_prerequisites_required` |

## Views

- `v_course_search` - Denormalized course data for search
- `v_section_details` - Section info with aggregated instructors
- `v_schedule_builder` - Meeting times joined with course/section data
- `v_instructor_stats` - Instructor teaching statistics across terms

## Term Codes

| Code | Term | Notes |
|------|------|-------|
| `0` | Winter | ~600 courses (discovered via fuzzing) |
| `1` | Spring | ~21,500 courses |
| `7` | Summer | ~5,300 courses (has `session_dates` field) |
| `9` | Fall | ~19,700 courses |

## Campus Codes

| Code | Campus |
|------|--------|
| `NB` | New Brunswick |
| `NK` | Newark |
| `CM` | Camden |
| `ONLINE_NB` | New Brunswick - Online |
| `ONLINE_NK` | Newark - Online |
| `ONLINE_CM` | Camden - Online |

## API Endpoints Discovered

| Endpoint | Description |
|----------|-------------|
| `/courses.json` | Full course data with sections, instructors, meeting times |
| `/openSections.json` | Array of open section index numbers only |

## Key Findings from Full Fuzzing

1. **Winter term exists** - Term code `0` returns 126+ courses per campus
2. **Summer has session_dates** - Format: `"07/07/2025 - 08/01/2025"`
3. **Online campus variants** - `ONLINE_NB`, `ONLINE_NK`, `ONLINE_CM` are valid
4. **level/subject params don't filter** - They're accepted but return all data
5. **Error handling** - Invalid params return `[]`, missing required params return `400`