#!/usr/bin/env python3
"""
Full Rutgers SIS API Fuzzer
Comprehensive exploration of the undocumented API to discover all parameters,
endpoints, field variations, and edge cases.
"""

import requests
import json
import time
from collections import defaultdict
from typing import Any, Dict, List, Set, Tuple, Optional
from dataclasses import dataclass, field
from datetime import datetime
import re

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
BASE_URL = "https://sis.rutgers.edu/soc/api"

# Full parameter matrix from research
YEARS = ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]
TERMS = ["0", "1", "7", "9"]  # 0=Winter, 1=Spring, 7=Summer, 9=Fall
CAMPUSES = ["NB", "NK", "CM", "ONLINE_NB", "ONLINE_NK", "ONLINE_CM"]
LEVELS = ["U", "G"]  # Undergraduate, Graduate

# Known subject codes to test (sample)
SAMPLE_SUBJECTS = ["198", "640", "750", "119", "014"]  # CS, Math, Physics, Econ, Africana

# Endpoints to probe
ENDPOINTS_TO_PROBE = [
    "/courses.json",
    "/subjects.json", 
    "/openSections.json",
    "/buildings.json",
    "/instructors.json",
    "/schools.json",
    "/campus.json",
    "/terms.json",
]

# Rate limiting
REQUEST_DELAY = 0.5  # seconds between requests

# -----------------------------------------------------------------------------
# Data Classes
# -----------------------------------------------------------------------------
@dataclass
class EndpointResult:
    """Result of probing an endpoint"""
    url: str
    status_code: int
    response_time: float
    content_type: Optional[str]
    data_sample: Optional[Any]
    error_message: Optional[str]
    is_valid: bool

@dataclass
class ParameterTestResult:
    """Result of testing a parameter combination"""
    params: Dict[str, str]
    status_code: int
    response_time: float
    record_count: int
    has_data: bool
    error_message: Optional[str]

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
    sources: Set[str] = field(default_factory=set)  # Which year/term/campus
    
    @property
    def null_rate(self) -> float:
        if self.total_count == 0:
            return 0.0
        return self.null_count / self.total_count

# -----------------------------------------------------------------------------
# API Probing Functions
# -----------------------------------------------------------------------------
def probe_endpoint(endpoint: str, params: Dict[str, str] = None) -> EndpointResult:
    """Probe a single endpoint to see if it exists"""
    url = f"{BASE_URL}{endpoint}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    
    start_time = time.time()
    try:
        response = requests.get(url, timeout=30)
        response_time = time.time() - start_time
        
        content_type = response.headers.get("Content-Type", "")
        
        # Try to parse JSON
        data_sample = None
        if response.status_code == 200:
            try:
                data = response.json()
                if isinstance(data, list):
                    data_sample = f"Array with {len(data)} items"
                    if len(data) > 0:
                        data_sample += f", first item keys: {list(data[0].keys())[:5] if isinstance(data[0], dict) else type(data[0])}"
                elif isinstance(data, dict):
                    data_sample = f"Object with keys: {list(data.keys())[:10]}"
                else:
                    data_sample = str(data)[:100]
            except:
                data_sample = response.text[:200] if response.text else None
        
        return EndpointResult(
            url=url,
            status_code=response.status_code,
            response_time=response_time,
            content_type=content_type,
            data_sample=data_sample,
            error_message=None if response.status_code == 200 else response.text[:200],
            is_valid=response.status_code == 200
        )
    except requests.RequestException as e:
        return EndpointResult(
            url=url,
            status_code=0,
            response_time=time.time() - start_time,
            content_type=None,
            data_sample=None,
            error_message=str(e),
            is_valid=False
        )

