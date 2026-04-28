do $$
declare
  soc_tables text[] := array[
    'terms',
    'schools',
    'subjects',
    'instructors',
    'courses',
    'course_campus_locations',
    'course_core_codes',
    'sections',
    'section_instructors',
    'section_comments',
    'section_campus_locations',
    'section_majors',
    'section_minors',
    'section_unit_majors',
    'section_honor_programs',
    'cross_listed_sections',
    'meeting_times',
    'prerequisites',
    'section_status_history',
    'building_aliases'
  ];
  soc_views text[] := array[
    'v_course_search',
    'v_section_details',
    'v_schedule_builder',
    'v_instructor_stats',
    'v_open_sections',
    'v_summer_sessions',
    'v_winter_sessions',
    'subjects_distinct',
    'instructors_distinct',
    'core_codes_distinct'
  ];
  relation_name text;
begin
  foreach relation_name in array soc_tables loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from anon, authenticated', relation_name);
      execute format('grant select on table public.%I to anon, authenticated', relation_name);
    end if;
  end loop;

  foreach relation_name in array soc_views loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format('grant select on table public.%I to anon, authenticated', relation_name);
    end if;
  end loop;
end $$;
