#!/usr/bin/env python3
"""
Rutgers SIS API Analyzer
Fetches course data from multiple campuses and terms to analyze the complete JSON structure.
Outputs a comprehensive field inventory report.
"""

import requests
import json
from collections import defaultdict
from typing import Any, Dict, List, Set, Tuple
from dataclasses import dataclass, field
import re

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
BASE_URL = "https://sis.rutgers.edu/soc/api/courses.json"

# Campuses to analyze
CAMPUSES = ["NB", "NK", "CM"]  # New Brunswick, Newark, Camden

# Terms to analyze (1=Spring, 7=Summer, 9=Fall)
TERMS = ["1", "9"]

# Years to analyze
YEARS = ["2025", "2024"]

# -----------------------------------------------------------------------------
# Data Classes
# -----------------------------------------------------------------------------
@dataclass
class FieldInfo:
    """Stores metadata about a JSON field"""
    path: str
    types_seen: Set[str] = field(default_factory=set)
    sample_values: List[Any] = field(default_factory=list)
    null_count: int = 0
    total_count: int = 0
    is_array: bool = False
    array_lengths: List[int] = field(default_factory=list)
    
    @property
    def null_rate(self) -> float:
        if self.total_count == 0:
            return 0.0
        return self.null_count / self.total_count
    
    @property
    def is_required(self) -> bool:
        return self.null_rate == 0.0 and self.total_count > 0

# -----------------------------------------------------------------------------
# API Fetching
# -----------------------------------------------------------------------------
def fetch_courses(year: str, term: str, campus: str) -> List[Dict]:
    """Fetch courses from the Rutgers SIS API"""
    url = f"{BASE_URL}?year={year}&term={term}&campus={campus}"
    print(f"Fetching: {url}")
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        data = response.json()
        print(f"  -> Retrieved {len(data)} courses")
        return data
    except requests.RequestException as e:
        print(f"  -> Error: {e}")
        return []

def fetch_all_data() -> Tuple[List[Dict], Dict[str, int]]:
    """Fetch data from all configured campuses/terms/years"""
    all_courses = []
    stats = defaultdict(int)
    
    for year in YEARS:
        for term in TERMS:
            for campus in CAMPUSES:
                courses = fetch_courses(year, term, campus)
                # Tag each course with its source
                for course in courses:
                    course["_source_year"] = year
                    course["_source_term"] = term
                    course["_source_campus"] = campus
                all_courses.extend(courses)
                stats[f"{year}-{term}-{campus}"] = len(courses)
    
    return all_courses, dict(stats)

# -----------------------------------------------------------------------------
# JSON Analysis
# -----------------------------------------------------------------------------
def analyze_value(value: Any) -> str:
    """Determine the type of a JSON value"""
    if value is None:
        return "null"
    elif isinstance(value, bool):
        return "boolean"
    elif isinstance(value, int):
        return "integer"
    elif isinstance(value, float):
        return "float"
    elif isinstance(value, str):
        return "string"
    elif isinstance(value, list):
        return "array"
    elif isinstance(value, dict):
        return "object"
    return "unknown"

def traverse_json(obj: Any, path: str, field_registry: Dict[str, FieldInfo], max_samples: int = 5):
    """Recursively traverse JSON and collect field metadata"""
    
    if path not in field_registry:
        field_registry[path] = FieldInfo(path=path)
    
    info = field_registry[path]
    info.total_count += 1
    
    if obj is None:
        info.null_count += 1
        info.types_seen.add("null")
        return
    
    value_type = analyze_value(obj)
    info.types_seen.add(value_type)
    
    # Collect sample values (for primitive types)
    if value_type in ("string", "integer", "float", "boolean"):
        if len(info.sample_values) < max_samples and obj not in info.sample_values:
            info.sample_values.append(obj)
    
    # Handle arrays
    if isinstance(obj, list):
        info.is_array = True
        info.array_lengths.append(len(obj))
        for i, item in enumerate(obj):
            # Use [*] notation for array elements
            traverse_json(item, f"{path}[*]", field_registry, max_samples)
    
    # Handle objects
    elif isinstance(obj, dict):
        for key, value in obj.items():
            # Skip our internal tags
            if key.startswith("_source_"):
                continue
            child_path = f"{path}.{key}" if path else key
            traverse_json(value, child_path, field_registry, max_samples)