def discover_endpoints() -> List[EndpointResult]:
    """Probe all potential endpoints"""
    results = []
    print("=" * 60)
    print("PHASE 1: Endpoint Discovery")
    print("=" * 60)
    
    # Test each endpoint with minimal params
    base_params = {"year": "2025", "term": "1", "campus": "NB"}
    
    for endpoint in ENDPOINTS_TO_PROBE:
        print(f"Probing: {endpoint}...", end=" ")
        
        # Try with and without params
        result = probe_endpoint(endpoint, base_params)
        
        if result.is_valid:
            print(f"✓ Found! ({result.status_code})")
        else:
            # Try without params
            result_no_params = probe_endpoint(endpoint)
            if result_no_params.is_valid:
                result = result_no_params
                print(f"✓ Found (no params needed)! ({result.status_code})")
            else:
                print(f"✗ Not found ({result.status_code})")
        
        results.append(result)
        time.sleep(REQUEST_DELAY)
    
    return results

# -----------------------------------------------------------------------------
# Parameter Testing Functions
# -----------------------------------------------------------------------------
def test_parameter(base_params: Dict[str, str], param_name: str, param_value: str) -> ParameterTestResult:
    """Test if a parameter affects the response"""
    params = {**base_params, param_name: param_value}
    url = f"{BASE_URL}/courses.json"
    
    start_time = time.time()
    try:
        response = requests.get(url, params=params, timeout=60)
        response_time = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            return ParameterTestResult(
                params=params,
                status_code=response.status_code,
                response_time=response_time,
                record_count=len(data) if isinstance(data, list) else 1,
                has_data=len(data) > 0 if isinstance(data, list) else bool(data),
                error_message=None
            )
        else:
            return ParameterTestResult(
                params=params,
                status_code=response.status_code,
                response_time=response_time,
                record_count=0,
                has_data=False,
                error_message=response.text[:200]
            )
    except Exception as e:
        return ParameterTestResult(
            params=params,
            status_code=0,
            response_time=time.time() - start_time,
            record_count=0,
            has_data=False,
            error_message=str(e)
        )

def test_parameters() -> Dict[str, List[ParameterTestResult]]:
    """Test all parameter variations"""
    results = defaultdict(list)
    
    print("\n" + "=" * 60)
    print("PHASE 2: Parameter Testing")
    print("=" * 60)
    
    base_params = {"year": "2025", "term": "1", "campus": "NB"}
    
    # Test level parameter
    print("\nTesting 'level' parameter...")
    for level in LEVELS:
        print(f"  level={level}...", end=" ")
        result = test_parameter(base_params, "level", level)
        results["level"].append(result)
        print(f"✓ {result.record_count} courses" if result.has_data else "✗ No data")
        time.sleep(REQUEST_DELAY)
    
    # Test subject parameter
    print("\nTesting 'subject' parameter...")
    for subject in SAMPLE_SUBJECTS:
        print(f"  subject={subject}...", end=" ")
        result = test_parameter(base_params, "subject", subject)
        results["subject"].append(result)
        print(f"✓ {result.record_count} courses" if result.has_data else "✗ No data")
        time.sleep(REQUEST_DELAY)
    
    # Test potential undocumented parameters
    print("\nTesting potential undocumented parameters...")
    undoc_params = [
        ("openOnly", "true"),
        ("openOnly", "1"),
        ("open", "true"),
        ("instructor", "SMITH"),
        ("building", "HLL"),
        ("day", "M"),
        ("credits", "3"),
    ]
    for param_name, param_value in undoc_params:
        print(f"  {param_name}={param_value}...", end=" ")
        result = test_parameter(base_params, param_name, param_value)
        results["undocumented"].append(result)
        # Check if it affected the count vs base
        base_result = test_parameter(base_params, "_dummy", "_dummy")
        if result.record_count != base_result.record_count and result.has_data:
            print(f"✓ WORKS! {result.record_count} vs {base_result.record_count} courses")
        elif result.has_data:
            print(f"~ Ignored ({result.record_count} courses)")
        else:
            print("✗ No data")
        time.sleep(REQUEST_DELAY)
    
    return dict(results)

# -----------------------------------------------------------------------------
# Full Coverage Data Collection
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

