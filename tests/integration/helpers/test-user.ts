import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface TestUser {
  userId: string;
  accessToken: string;
}

// Nowy auth.users wiersz dostaje profiles.role='user' automatycznie przez
// trigger handle_new_user (patrz migracja create_profiles_and_roles) — brak
// dodatkowego setupu roli.
export async function createTestUser(adminClient: SupabaseClient): Promise<TestUser> {
  const email = `test-${crypto.randomUUID()}@example.test`;
  const password = crypto.randomUUID();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    throw new Error(`Nie udało się utworzyć testowego Usera: ${createError.message}`);
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_KEY;
  if (!url || !anonKey) {
    throw new Error("Brak SUPABASE_URL/SUPABASE_KEY w środowisku — wymagane do zalogowania testowego Usera.");
  }
  const anonClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: session, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Nie udało się zalogować testowego Usera: ${signInError.message}`);
  }

  return { userId: created.user.id, accessToken: session.session.access_token };
}

// Wywoływać PO skasowaniu fixture'ów (matches.created_by / predictions.user_id
// odwołują się do auth.users bez ON DELETE CASCADE) — patrz plan.md Critical
// Implementation Details.
export async function deleteTestUser(adminClient: SupabaseClient, userId: string) {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Nie udało się skasować testowego Usera: ${error.message}`);
  }
}
