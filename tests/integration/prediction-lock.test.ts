import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createTestAdminClient } from "./helpers/supabase-test-clients";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { createLockedMatchFixture, createOpenMatchFixture, deleteMatchFixture } from "./helpers/tournament-fixtures";

type AuthedClient = ReturnType<typeof createSupabaseClient>;

// vi.mock jest hoistowane ponad importy — potrzebny jest vi.hoisted(), żeby
// factory mogła bezpiecznie odwołać się do zmiennej ustawianej dopiero w
// beforeAll (token testowego Usera nie jest jeszcze znany przy imporcie).
const authedClientHolder = vi.hoisted(() => ({ current: null as AuthedClient | null }));

// Podmieniamy wyłącznie transport uwierzytelniania (cookie-based SSR,
// specyficzny dla Astro) — reszta logiki endpointu (zod, sprawdzenie
// scheduled_at, wywołanie RLS) pozostaje realna. Asercja argumentów pilnuje,
// żeby endpoint nadal realnie przekazywał headers/cookies do createClient —
// inaczej ta podmiana ukryłaby regresję w samym wiringu.
vi.mock("@/lib/supabase", () => ({
  createClient: (headers: unknown, cookies: unknown) => {
    if (!(headers instanceof Headers)) {
      throw new Error("predictions.ts nie przekazał realnego obiektu Headers do createClient().");
    }
    if (typeof (cookies as { set?: unknown } | null)?.set !== "function") {
      throw new Error("predictions.ts nie przekazał obiektu cookies z metodą set() do createClient().");
    }
    return authedClientHolder.current;
  },
}));

const { POST } = await import("@/pages/api/matches/[id]/predictions");

function buildContext(matchId: string, userId: string, body: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) formData.append(key, value);
  return {
    params: { id: matchId },
    request: new Request(`http://localhost/api/matches/${matchId}/predictions`, {
      method: "POST",
      body: formData,
    }),
    cookies: { set: () => undefined },
    locals: { user: { id: userId }, role: "user" },
    redirect: (url: string) => new Response(null, { status: 302, headers: { Location: url } }),
  } as unknown as Parameters<typeof POST>[0];
}

const adminClient = createTestAdminClient();
let userId: string;
let authedClient: AuthedClient;

beforeAll(async () => {
  const testUser = await createTestUser(adminClient);
  userId = testUser.userId;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_KEY;
  if (!url || !anonKey) {
    throw new Error("Brak SUPABASE_URL/SUPABASE_KEY w środowisku.");
  }
  authedClient = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${testUser.accessToken}` } },
  });
  authedClientHolder.current = authedClient;
});

afterAll(async () => {
  if (userId) {
    await deleteTestUser(adminClient, userId);
  }
});

describe("blokada czasowa typowania (#2)", () => {
  it("API odrzuca zapis predykcji po starcie meczu", async () => {
    const fixture = await createLockedMatchFixture(adminClient, userId);
    try {
      const response = await POST(
        buildContext(fixture.matchId, userId, { predicted_home_score: "1", predicted_away_score: "1" }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toContain("error=");
    } finally {
      await deleteMatchFixture(adminClient, fixture.matchId);
    }
  });

  it("RLS odrzuca bezpośredni zapis po starcie meczu, z pominięciem endpointu API", async () => {
    const fixture = await createLockedMatchFixture(adminClient, userId);
    try {
      const { error } = await authedClient
        .from("predictions")
        .upsert(
          { match_id: fixture.matchId, user_id: userId, predicted_home_score: 1, predicted_away_score: 1 },
          { onConflict: "user_id,match_id" },
        );
      expect(error).not.toBeNull();
    } finally {
      await deleteMatchFixture(adminClient, fixture.matchId);
    }
  });

  it("zapis nadal przechodzi przed startem meczu — przez API i bezpośrednio", async () => {
    const fixture = await createOpenMatchFixture(adminClient, userId);
    try {
      const response = await POST(
        buildContext(fixture.matchId, userId, { predicted_home_score: "2", predicted_away_score: "1" }),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).not.toContain("error=");

      const { data, error: selectError } = await adminClient
        .from("predictions")
        .select("predicted_home_score, predicted_away_score")
        .eq("match_id", fixture.matchId)
        .eq("user_id", userId)
        .single<{ predicted_home_score: number; predicted_away_score: number }>();
      expect(selectError).toBeNull();
      expect(data).toMatchObject({ predicted_home_score: 2, predicted_away_score: 1 });

      const { error: upsertError } = await authedClient
        .from("predictions")
        .upsert(
          { match_id: fixture.matchId, user_id: userId, predicted_home_score: 3, predicted_away_score: 0 },
          { onConflict: "user_id,match_id" },
        );
      expect(upsertError).toBeNull();
    } finally {
      await deleteMatchFixture(adminClient, fixture.matchId);
    }
  });
});
