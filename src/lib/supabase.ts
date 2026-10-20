import { createClient } from '@supabase/supabase-js';

export const isSupabaseConfigured = Boolean(__SUPABASE_URL__ && __SUPABASE_KEY__);

export const supabase = createClient(
  __SUPABASE_URL__ || 'http://localhost',
  __SUPABASE_KEY__ || 'missing-key',
);