def traverse_json(obj: Any, path: str, field_registry: Dict[str, FieldInfo], 
                  source: str, max_samples: int = 5):
    """Recursively traverse JSON and collect field metadata"""
    if path not in field_registry:
        field_registry[path] = FieldInfo(path=path)
    
    info = field_registry[path]
    info.total_count += 1
    info.sources.add(source)
    
    if obj is None:
        info.null_count += 1
        info.types_seen.add("null")
        return
    
    value_type = analyze_value(obj)
    info.types_seen.add(value_type)
    
    # Collect sample values
    if value_type in ("string", "integer", "float", "boolean"):
        if len(info.sample_values) < max_samples and obj not in info.sample_values:
            info.sample_values.append(obj)
    
    # Handle arrays
    if isinstance(obj, list):
        info.is_array = True
        info.array_lengths.append(len(obj))
        for item in obj:
            traverse_json(item, f"{path}[*]", field_registry, source, max_samples)
    
    # Handle objects
    elif isinstance(obj, dict):
        for key, value in obj.items():
            child_path = f"{path}.{key}" if path else key
            traverse_json(value, child_path, field_registry, source, max_samples)

def collect_full_coverage() -> Tuple[Dict[str, FieldInfo], Dict[str, Any]]:
    """Collect data from all year/term/campus combinations"""
    field_registry: Dict[str, FieldInfo] = {}
    stats = {
        "combinations_tested": 0,
        "combinations_with_data": 0,
        "total_courses": 0,
        "by_term": defaultdict(int),
        "by_campus": defaultdict(int),
        "by_year": defaultdict(int),
        "errors": [],
        "response_times": [],
    }
    
    print("\n" + "=" * 60)
    print("PHASE 3: Full Coverage Data Collection")
    print("=" * 60)
    
    # Priority combinations first (most likely to have unique data)
    priority_combos = [
        # Winter term (never tested)
        ("2025", "0", "NB"), ("2024", "0", "NB"),
        # Summer term (sessionDates)
        ("2025", "7", "NB"), ("2024", "7", "NB"),
        # Online campuses
        ("2025", "1", "ONLINE_NB"), ("2025", "1", "ONLINE_NK"), ("2025", "1", "ONLINE_CM"),
    ]
    
    # Then regular combinations (subset to keep reasonable)
    regular_combos = []
    for year in ["2025", "2024", "2023"]:  # Last 3 years
        for term in TERMS:
            for campus in ["NB", "NK", "CM"]:  # Physical campuses
                combo = (year, term, campus)
                if combo not in priority_combos:
                    regular_combos.append(combo)
    
    all_combos = priority_combos + regular_combos
    total = len(all_combos)
    
    print(f"Testing {total} combinations...")
    print(f"Priority combinations: {len(priority_combos)}")
    print(f"Regular combinations: {len(regular_combos)}")
    print()
    
    for i, (year, term, campus) in enumerate(all_combos):
        term_name = {"0": "Winter", "1": "Spring", "7": "Summer", "9": "Fall"}.get(term, term)
        source = f"{year}-{term_name}-{campus}"
        
        print(f"[{i+1}/{total}] {source}...", end=" ")
        
        url = f"{BASE_URL}/courses.json"
        params = {"year": year, "term": term, "campus": campus}
        
        start_time = time.time()
        try:
            response = requests.get(url, params=params, timeout=120)
            response_time = time.time() - start_time
            stats["response_times"].append(response_time)
            
            if response.status_code == 200:
                data = response.json()
                course_count = len(data) if isinstance(data, list) else 0
                
                stats["combinations_tested"] += 1
                if course_count > 0:
                    stats["combinations_with_data"] += 1
                    stats["total_courses"] += course_count
                    stats["by_term"][term_name] += course_count
                    stats["by_campus"][campus] += course_count
                    stats["by_year"][year] += course_count
                    
                    # Analyze all courses
                    for course in data:
                        traverse_json(course, "", field_registry, source)
                    
                    print(f"✓ {course_count} courses ({response_time:.1f}s)")
                else:
                    print(f"~ Empty response ({response_time:.1f}s)")
            else:
                stats["errors"].append({
                    "source": source,
                    "status_code": response.status_code,
                    "error": response.text[:200]
                })
                print(f"✗ Error {response.status_code}")
                
        except Exception as e:
            stats["errors"].append({
                "source": source,
                "error": str(e)
            })
            print(f"✗ Exception: {str(e)[:50]}")
        
        time.sleep(REQUEST_DELAY)
    
    return field_registry, dict(stats)

