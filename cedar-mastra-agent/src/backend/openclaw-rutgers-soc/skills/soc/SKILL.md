---
name: soc
description: Use Rutgers Schedule of Classes tools directly (no nested agent) for course search, section lookup, conflict checks, prerequisites, and metadata browsing.
metadata: {"openclaw":{"emoji":"🎓","skillKey":"rutgers-soc","requires":{"config":["plugins.entries.rutgers-soc.enabled"]}}}
---

# Rutgers SOC Skill

Use this skill when the user asks Rutgers class-planning questions.

## Tool map

- Find courses: `rutgers_soc_search_courses`
- Full course detail + sections: `rutgers_soc_get_course_details`
- Find sections by day/time/instructor/classroom: `rutgers_soc_search_sections`
- Lookup a specific index: `rutgers_soc_get_section_by_index`
- Validate overlap across section indices: `rutgers_soc_check_schedule_conflicts`
- Prerequisite and unlock chain: `rutgers_soc_get_prerequisites`
- Terms/subjects/schools/core codes/instructors: `rutgers_soc_browse_metadata`

## Rules

1. Call Rutgers SOC tools directly. Do not delegate to another agent.
2. Prefer `rutgers_soc_search_courses` first when the request is broad.
3. Use `rutgers_soc_get_course_details` after search when the user asks section availability or meeting details.
4. Use `rutgers_soc_check_schedule_conflicts` whenever the user compares multiple index numbers.
5. Keep responses concise: include course string, title, open/closed status, and index numbers when relevant.
6. If a user gives ambiguous classroom terms, normalize using `rutgers_soc_search_sections` classroom filters.

## `/soc` command usage

When user invokes `/soc ...`, interpret the remaining text as a Rutgers SOC request and use the mapped tools above.
