CREATE TABLE IF NOT EXISTS public.building_aliases (
  id BIGSERIAL PRIMARY KEY,
  campus TEXT NOT NULL CHECK (campus IN ('NB', 'NK', 'CM')),
  building_code_norm TEXT NOT NULL,
  alias_norm TEXT NOT NULL,
  alias_display TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS building_aliases_campus_alias_norm_uidx
  ON public.building_aliases (campus, alias_norm);

CREATE INDEX IF NOT EXISTS building_aliases_campus_building_code_norm_idx
  ON public.building_aliases (campus, building_code_norm);

INSERT INTO public.building_aliases (campus, building_code_norm, alias_norm, alias_display)
VALUES
  ('NB', 'TIL', 'TIL', 'TIL'),
  ('NB', 'TIL', 'TILLETT', 'Tillett'),
  ('NB', 'TIL', 'TILLETTHALL', 'Tillett Hall'),
  ('NB', 'LSH', 'LSH', 'Livingston Student Center Hall'),
  ('NB', 'LSH', 'LIVINGSTONSTUDENTCENTERHALL', 'Livingston Student Center Hall'),
  ('NB', 'HLL', 'HLL', 'Hill Center'),
  ('NB', 'HLL', 'HILLCENTER', 'Hill Center'),
  ('NB', 'AB', 'AB', 'Academic Building'),
  ('NB', 'AB', 'ACADEMICBUILDING', 'Academic Building'),
  ('NB', 'ARC', 'ARC', 'Allison Road Classroom'),
  ('NB', 'ARC', 'ALLISONROADCLASSROOM', 'Allison Road Classroom'),
  ('NB', 'BE', 'BE', 'Biomedical Engineering Building'),
  ('NB', 'BE', 'BIOMEDICALENGINEERINGBUILDING', 'Biomedical Engineering Building'),
  ('NK', 'ENG', 'ENG', 'Engelhard Hall'),
  ('NK', 'ENG', 'ENGELHARDHALL', 'Engelhard Hall'),
  ('CM', 'ARC', 'ARC', 'Armitage Hall'),
  ('CM', 'ARC', 'ARMITAGEHALL', 'Armitage Hall')
ON CONFLICT (campus, alias_norm) DO NOTHING;