def analyze_courses(courses: List[Dict]) -> Dict[str, FieldInfo]:
    """Analyze all courses and build field registry"""
    field_registry: Dict[str, FieldInfo] = {}
    
    for course in courses:
        traverse_json(course, "", field_registry)
    
    return field_registry

# -----------------------------------------------------------------------------
# Enumeration Analysis
# -----------------------------------------------------------------------------
def find_enumerations(courses: List[Dict]) -> Dict[str, Set[str]]:
    """Find fields that appear to be enumerations (limited set of values)"""
    enum_fields = [
        "level", "campusCode", "mainCampus", "examCode", 
        "openStatusText", "sectionCourseType", "meetingModeCode",
        "pmCode", "meetingDay", "baClassHours", "crossListedSectionType"
    ]
    
    enums = defaultdict(set)
    
    def extract_enums(obj: Any, parent_key: str = ""):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key in enum_fields and isinstance(value, str):
                    enums[key].add(value)
                extract_enums(value, key)
        elif isinstance(obj, list):
            for item in obj:
                extract_enums(item, parent_key)
    
    for course in courses:
        extract_enums(course)
    
    return dict(enums)

# -----------------------------------------------------------------------------
# Statistics
# -----------------------------------------------------------------------------
def compute_statistics(courses: List[Dict]) -> Dict[str, Any]:
    """Compute various statistics about the data"""
    stats = {
        "total_courses": len(courses),
        "total_sections": 0,
        "total_meeting_times": 0,
        "sections_per_course": [],
        "instructors_per_section": [],
        "meeting_times_per_section": [],
        "unique_instructors": set(),
        "unique_subjects": set(),
        "unique_schools": set(),
    }
    
    for course in courses:
        stats["unique_subjects"].add(course.get("subject"))
        if "school" in course and course["school"]:
            stats["unique_schools"].add(course["school"].get("description"))
        
        sections = course.get("sections", [])
        stats["total_sections"] += len(sections)
        stats["sections_per_course"].append(len(sections))
        
        for section in sections:
            instructors = section.get("instructors", [])
            stats["instructors_per_section"].append(len(instructors))
            for instr in instructors:
                if instr.get("name"):
                    stats["unique_instructors"].add(instr["name"])
            
            meeting_times = section.get("meetingTimes", [])
            stats["total_meeting_times"] += len(meeting_times)
            stats["meeting_times_per_section"].append(len(meeting_times))
    
    # Convert sets to counts for JSON serialization
    stats["unique_instructors_count"] = len(stats["unique_instructors"])
    stats["unique_subjects_count"] = len(stats["unique_subjects"])
    stats["unique_schools_count"] = len(stats["unique_schools"])
    
    # Compute averages
    if stats["sections_per_course"]:
        stats["avg_sections_per_course"] = sum(stats["sections_per_course"]) / len(stats["sections_per_course"])
        stats["max_sections_per_course"] = max(stats["sections_per_course"])
    
    if stats["instructors_per_section"]:
        stats["avg_instructors_per_section"] = sum(stats["instructors_per_section"]) / len(stats["instructors_per_section"])
        stats["max_instructors_per_section"] = max(stats["instructors_per_section"])
    
    if stats["meeting_times_per_section"]:
        stats["avg_meeting_times_per_section"] = sum(stats["meeting_times_per_section"]) / len(stats["meeting_times_per_section"])
        stats["max_meeting_times_per_section"] = max(stats["meeting_times_per_section"])
    
    # Remove non-serializable data
    del stats["sections_per_course"]
    del stats["instructors_per_section"]
    del stats["meeting_times_per_section"]
    del stats["unique_instructors"]
    del stats["unique_subjects"]
    del stats["unique_schools"]
    
    return stats

