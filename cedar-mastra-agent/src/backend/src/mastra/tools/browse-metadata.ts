import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { getTermName } from '../../lib/utils.js';

/**
 * browseMetadata - List available options for terms, subjects, schools, core codes, and instructors
 * 
 * Essential for discovery and building valid queries. Helps users understand
 * what options are available in the system.
 */
export const browseMetadata = createTool({
  id: 'browseMetadata',
  description: `List available metadata options in the Rutgers course system.
Use this to discover available terms, subjects, schools, core codes, or instructors.
Examples: "What terms are available?", "List all CS subjects", "What core codes exist?", "What schools are there?"`,
  inputSchema: z.object({
    type: z.enum(['terms', 'subjects', 'schools', 'coreCodes', 'instructors'])
      .describe('Type of metadata to retrieve'),
    
    filter: z.string().optional()
      .describe('Text filter to search within results (partial match)'),
    
    campus: z.enum(['NB', 'NK', 'CM']).optional()
      .describe('Filter by campus (for subjects/schools/instructors)'),
    
    year: z.number().optional()
      .describe('Filter by year (for terms)'),
    
    limit: z.number().min(1).max(10000).default(100)
      .describe('Maximum results'),
  }),
  outputSchema: z.object({
    type: z.string(),
    items: z.array(z.object({
      code: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      year: z.number().optional(),
      term: z.string().optional(),
      campus: z.string().optional(),
      courseCount: z.number().optional(),
    })),
    totalCount: z.number(),
  }),
  execute: async ({ context }) => {
    const { type, filter, campus, year, limit = 100 } = context;

    try {
      switch (type) {
        case 'terms': {
          let query = supabase
            .from('terms')
            .select('year, term, term_name, campus')
            .order('year', { ascending: false })
            .order('term', { ascending: false });

          if (year) {
            query = query.eq('year', year);
          }

          if (campus) {
            query = query.or(`campus.eq.${campus},campus.eq.ONLINE_${campus}`);
          }

          if (filter) {
            query = query.or(`term_name.ilike.%${filter}%,campus.ilike.%${filter}%`);
          }

          query = query.limit(limit);

          const { data, error } = await query;

          if (error) {
            throw new Error(`Failed to get terms: ${error.message}`);
          }

          // Deduplicate terms (group by year/term)
          const termMap = new Map<string, typeof data[0]>();
          data?.forEach(t => {
            const key = `${t.year}-${t.term}`;
            if (!termMap.has(key)) {
              termMap.set(key, t);
            }
          });

          const items = Array.from(termMap.values()).map(t => ({
            code: `${t.year}${t.term}`,
            name: `${t.term_name} ${t.year}`,
            year: t.year,
            term: t.term,
            campus: t.campus,
          }));

          return {
            type: 'terms',
            items,
            totalCount: items.length,
          };
        }

        case 'subjects': {
          // Get subjects with course counts
          let query = supabase
            .from('subjects_distinct')
            .select('code, description')
            .order('code');

          if (filter) {
            query = query.or(`code.ilike.%${filter}%,description.ilike.%${filter}%`);
          }

          query = query.limit(limit);

          const { data: subjects, error } = await query;

          if (error) {
            throw new Error(`Failed to get subjects: ${error.message}`);
          }

          // Get course counts if campus is specified
          let courseCountsMap = new Map<string, number>();
          if (campus && subjects && subjects.length > 0) {
            const subjectCodes = subjects.map(s => s.code);
            
            // Get courses for these subjects in the specified campus
            const { data: courseCounts, error: countError } = await supabase
              .from('v_course_search')
              .select('subject_code')
              .in('subject_code', subjectCodes)
              .or(`campus.eq.${campus},campus.eq.ONLINE_${campus}`);

            if (countError) {
              throw new Error(`Failed to get course counts: ${countError.message}`);
            }

            courseCounts?.forEach(c => {
              if (c.subject_code) {
                const current = courseCountsMap.get(c.subject_code) || 0;
                courseCountsMap.set(c.subject_code, current + 1);
              }
            });
          }

          const items = (subjects || []).map(s => ({
            code: s.code,
            name: s.description,
            description: s.description,
            courseCount: campus ? (courseCountsMap.get(s.code) || 0) : undefined,
          }));

          return {
            type: 'subjects',
            items,
            totalCount: items.length,
          };
        }

        case 'schools': {
          let query = supabase
            .from('schools')
            .select('code, description')
            .order('code');

          if (filter) {
            query = query.or(`code.ilike.%${filter}%,description.ilike.%${filter}%`);
          }

          query = query.limit(limit);

          const { data, error } = await query;

          if (error) {
            throw new Error(`Failed to get schools: ${error.message}`);
          }

          const items = (data || []).map(s => ({
            code: s.code,
            name: s.description,
            description: s.description,
          }));

          return {
            type: 'schools',
            items,
            totalCount: items.length,
          };
        }

        case 'coreCodes': {
          // Get distinct core codes from a dedicated view to avoid PostgREST row caps
          const { data, error } = await supabase
            .from('core_codes_distinct')
            .select('core_code, core_code_description')
            .order('core_code');

          if (error) {
            throw new Error(`Failed to get core codes: ${error.message}`);
          }

          // Deduplicate
          const coreCodeMap = new Map<string, string | null>();
          data?.forEach(cc => {
            if (!coreCodeMap.has(cc.core_code)) {
              coreCodeMap.set(cc.core_code, cc.core_code_description);
            }
          });

          let items = Array.from(coreCodeMap.entries()).map(([code, description]) => ({
            code,
            name: description || code,
            description: description || undefined,
          }));

          // Store total BEFORE filtering
          const totalCount = items.length;

          // Apply filter (if provided)
          if (filter) {
            const filterLower = filter.toLowerCase();
            items = items.filter(item =>
              item.code.toLowerCase().includes(filterLower) ||
              (item.description && item.description.toLowerCase().includes(filterLower))
            );
          }

          // Returns all core codes (limit parameter is ignored for coreCodes)

          return {
            type: 'coreCodes',
            items,
            totalCount, // Actual total of all unique core codes
          };
        }

        case 'instructors': {
          let query = supabase
            .from('instructors_distinct')
            .select('name')
            .order('name');

          if (filter) {
            query = query.ilike('name', `%${filter}%`);
          }

          query = query.limit(limit);

          const { data, error } = await query;

          if (error) {
            throw new Error(`Failed to get instructors: ${error.message}`);
          }

          const items = (data || []).map(i => ({
            code: i.name,
            name: i.name,
          }));

          return {
            type: 'instructors',
            items,
            totalCount: items.length,
          };
        }

        default:
          throw new Error(`Unknown metadata type: ${type}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to browse metadata: Unknown error`);
    }
  },
});
