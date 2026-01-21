# Rutgers SIS API - Full Fuzzing Report
Generated: 2026-01-10T04:33:08.920776

## Executive Summary

- **Combinations tested**: 39
- **Combinations with data**: 39
- **Total courses analyzed**: 47266
- **Unique field paths discovered**: 134

---

## 1. Endpoint Discovery

| Endpoint | Status | Valid | Sample Data |
|----------|--------|-------|-------------|
| `/courses.json?year=2025&term=1&campus=NB` | 200 | ✓ | Array with 4486 items, first item keys: ['campusLo |
| `/subjects.json?year=2025&term=1&campus=NB` | 404 | ✗ | <!DOCTYPE html><html><head><title>Apache Tomcat/8.0.30 - Error report</title><style type="text/css">H1 {font-family:Tahoma,Arial,sans-serif;color:white;background-color:#525D76;font-size:22px;} H2 {fo |
| `/openSections.json?year=2025&term=1&campus=NB` | 200 | ✓ | Array with 8140 items, first item keys: <class 'st |
| `/buildings.json?year=2025&term=1&campus=NB` | 404 | ✗ | <!DOCTYPE html><html><head><title>Apache Tomcat/8.0.30 - Error report</title><style type="text/css">H1 {font-family:Tahoma,Arial,sans-serif;color:white;background-color:#525D76;font-size:22px;} H2 {fo |
| `/instructors.json?year=2025&term=1&campus=NB` | 404 | ✗ | <!DOCTYPE html><html><head><title>Apache Tomcat/8.0.30 - Error report</title><style type="text/css">H1 {font-family:Tahoma,Arial,sans-serif;color:white;background-color:#525D76;font-size:22px;} H2 {fo |
| `/schools.json?year=2025&term=1&campus=NB` | 404 | ✗ | <!DOCTYPE html><html><head><title>Apache Tomcat/8.0.30 - Error report</title><style type="text/css">H1 {font-family:Tahoma,Arial,sans-serif;color:white;background-color:#525D76;font-size:22px;} H2 {fo |
| `/campus.json?year=2025&term=1&campus=NB` | 404 | ✗ | <!DOCTYPE html><html><head><title>Apache Tomcat/8.0.30 - Error report</title><style type="text/css">H1 {font-family:Tahoma,Arial,sans-serif;color:white;background-color:#525D76;font-size:22px;} H2 {fo |
| `/terms.json?year=2025&term=1&campus=NB` | 404 | ✗ | <!DOCTYPE html><html><head><title>Apache Tomcat/8.0.30 - Error report</title><style type="text/css">H1 {font-family:Tahoma,Arial,sans-serif;color:white;background-color:#525D76;font-size:22px;} H2 {fo |

---

## 2. Parameter Discovery

### 2.1 Level Parameter

| Value | Status | Courses | Works |
|-------|--------|---------|-------|
| `U` | 200 | 4486 | ✓ |
| `G` | 200 | 4486 | ✓ |

### 2.2 Subject Parameter

| Value | Status | Courses | Works |
|-------|--------|---------|-------|
| `198` | 200 | 4486 | ✓ |
| `640` | 200 | 4486 | ✓ |
| `750` | 200 | 4486 | ✓ |
| `119` | 200 | 4486 | ✓ |
| `014` | 200 | 4486 | ✓ |

### 2.3 Undocumented Parameters

| Parameter | Value | Status | Effect |
|-----------|-------|--------|--------|
| `openOnly` | `true` | 200 | 4486 courses |
| `openOnly` | `1` | 200 | 4486 courses |
| `open` | `true` | 200 | 4486 courses |
| `instructor` | `SMITH` | 200 | 4486 courses |
| `building` | `HLL` | 200 | 4486 courses |
| `day` | `M` | 200 | 4486 courses |
| `credits` | `3` | 200 | 4486 courses |

---

## 3. Coverage by Dimension

### 3.1 By Term

| Term | Courses |
|------|---------|
| Fall | 19,769 |
| Spring | 21,572 |
| Summer | 5,329 |
| Winter | 596 |

### 3.2 By Campus

| Campus | Courses |
|--------|---------|
| CM | 6,224 |
| NB | 30,602 |
| NK | 9,170 |
| ONLINE_CM | 222 |
| ONLINE_NB | 845 |
| ONLINE_NK | 203 |

### 3.3 By Year

| Year | Courses |
|------|---------|
| 2023 | 15,510 |
| 2024 | 15,219 |
| 2025 | 16,537 |

---

## 4. Field Analysis

### 4.1 Fields by Source Coverage

Fields that only appear in certain terms/campuses:

| Field | Sources | Null Rate |
|-------|---------|-----------|
| `courseFee` | 2025-Fall-CM, 2025-Fall-NB, 2025-Fall-NK... (+9) | 0.0% |
| `courseFeeDescr` | 2025-Fall-CM, 2025-Fall-NB, 2025-Fall-NK... (+9) | 0.7% |
| `sections[*].courseFee` | 2023-Fall-CM, 2023-Fall-NB, 2023-Fall-NK... (+15) | 28.4% |
| `sections[*].courseFeeDescr` | 2023-Fall-CM, 2023-Fall-NB, 2023-Fall-NK... (+15) | 96.8% |
| `sections[*].finalExam` | 2025-Fall-CM, 2025-Fall-NB, 2025-Fall-NK... (+9) | 67.0% |

### 4.2 Rare Fields (< 5% occurrence)

| Field | Null Rate | Sample Values |
|-------|-----------|---------------|
| `offeringUnitTitle` | 100.0% | N/A |
| `sections[*].legendKey` | 100.0% | ['*'] |
| `sections[*].courseFeeDescr` | 96.8% | ['LAB FEE', 'COURSE FEE', 'TRANSPORTATIO |

---

## 5. Error Response Analysis

| Test Case | Status | Records | Notes |
|-----------|--------|---------|-------|
| year=1999, term=1, campus=NB | 200 | 0 | OK |
| year=2099, term=1, campus=NB | 200 | 0 | OK |
| year=2025, term=5, campus=NB | 200 | 0 | OK |
| year=2025, term=99, campus=NB | 200 | 0 | OK |
| year=2025, term=1, campus=XX | 200 | 0 | OK |
| year=2025, term=1, campus=ZZZ | 200 | 0 | OK |
| term=1, campus=NB | 400 | N/A | OK |
| year=2025, campus=NB | 400 | N/A | OK |
| year=2025, term=1 | 400 | N/A | OK |
| (none) | 400 | N/A | OK |
| year=abc, term=1, campus=NB | 400 | N/A | OK |

---

## 6. Schema Implications

Based on this analysis, the following schema changes may be needed:

- `sessionDates` field has data in some terms - add to sections table
- New top-level fields discovered: subject, openSections, synopsisUrl, preReqNotes, school