# -----------------------------------------------------------------------------
# Prerequisite Analysis
# -----------------------------------------------------------------------------
def analyze_prerequisites(courses: List[Dict]) -> Dict[str, Any]:
    """Analyze the preReqNotes field to understand its structure"""
    prereq_stats = {
        "courses_with_prereqs": 0,
        "sample_prereqs": [],
        "patterns_found": defaultdict(int),
    }
    
    # Common patterns in preReqNotes
    patterns = {
        "course_code": r"\d{2}:\d{3}:\d{3}",  # e.g., 01:013:140
        "html_or": r"<em>\s*OR\s*</em>",
        "html_and": r"<em>\s*AND\s*</em>",
        "parentheses": r"\([^)]+\)",
    }
    
    for course in courses:
        prereq_notes = course.get("preReqNotes", "")
        if prereq_notes and prereq_notes.strip():
            prereq_stats["courses_with_prereqs"] += 1
            
            # Collect samples
            if len(prereq_stats["sample_prereqs"]) < 10:
                prereq_stats["sample_prereqs"].append({
                    "courseString": course.get("courseString"),
                    "preReqNotes": prereq_notes[:500]  # Truncate long ones
                })
            
            # Check patterns
            for pattern_name, pattern in patterns.items():
                if re.search(pattern, prereq_notes, re.IGNORECASE):
                    prereq_stats["patterns_found"][pattern_name] += 1
    
    prereq_stats["patterns_found"] = dict(prereq_stats["patterns_found"])
    return prereq_stats

