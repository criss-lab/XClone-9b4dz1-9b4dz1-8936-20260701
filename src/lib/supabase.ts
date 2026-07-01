import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Native fetch with retry (helps low/slow networks for images & videos)
const fetchWithRetry = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || attempt === maxRetries) {
        return response;
      }
      // Exponential backoff: 1s → 2s → 4s
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error('Network request failed after retries');
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: fetchWithRetry,   // ← This small addition enables retries for uploads
  },
});
