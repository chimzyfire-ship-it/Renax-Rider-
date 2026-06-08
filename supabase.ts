import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://egmebwctchuwabbnvmgc.supabase.co') as string;
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnbWVid2N0Y2h1d2FiYm52bWdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NDg0MjgsImV4cCI6MjA5MjAyNDQyOH0.eBLgER9lm2G6Ykvqz0Lyod9h3PIDJi3LsLXCU2qpOd0') as string;

const storage = Platform.OS === 'web'
  ? undefined
  : AsyncStorage;

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
