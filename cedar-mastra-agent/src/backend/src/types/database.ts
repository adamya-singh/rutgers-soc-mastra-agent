export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      course_campus_locations: {
        Row: {
          code: string
          course_id: number
          description: string | null
          id: number
        }
        Insert: {
          code: string
          course_id: number
          description?: string | null
          id?: number
        }
        Update: {
          code?: string
          course_id?: number
          description?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_campus_locations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_campus_locations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_search"
            referencedColumns: ["id"]
          },
        ]
      }
      course_core_codes: {
        Row: {
          core_code: string
          core_code_description: string | null
          course_id: number
          effective: string | null
          id: number
          last_updated: number | null
        }
        Insert: {
          core_code: string
          core_code_description?: string | null
          course_id: number
          effective?: string | null
          id?: number
          last_updated?: number | null
        }
        Update: {
          core_code?: string
          core_code_description?: string | null
          course_id?: number
          effective?: string | null
          id?: number
          last_updated?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_core_codes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_core_codes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_search"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          campus_code: string | null
          course_description: string | null
          course_fee: string | null
          course_fee_description: string | null
          course_notes: string | null
          course_number: string
          course_string: string
          created_at: string | null
          credits: number | null
          credits_code: string | null
          credits_description: string | null
          expanded_title: string | null
          id: number
          level: string
          main_campus: string
          offering_unit_code: string | null
          open_sections: number | null
          prereq_notes: string | null
          school_id: number | null
          subject_code: string
          subject_id: number | null
          supplement_code: string | null
          synopsis_url: string | null
          term_id: number
          title: string
          unit_notes: string | null
          updated_at: string | null
        }
        Insert: {
          campus_code?: string | null
          course_description?: string | null
          course_fee?: string | null
          course_fee_description?: string | null
          course_notes?: string | null
          course_number: string
          course_string: string
          created_at?: string | null
          credits?: number | null
          credits_code?: string | null
          credits_description?: string | null
          expanded_title?: string | null
          id?: number
          level: string
          main_campus: string
          offering_unit_code?: string | null
          open_sections?: number | null
          prereq_notes?: string | null
          school_id?: number | null
          subject_code: string
          subject_id?: number | null
          supplement_code?: string | null
          synopsis_url?: string | null
          term_id: number
          title: string
          unit_notes?: string | null
          updated_at?: string | null
        }
        Update: {
          campus_code?: string | null
          course_description?: string | null
          course_fee?: string | null
          course_fee_description?: string | null
          course_notes?: string | null
          course_number?: string
          course_string?: string
          created_at?: string | null
          credits?: number | null
          credits_code?: string | null
          credits_description?: string | null
          expanded_title?: string | null
          id?: number
          level?: string
          main_campus?: string
          offering_unit_code?: string | null
          open_sections?: number | null
          prereq_notes?: string | null
          school_id?: number | null
          subject_code?: string
          subject_id?: number | null
          supplement_code?: string | null
          synopsis_url?: string | null
          term_id?: number
          title?: string
          unit_notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_listed_sections: {
        Row: {
          course_number: string | null
          id: number
          offering_unit_campus: string | null
          offering_unit_code: string | null
          primary_registration_index: string | null
          registration_index: string | null
          section_id: number
          section_number: string | null
          subject_code: string | null
          supplement_code: string | null
        }
        Insert: {
          course_number?: string | null
          id?: number
          offering_unit_campus?: string | null
          offering_unit_code?: string | null
          primary_registration_index?: string | null
          registration_index?: string | null
          section_id: number
          section_number?: string | null
          subject_code?: string | null
          supplement_code?: string | null
        }
        Update: {
          course_number?: string | null
          id?: number
          offering_unit_campus?: string | null
          offering_unit_code?: string | null
          primary_registration_index?: string | null
          registration_index?: string | null
          section_id?: number
          section_number?: string | null
          subject_code?: string | null
          supplement_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cross_listed_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_listed_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "cross_listed_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      instructors: {
        Row: {
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      meeting_times: {
        Row: {
          ba_class_hours: string | null
          building_code: string | null
          campus_abbrev: string | null
          campus_location: string | null
          campus_name: string | null
          end_time: string | null
          end_time_military: string | null
          id: number
          meeting_day: string | null
          meeting_mode_code: string | null
          meeting_mode_desc: string | null
          pm_code: string | null
          room_number: string | null
          section_id: number
          start_time: string | null
          start_time_military: string | null
        }
        Insert: {
          ba_class_hours?: string | null
          building_code?: string | null
          campus_abbrev?: string | null
          campus_location?: string | null
          campus_name?: string | null
          end_time?: string | null
          end_time_military?: string | null
          id?: number
          meeting_day?: string | null
          meeting_mode_code?: string | null
          meeting_mode_desc?: string | null
          pm_code?: string | null
          room_number?: string | null
          section_id: number
          start_time?: string | null
          start_time_military?: string | null
        }
        Update: {
          ba_class_hours?: string | null
          building_code?: string | null
          campus_abbrev?: string | null
          campus_location?: string | null
          campus_name?: string | null
          end_time?: string | null
          end_time_military?: string | null
          id?: number
          meeting_day?: string | null
          meeting_mode_code?: string | null
          meeting_mode_desc?: string | null
          pm_code?: string | null
          room_number?: string | null
          section_id?: number
          start_time?: string | null
          start_time_military?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_times_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_times_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "meeting_times_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      prerequisites: {
        Row: {
          course_id: number
          id: number
          is_or: boolean | null
          logic_group: number
          required_course_string: string
          required_course_title: string | null
          source_text: string | null
        }
        Insert: {
          course_id: number
          id?: number
          is_or?: boolean | null
          logic_group?: number
          required_course_string: string
          required_course_title?: string | null
          source_text?: string | null
        }
        Update: {
          course_id?: number
          id?: number
          is_or?: boolean | null
          logic_group?: number
          required_course_string?: string
          required_course_title?: string | null
          source_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prerequisites_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prerequisites_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_search"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          campus: string | null
          created_at: string
          id: string
          name: string
          snapshot: Json
          term_code: string | null
          term_year: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campus?: string | null
          created_at?: string
          id?: string
          name: string
          snapshot: Json
          term_code?: string | null
          term_year?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campus?: string | null
          created_at?: string
          id?: string
          name?: string
          snapshot?: Json
          term_code?: string | null
          term_year?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          code: string
          description: string
          id: number
        }
        Insert: {
          code: string
          description: string
          id?: number
        }
        Update: {
          code?: string
          description?: string
          id?: number
        }
        Relationships: []
      }
      section_campus_locations: {
        Row: {
          code: string
          description: string | null
          id: number
          section_id: number
        }
        Insert: {
          code: string
          description?: string | null
          id?: number
          section_id: number
        }
        Update: {
          code?: string
          description?: string | null
          id?: number
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_campus_locations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_campus_locations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_campus_locations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      section_comments: {
        Row: {
          code: string
          description: string
          id: number
          section_id: number
        }
        Insert: {
          code: string
          description: string
          id?: number
          section_id: number
        }
        Update: {
          code?: string
          description?: string
          id?: number
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_comments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_comments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_comments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      section_honor_programs: {
        Row: {
          code: string
          id: number
          section_id: number
        }
        Insert: {
          code: string
          id?: number
          section_id: number
        }
        Update: {
          code?: string
          id?: number
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_honor_programs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_honor_programs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_honor_programs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      section_instructors: {
        Row: {
          id: number
          instructor_id: number
          section_id: number
        }
        Insert: {
          id?: number
          instructor_id: number
          section_id: number
        }
        Update: {
          id?: number
          instructor_id?: number
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_instructors_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "v_instructor_stats"
            referencedColumns: ["instructor_id"]
          },
          {
            foreignKeyName: "section_instructors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_instructors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_instructors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      section_majors: {
        Row: {
          code: string
          id: number
          is_major_code: boolean | null
          is_unit_code: boolean | null
          section_id: number
        }
        Insert: {
          code: string
          id?: number
          is_major_code?: boolean | null
          is_unit_code?: boolean | null
          section_id: number
        }
        Update: {
          code?: string
          id?: number
          is_major_code?: boolean | null
          is_unit_code?: boolean | null
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_majors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_majors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_majors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      section_minors: {
        Row: {
          code: string
          id: number
          section_id: number
        }
        Insert: {
          code: string
          id?: number
          section_id: number
        }
        Update: {
          code?: string
          id?: number
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_minors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_minors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_minors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      section_status_history: {
        Row: {
          changed_at: string | null
          id: number
          new_status: boolean
          old_status: boolean | null
          section_id: number
        }
        Insert: {
          changed_at?: string | null
          id?: number
          new_status: boolean
          old_status?: boolean | null
          section_id: number
        }
        Update: {
          changed_at?: string | null
          id?: number
          new_status?: boolean
          old_status?: boolean | null
          section_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_status_history_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_status_history_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_status_history_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      section_unit_majors: {
        Row: {
          id: number
          major_code: string
          section_id: number
          unit_code: string
        }
        Insert: {
          id?: number
          major_code: string
          section_id: number
          unit_code: string
        }
        Update: {
          id?: number
          major_code?: string
          section_id?: number
          unit_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_unit_majors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_unit_majors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_schedule_builder"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "section_unit_majors_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "v_section_details"
            referencedColumns: ["section_id"]
          },
        ]
      }
      sections: {
        Row: {
          campus_code: string | null
          comments_text: string | null
          course_fee: string | null
          course_fee_description: string | null
          course_id: number
          created_at: string | null
          cross_listed_section_type: string | null
          cross_listed_sections_text: string | null
          exam_code: string | null
          exam_code_text: string | null
          final_exam: string | null
          id: number
          index_number: string
          open_status: boolean
          open_status_text: string | null
          open_to_text: string | null
          printed: string | null
          section_course_type: string | null
          section_eligibility: string | null
          section_notes: string | null
          section_number: string
          session_date_print_indicator: string | null
          session_dates: string | null
          special_permission_add_code: string | null
          special_permission_add_description: string | null
          special_permission_drop_code: string | null
          special_permission_drop_description: string | null
          status_changed_at: string | null
          subtitle: string | null
          subtopic: string | null
          updated_at: string | null
        }
        Insert: {
          campus_code?: string | null
          comments_text?: string | null
          course_fee?: string | null
          course_fee_description?: string | null
          course_id: number
          created_at?: string | null
          cross_listed_section_type?: string | null
          cross_listed_sections_text?: string | null
          exam_code?: string | null
          exam_code_text?: string | null
          final_exam?: string | null
          id?: number
          index_number: string
          open_status?: boolean
          open_status_text?: string | null
          open_to_text?: string | null
          printed?: string | null
          section_course_type?: string | null
          section_eligibility?: string | null
          section_notes?: string | null
          section_number: string
          session_date_print_indicator?: string | null
          session_dates?: string | null
          special_permission_add_code?: string | null
          special_permission_add_description?: string | null
          special_permission_drop_code?: string | null
          special_permission_drop_description?: string | null
          status_changed_at?: string | null
          subtitle?: string | null
          subtopic?: string | null
          updated_at?: string | null
        }
        Update: {
          campus_code?: string | null
          comments_text?: string | null
          course_fee?: string | null
          course_fee_description?: string | null
          course_id?: number
          created_at?: string | null
          cross_listed_section_type?: string | null
          cross_listed_sections_text?: string | null
          exam_code?: string | null
          exam_code_text?: string | null
          final_exam?: string | null
          id?: number
          index_number?: string
          open_status?: boolean
          open_status_text?: string | null
          open_to_text?: string | null
          printed?: string | null
          section_course_type?: string | null
          section_eligibility?: string | null
          section_notes?: string | null
          section_number?: string
          session_date_print_indicator?: string | null
          session_dates?: string | null
          special_permission_add_code?: string | null
          special_permission_add_description?: string | null
          special_permission_drop_code?: string | null
          special_permission_drop_description?: string | null
          status_changed_at?: string | null
          subtitle?: string | null
          subtopic?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "v_course_search"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          description: string
          id: number
          notes: string | null
        }
        Insert: {
          code: string
          description: string
          id?: number
          notes?: string | null
        }
        Update: {
          code?: string
          description?: string
          id?: number
          notes?: string | null
        }
        Relationships: []
      }
      terms: {
        Row: {
          campus: string
          fetched_at: string | null
          id: number
          term: string
          term_name: string | null
          year: number
        }
        Insert: {
          campus: string
          fetched_at?: string | null
          id?: number
          term: string
          term_name?: string | null
          year: number
        }
        Update: {
          campus?: string
          fetched_at?: string | null
          id?: number
          term?: string
          term_name?: string | null
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      core_codes_distinct: {
        Row: {
          core_code: string | null
          core_code_description: string | null
        }
        Relationships: []
      }
      instructors_distinct: {
        Row: {
          name: string | null
        }
        Relationships: []
      }
      subjects_distinct: {
        Row: {
          code: string | null
          description: string | null
          notes: string | null
        }
        Relationships: []
      }
      v_course_search: {
        Row: {
          campus: string | null
          course_string: string | null
          credits: number | null
          expanded_title: string | null
          id: number | null
          level: string | null
          open_sections: number | null
          prereq_notes: string | null
          school_code: string | null
          school_name: string | null
          subject_code: string | null
          subject_name: string | null
          synopsis_url: string | null
          term: string | null
          term_name: string | null
          title: string | null
          year: number | null
        }
        Relationships: []
      }
      v_instructor_stats: {
        Row: {
          courses_taught: number | null
          instructor_id: number | null
          name: string | null
          sections_taught: number | null
          subjects_taught: string[] | null
          terms_active: string[] | null
        }
        Relationships: []
      }
      v_open_sections: {
        Row: {
          campus: string | null
          course_string: string | null
          credits: number | null
          index_number: string | null
          term: string | null
          term_name: string | null
          title: string | null
          year: number | null
        }
        Relationships: []
      }
      v_schedule_builder: {
        Row: {
          building_code: string | null
          campus_name: string | null
          course_string: string | null
          credits: number | null
          end_time_military: string | null
          index_number: string | null
          meeting_day: string | null
          meeting_mode_desc: string | null
          open_status: boolean | null
          room_number: string | null
          section_id: number | null
          start_time_military: string | null
          term: string | null
          term_campus: string | null
          title: string | null
          year: number | null
        }
        Relationships: []
      }
      v_section_details: {
        Row: {
          campus: string | null
          comments_text: string | null
          course_string: string | null
          course_title: string | null
          credits: number | null
          final_exam: string | null
          index_number: string | null
          instructors: string | null
          open_status: boolean | null
          open_status_text: string | null
          section_course_type: string | null
          section_eligibility: string | null
          section_id: number | null
          section_number: string | null
          term: string | null
          year: number | null
        }
        Relationships: []
      }
      v_summer_sessions: {
        Row: {
          campus: string | null
          course_string: string | null
          credits: number | null
          index_number: string | null
          instructors: string | null
          open_status: boolean | null
          section_number: string | null
          session_dates: string | null
          title: string | null
          year: number | null
        }
        Relationships: []
      }
      v_winter_sessions: {
        Row: {
          campus: string | null
          course_string: string | null
          credits: number | null
          index_number: string | null
          instructors: string | null
          open_status: boolean | null
          section_number: string | null
          session_dates: string | null
          title: string | null
          year: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