# -----------------------------------------------------------------------------
# Error Response Analysis
# -----------------------------------------------------------------------------
def test_error_responses() -> List[Dict]:
    """Test how the API handles invalid inputs"""
    results = []
    
    print("\n" + "=" * 60)
    print("PHASE 4: Error Response Analysis")  
    print("=" * 60)
    
    invalid_tests = [
        {"year": "1999", "term": "1", "campus": "NB"},  # Old year
        {"year": "2099", "term": "1", "campus": "NB"},  # Future year
        {"year": "2025", "term": "5", "campus": "NB"},  # Invalid term
        {"year": "2025", "term": "99", "campus": "NB"},  # Invalid term
        {"year": "2025", "term": "1", "campus": "XX"},  # Invalid campus
        {"year": "2025", "term": "1", "campus": "ZZZ"},  # Invalid campus
        {"term": "1", "campus": "NB"},  # Missing year
        {"year": "2025", "campus": "NB"},  # Missing term
        {"year": "2025", "term": "1"},  # Missing campus
        {},  # No params
        {"year": "abc", "term": "1", "campus": "NB"},  # Non-numeric year
    ]
    
    for params in invalid_tests:
        desc = ", ".join(f"{k}={v}" for k, v in params.items()) or "(no params)"
        print(f"Testing: {desc}...", end=" ")
        
        url = f"{BASE_URL}/courses.json"
        try:
            response = requests.get(url, params=params, timeout=30)
            
            result = {
                "params": params,
                "status_code": response.status_code,
                "response_length": len(response.text),
                "response_preview": response.text[:200] if response.text else None,
                "is_json": False,
            }
            
            try:
                data = response.json()
                result["is_json"] = True
                result["data_type"] = type(data).__name__
                if isinstance(data, list):
                    result["record_count"] = len(data)
            except:
                pass
            
            results.append(result)
            print(f"Status {response.status_code}, {result.get('record_count', 'N/A')} records")
            
        except Exception as e:
            results.append({
                "params": params,
                "error": str(e)
            })
            print(f"Exception: {str(e)[:50]}")
        
        time.sleep(REQUEST_DELAY)
    
    return results

