import { createClient } from "@supabase/supabase-js";

// Testy integracyjne czytają sekrety z process.env (wstrzyknięte przez
// vitest.config.ts / loadEnv), nie z astro:env/server — ten klient nie może
// reużyć src/lib/supabase.ts.
export function createTestAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Brak SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY w środowisku — ustaw je w .env przed uruchomieniem testów integracyjnych.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
