import { createClient } from '@supabase/supabase-js';

// Usar credenciales quemadas directamente ya que la llave ANON es pública y no representa riesgo de seguridad,
// y esto soluciona inmediatamente el problema de Vercel no inyectando las variables.
const supabaseUrl = 'https://wxkqmotksjcjwhytodvx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4a3Ftb3Rrc2pjandoeXRvZHZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NzcxNjksImV4cCI6MjA5NjI1MzE2OX0.wJDz4EqY2gIWq50OGUBC8hgI3Mt7SnIy3hlPjol5a_k';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
