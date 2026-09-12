import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import type { TournamentStatus } from "@/types";

export const prerender = false;

const predictionSchema = z.object({
  predicted_home_score: z.coerce
    .number({ error: "Wynik gospodarzy jest wymagany" })
    .int("Wynik musi być liczbą całkowitą")
    .min(0, "Wynik nie może być ujemny"),
  predicted_away_score: z.coerce
    .number({ error: "Wynik gości jest wymagany" })
    .int("Wynik musi być liczbą całkowitą")
    .min(0, "Wynik nie może być ujemny"),
});

function errorRedirectUrl(message: string) {
  return `/dashboard?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "user");
  if (denied) return denied;

  const userId = context.locals.user?.id;
  const { id: matchId } = context.params;
  if (!userId || !matchId) {
    return context.redirect(errorRedirectUrl("Nie znaleziono spotkania"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirectUrl("Supabase nie jest skonfigurowane"));
  }

  const form = await context.request.formData();
  const parsed = predictionSchema.safeParse({
    predicted_home_score: form.get("predicted_home_score"),
    predicted_away_score: form.get("predicted_away_score"),
  });
  if (!parsed.success) {
    return context.redirect(errorRedirectUrl(parsed.error.issues[0].message));
  }

  // Embedded select via the matches.tournament_id -> tournaments.id FK: one
  // round trip for both the kickoff time and the parent tournament's status.
  const { data: match } = await supabase
    .from("matches")
    .select("scheduled_at, tournament:tournaments(status)")
    .eq("id", matchId)
    .single<{ scheduled_at: string; tournament: { status: TournamentStatus } | null }>();

  if (!match) {
    return context.redirect(errorRedirectUrl("Nie znaleziono spotkania"));
  }
  if (match.tournament?.status !== "active") {
    return context.redirect(errorRedirectUrl("Nie można typować w zamkniętym turnieju"));
  }
  if (new Date(match.scheduled_at) <= new Date()) {
    return context.redirect(errorRedirectUrl("Nie można typować po rozpoczęciu spotkania"));
  }

  // RLS (user_insert_own_prediction / user_update_own_prediction) enforces the
  // same "active tournament, not started yet" rule independently — this
  // upsert can still be rejected there as defense-in-depth.
  const { error } = await supabase.from("predictions").upsert(
    {
      match_id: matchId,
      user_id: userId,
      predicted_home_score: parsed.data.predicted_home_score,
      predicted_away_score: parsed.data.predicted_away_score,
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) {
    return context.redirect(errorRedirectUrl("Nie udało się zapisać typu"));
  }

  return context.redirect("/dashboard");
};