# -----------------------------------------------------------------------------
# Report Generation
# -----------------------------------------------------------------------------
def generate_report(
    field_registry: Dict[str, FieldInfo],
    enums: Dict[str, Set[str]],
    stats: Dict[str, Any],
    prereq_analysis: Dict[str, Any],
    fetch_stats: Dict[str, int]
) -> str:
    """Generate a comprehensive markdown report"""
    
    lines = [
        "# Rutgers SIS API Field Inventory Report",
        "",
        "## Data Sources",
        "",
        "| Year | Term | Campus | Courses |",
        "|------|------|--------|---------|",
    ]
    
    for source, count in sorted(fetch_stats.items()):
        year, term, campus = source.split("-")
        term_name = {"1": "Spring", "7": "Summer", "9": "Fall"}.get(term, term)
        lines.append(f"| {year} | {term_name} | {campus} | {count} |")
    
    lines.extend([
        "",
        f"**Total courses analyzed:** {stats['total_courses']}",
        "",
        "## High-Level Statistics",
        "",
        f"- Total sections: {stats['total_sections']}",
        f"- Total meeting times: {stats['total_meeting_times']}",
        f"- Unique subjects: {stats['unique_subjects_count']}",
        f"- Unique schools: {stats['unique_schools_count']}",
        f"- Unique instructors: {stats['unique_instructors_count']}",
        "",
        "### Cardinality",
        "",
        f"- Avg sections per course: {stats.get('avg_sections_per_course', 0):.2f}",
        f"- Max sections per course: {stats.get('max_sections_per_course', 0)}",
        f"- Avg instructors per section: {stats.get('avg_instructors_per_section', 0):.2f}",
        f"- Max instructors per section: {stats.get('max_instructors_per_section', 0)}",
        f"- Avg meeting times per section: {stats.get('avg_meeting_times_per_section', 0):.2f}",
        f"- Max meeting times per section: {stats.get('max_meeting_times_per_section', 0)}",
        "",
        "## Field Inventory",
        "",
        "| Path | Types | Null Rate | Required | Sample Values |",
        "|------|-------|-----------|----------|---------------|",
    ])
    
    # Sort fields by path
    sorted_fields = sorted(field_registry.items(), key=lambda x: x[0])
    
    for path, info in sorted_fields:
        if not path:  # Skip root
            continue
        types = ", ".join(sorted(info.types_seen))
        null_rate = f"{info.null_rate:.1%}"
        required = "✓" if info.is_required else ""
        samples = str(info.sample_values[:3])[:50] if info.sample_values else ""
        samples = samples.replace("|", "\\|")  # Escape pipes for markdown
        lines.append(f"| `{path}` | {types} | {null_rate} | {required} | {samples} |")
    
    lines.extend([
        "",
        "## Enumeration Values",
        "",
    ])
    
    for field_name, values in sorted(enums.items()):
        lines.append(f"### {field_name}")
        lines.append("")
        for val in sorted(values):
            lines.append(f"- `{val}`")
        lines.append("")
    
    lines.extend([
        "## Prerequisite Analysis",
        "",
        f"- Courses with prerequisites: {prereq_analysis['courses_with_prereqs']}",
        "",
        "### Pattern Frequency",
        "",
    ])
    
    for pattern, count in prereq_analysis["patterns_found"].items():
        lines.append(f"- {pattern}: {count}")
    
    lines.extend([
        "",
        "### Sample Prerequisites",
        "",
    ])
    
    for sample in prereq_analysis["sample_prereqs"][:5]:
        lines.append(f"**{sample['courseString']}:**")
        lines.append(f"```html")
        lines.append(sample["preReqNotes"])
        lines.append("```")
        lines.append("")
    
    return "\n".join(lines)

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("Rutgers SIS API Analyzer")
    print("=" * 60)
    print()
    
    # Fetch all data
    print("Phase 1: Fetching data from API...")
    all_courses, fetch_stats = fetch_all_data()
    print(f"\nTotal courses fetched: {len(all_courses)}")
    print()
    
    if not all_courses:
        print("No data fetched. Exiting.")
        return
    
    # Analyze JSON structure
    print("Phase 2: Analyzing JSON structure...")
    field_registry = analyze_courses(all_courses)
    print(f"Found {len(field_registry)} unique field paths")
    print()
    
    # Find enumerations
    print("Phase 3: Identifying enumeration fields...")
    enums = find_enumerations(all_courses)
    print(f"Found {len(enums)} enumeration fields")
    print()
    
    # Compute statistics
    print("Phase 4: Computing statistics...")
    stats = compute_statistics(all_courses)
    print()
    
    # Analyze prerequisites
    print("Phase 5: Analyzing prerequisites...")
    prereq_analysis = analyze_prerequisites(all_courses)
    print(f"Courses with prerequisites: {prereq_analysis['courses_with_prereqs']}")
    print()
    
    # Generate report
    print("Phase 6: Generating report...")
    report = generate_report(field_registry, enums, stats, prereq_analysis, fetch_stats)
    
    # Save report
    report_path = "field_inventory_report.md"
    with open(report_path, "w") as f:
        f.write(report)
    print(f"Report saved to: {report_path}")
    
    # Also save raw data as JSON for further analysis
    raw_data = {
        "fetch_stats": fetch_stats,
        "statistics": stats,
        "enumerations": {k: list(v) for k, v in enums.items()},
        "prerequisite_analysis": prereq_analysis,
        "fields": [
            {
                "path": info.path,
                "types": list(info.types_seen),
                "null_rate": info.null_rate,
                "is_required": info.is_required,
                "is_array": info.is_array,
                "sample_values": info.sample_values[:5],
                "avg_array_length": sum(info.array_lengths) / len(info.array_lengths) if info.array_lengths else None,
                "max_array_length": max(info.array_lengths) if info.array_lengths else None,
            }
            for info in field_registry.values()
            if info.path  # Skip root
        ]
    }
    
    json_path = "field_inventory.json"
    with open(json_path, "w") as f:
        json.dump(raw_data, f, indent=2, default=str)
    print(f"Raw data saved to: {json_path}")
    
    print()
    print("=" * 60)
    print("Analysis complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
