import type { SupabaseClient } from "@supabase/supabase-js";

interface MatchFixture {
  tournamentId: string;
  matchId: string;
}

// `tournaments` wymusza "jeden aktywny turniej naraz" unikalnym indeksem
// częściowym (status='active') — fixture'y podpinają testowy mecz pod już
// istniejący aktywny turniej zamiast tworzyć/zamykać turnieje, żeby nigdy nie
// dotknąć tego niezmiennika na współdzielonym, zdalnym projekcie.
async function getActiveTournamentId(adminClient: SupabaseClient): Promise<string> {
  const { data, error } = await adminClient
    .from("tournaments")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .single<{ id: string }>();
  if (error) {
    throw new Error(
      `Brak aktywnego turnieju w docelowym projekcie Supabase (lub błąd zapytania: ${error.message}) — testy integracyjne wymagają istniejącego aktywnego turnieju.`,
    );
  }
  return data.id;
}

async function createMatchFixture(
  adminClient: SupabaseClient,
  createdBy: string,
  scheduledAt: Date,
): Promise<MatchFixture> {
  const tournamentId = await getActiveTournamentId(adminClient);

  const { data: match, error } = await adminClient
    .from("matches")
    .insert({
      tournament_id: tournamentId,
      home_team: "Test Home",
      away_team: "Test Away",
      scheduled_at: scheduledAt.toISOString(),
      created_by: createdBy,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    throw new Error(`Nie udało się utworzyć testowego meczu: ${error.message}`);
  }

  return { tournamentId, matchId: match.id };
}

export function createLockedMatchFixture(adminClient: SupabaseClient, createdBy: string) {
  return createMatchFixture(adminClient, createdBy, new Date(Date.now() - 60 * 60 * 1000));
}

export function createOpenMatchFixture(adminClient: SupabaseClient, createdBy: string) {
  return createMatchFixture(adminClient, createdBy, new Date(Date.now() + 60 * 60 * 1000));
}

// Cascade (matches -> predictions) usuwa też ewentualne testowe predykcje;
// turniej pozostaje nietknięty.
export async function deleteMatchFixture(adminClient: SupabaseClient, matchId: string) {
  const { error } = await adminClient.from("matches").delete().eq("id", matchId);
  if (error) {
    throw new Error(`Nie udało się skasować testowego meczu: ${error.message}`);
  }
}