# -----------------------------------------------------------------------------
# Report Generation
# -----------------------------------------------------------------------------
def generate_full_report(
    endpoint_results: List[EndpointResult],
    param_results: Dict[str, List[ParameterTestResult]],
    field_registry: Dict[str, FieldInfo],
    stats: Dict[str, Any],
    error_results: List[Dict]
) -> str:
    """Generate comprehensive fuzzing report"""
    
    lines = [
        "# Rutgers SIS API - Full Fuzzing Report",
        f"Generated: {datetime.now().isoformat()}",
        "",
        "## Executive Summary",
        "",
        f"- **Combinations tested**: {stats.get('combinations_tested', 0)}",
        f"- **Combinations with data**: {stats.get('combinations_with_data', 0)}",
        f"- **Total courses analyzed**: {stats.get('total_courses', 0)}",
        f"- **Unique field paths discovered**: {len(field_registry)}",
        "",
        "---",
        "",
        "## 1. Endpoint Discovery",
        "",
        "| Endpoint | Status | Valid | Sample Data |",
        "|----------|--------|-------|-------------|",
    ]
    
    for result in endpoint_results:
        endpoint = result.url.replace(BASE_URL, "")
        valid = "✓" if result.is_valid else "✗"
        sample = str(result.data_sample)[:50] if result.data_sample else result.error_message or "N/A"
        sample = sample.replace("|", "\\|")
        lines.append(f"| `{endpoint}` | {result.status_code} | {valid} | {sample} |")
    
    lines.extend([
        "",
        "---",
        "",
        "## 2. Parameter Discovery",
        "",
        "### 2.1 Level Parameter",
        "",
        "| Value | Status | Courses | Works |",
        "|-------|--------|---------|-------|",
    ])
    
    for result in param_results.get("level", []):
        level = result.params.get("level", "?")
        works = "✓" if result.has_data else "✗"
        lines.append(f"| `{level}` | {result.status_code} | {result.record_count} | {works} |")
    
    lines.extend([
        "",
        "### 2.2 Subject Parameter",
        "",
        "| Value | Status | Courses | Works |",
        "|-------|--------|---------|-------|",
    ])
    
    for result in param_results.get("subject", []):
        subject = result.params.get("subject", "?")
        works = "✓" if result.has_data else "✗"
        lines.append(f"| `{subject}` | {result.status_code} | {result.record_count} | {works} |")
    
    lines.extend([
        "",
        "### 2.3 Undocumented Parameters",
        "",
        "| Parameter | Value | Status | Effect |",
        "|-----------|-------|--------|--------|",
    ])
    
    for result in param_results.get("undocumented", []):
        # Find the non-base param
        for k, v in result.params.items():
            if k not in ["year", "term", "campus", "_dummy"]:
                effect = f"{result.record_count} courses" if result.has_data else "No data"
                lines.append(f"| `{k}` | `{v}` | {result.status_code} | {effect} |")
                break
    
    lines.extend([
        "",
        "---",
        "",
        "## 3. Coverage by Dimension",
        "",
        "### 3.1 By Term",
        "",
        "| Term | Courses |",
        "|------|---------|",
    ])
    
    for term, count in sorted(stats.get("by_term", {}).items()):
        lines.append(f"| {term} | {count:,} |")
    
    lines.extend([
        "",
        "### 3.2 By Campus",
        "",
        "| Campus | Courses |",
        "|--------|---------|",
    ])
    
    for campus, count in sorted(stats.get("by_campus", {}).items()):
        lines.append(f"| {campus} | {count:,} |")
    
    lines.extend([
        "",
        "### 3.3 By Year",
        "",
        "| Year | Courses |",
        "|------|---------|",
    ])
    
    for year, count in sorted(stats.get("by_year", {}).items()):
        lines.append(f"| {year} | {count:,} |")
    
    lines.extend([
        "",
        "---",
        "",
        "## 4. Field Analysis",
        "",
        "### 4.1 Fields by Source Coverage",
        "",
        "Fields that only appear in certain terms/campuses:",
        "",
    ])
    
    # Find fields unique to certain sources
    all_sources = set()
    for info in field_registry.values():
        all_sources.update(info.sources)
    
    limited_fields = []
    for path, info in sorted(field_registry.items()):
        if info.path and len(info.sources) < len(all_sources) * 0.5:
            limited_fields.append((path, info))
    
    if limited_fields:
        lines.append("| Field | Sources | Null Rate |")
        lines.append("|-------|---------|-----------|")
        for path, info in limited_fields[:20]:
            sources = ", ".join(sorted(info.sources)[:3])
            if len(info.sources) > 3:
                sources += f"... (+{len(info.sources)-3})"
            lines.append(f"| `{path}` | {sources} | {info.null_rate:.1%} |")
    else:
        lines.append("All fields appear across most sources.")
    
    lines.extend([
        "",
        "### 4.2 Rare Fields (< 5% occurrence)",
        "",
        "| Field | Null Rate | Sample Values |",
        "|-------|-----------|---------------|",
    ])
    
    for path, info in sorted(field_registry.items(), key=lambda x: x[1].null_rate, reverse=True):
        if info.path and info.null_rate > 0.95:
            samples = str(info.sample_values[:3])[:40] if info.sample_values else "N/A"
            lines.append(f"| `{path}` | {info.null_rate:.1%} | {samples} |")
    
    lines.extend([
        "",
        "---",
        "",
        "## 5. Error Response Analysis",
        "",
        "| Test Case | Status | Records | Notes |",
        "|-----------|--------|---------|-------|",
    ])
    
    for result in error_results:
        params = ", ".join(f"{k}={v}" for k, v in result.get("params", {}).items()) or "(none)"
        status = result.get("status_code", "Error")
        records = result.get("record_count", "N/A")
        notes = result.get("error", "OK")[:30] if result.get("error") else "OK"
        lines.append(f"| {params} | {status} | {records} | {notes} |")
    
    lines.extend([
        "",
        "---",
        "",
        "## 6. Schema Implications",
        "",
        "Based on this analysis, the following schema changes may be needed:",
        "",
    ])
    
    # Check for new discoveries
    schema_changes = []
    
    # Check if sessionDates was found
    if "sections[*].sessionDates" in field_registry:
        info = field_registry["sections[*].sessionDates"]
        if info.null_rate < 1.0:
            schema_changes.append("- `sessionDates` field has data in some terms - add to sections table")
    
    # Check for any new fields
    expected_fields = {
        "courseString", "title", "credits", "sections", "meetingTimes",
        "instructors", "campusLocations", "coreCodes"
    }
    
    new_fields = []
    for path in field_registry:
        if path and "." not in path and "[" not in path:
            if path not in expected_fields:
                new_fields.append(path)
    
    if new_fields:
        schema_changes.append(f"- New top-level fields discovered: {', '.join(new_fields[:5])}")
    
    if schema_changes:
        lines.extend(schema_changes)
    else:
        lines.append("No schema changes required - all fields already covered.")
    
    return "\n".join(lines)

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("RUTGERS SIS API - FULL FUZZER")
    print("=" * 60)
    print()
    
    # Phase 1: Endpoint Discovery
    endpoint_results = discover_endpoints()
    
    # Phase 2: Parameter Testing
    param_results = test_parameters()
    
    # Phase 3: Full Coverage
    field_registry, stats = collect_full_coverage()
    
    # Phase 4: Error Analysis
    error_results = test_error_responses()
    
    # Generate report
    print("\n" + "=" * 60)
    print("Generating Report...")
    print("=" * 60)
    
    report = generate_full_report(
        endpoint_results,
        param_results,
        field_registry,
        stats,
        error_results
    )
    
    # Save report
    report_path = "full_fuzz_report.md"
    with open(report_path, "w") as f:
        f.write(report)
    print(f"Report saved to: {report_path}")
    
    # Save raw data
    raw_data = {
        "endpoints": [
            {
                "url": r.url,
                "status_code": r.status_code,
                "is_valid": r.is_valid,
                "data_sample": r.data_sample,
            }
            for r in endpoint_results
        ],
        "parameters": {
            name: [
                {
                    "params": r.params,
                    "status_code": r.status_code,
                    "record_count": r.record_count,
                    "has_data": r.has_data,
                }
                for r in results
            ]
            for name, results in param_results.items()
        },
        "stats": stats,
        "error_responses": error_results,
        "fields": [
            {
                "path": info.path,
                "types": list(info.types_seen),
                "null_rate": info.null_rate,
                "sample_values": info.sample_values[:5],
                "sources_count": len(info.sources),
            }
            for info in field_registry.values()
            if info.path
        ]
    }
    
    json_path = "full_fuzz_data.json"
    with open(json_path, "w") as f:
        json.dump(raw_data, f, indent=2, default=str)
    print(f"Raw data saved to: {json_path}")
    
    print()
    print("=" * 60)
    print("FUZZING COMPLETE!")
    print("=" * 60)
    print(f"Endpoints found: {sum(1 for r in endpoint_results if r.is_valid)}/{len(endpoint_results)}")
    print(f"Combinations with data: {stats.get('combinations_with_data', 0)}")
    print(f"Total courses analyzed: {stats.get('total_courses', 0):,}")
    print(f"Unique fields: {len(field_registry)}")

if __name__ == "__main__":
    main()
