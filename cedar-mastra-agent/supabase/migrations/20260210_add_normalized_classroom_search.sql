-- Add normalized location fields for deterministic classroom search
ALTER TABLE meeting_times
  ADD COLUMN IF NOT EXISTS building_code_norm TEXT,
  ADD COLUMN IF NOT EXISTS room_number_norm TEXT;

-- Backfill normalized values from existing location columns
UPDATE meeting_times
SET
  building_code_norm = upper(regexp_replace(coalesce(building_code, ''), '[^A-Za-z0-9]', '', 'g')),
  room_number_norm = upper(regexp_replace(coalesce(room_number, ''), '[^A-Za-z0-9]', '', 'g'))
WHERE building_code_norm IS NULL
   OR room_number_norm IS NULL;

-- Indexes for classroom search
CREATE INDEX IF NOT EXISTS idx_meeting_times_building_norm
  ON meeting_times(building_code_norm)
  WHERE building_code_norm <> '';

CREATE INDEX IF NOT EXISTS idx_meeting_times_building_room_norm
  ON meeting_times(building_code_norm, room_number_norm)
  WHERE building_code_norm <> '';

-- Ensure v_schedule_builder exposes normalized fields for filtering
DROP VIEW IF EXISTS v_schedule_builder;

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
