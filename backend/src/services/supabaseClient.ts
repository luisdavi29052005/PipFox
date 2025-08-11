import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Cliente "anônimo" (frontend/público)
export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

// Cliente "admin" (backend/privado)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Export padrão (usa admin por padrão)
export const supabase = supabaseAdmin;
