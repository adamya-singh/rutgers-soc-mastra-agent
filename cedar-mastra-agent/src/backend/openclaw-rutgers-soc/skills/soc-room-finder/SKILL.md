---
name: soc-room-finder
description: Find empty Rutgers classrooms by building/day/time using deterministic SOC room-availability windows. Use when users ask for free rooms, open classrooms, or room availability durations (for example, "empty room in Tillett after 5pm" or "what rooms are free now on Livingston").
metadata: {"openclaw":{"emoji":"🚪","skillKey":"rutgers-soc-room-finder","requires":{"config":["plugins.entries.rutgers-soc.enabled"]}}}
---

# Rutgers SOC Room Finder

Use this skill for empty-room and room-availability queries.

## Tool map

- Resolve building + compute room free windows: `rutgers_soc_find_room_availability`

## Workflow

1. Extract building, day, start time, and minimum duration from the user request.
2. Call `rutgers_soc_find_room_availability` first.
3. If the tool returns an ambiguity error for building resolution, ask the user to pick one candidate code.
4. Rank output by `longestFreeMinutes` (already sorted by the tool).
5. Return concise availability windows with duration.
6. If `fallbackApplied` is true, explicitly note that shorter windows were included because long windows were scarce.

## Defaults

1. If day is omitted, use tool default (current local weekday).
2. If start time is omitted, use tool default (current local time).
3. If end time is omitted, use tool default (22:00).
4. Prefer windows at least 60 minutes unless user asks for a different threshold.
5. If few long windows exist, include shorter windows and label them.

## Response shape

Use this compact format:

`ROOM - start-end (duration)`

Example:

`TIL 125 - 5:00 PM-10:00 PM (300m)`

If no windows exist, return that no rooms are free in the requested interval.
