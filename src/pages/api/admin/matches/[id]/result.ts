import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import type { TournamentStatus } from "@/types";

export const prerender = false;

const resultSchema = z.object({
  actual_home_score: z.coerce
    .number({ error: "Wynik gospodarzy jest wymagany" })
    .int("Wynik musi być liczbą całkowitą")
    .min(0, "Wynik nie może być ujemny"),
  actual_away_score: z.coerce
    .number({ error: "Wynik gości jest wymagany" })
    .int("Wynik musi być liczbą całkowitą")
    .min(0, "Wynik nie może być ujemny"),
});

// 1 = home win, 0 = draw, -1 = away win — comparable between predicted and actual.
function outcomeSign(home: number, away: number) {
  return home > away ? 1 : home < away ? -1 : 0;
}

function calculatePoints(predictedHome: number, predictedAway: number, actualHome: number, actualAway: number) {
  if (predictedHome === actualHome && predictedAway === actualAway) return 3;
  if (outcomeSign(predictedHome, predictedAway) === outcomeSign(actualHome, actualAway)) return 1;
  return 0;
}

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  const { id: matchId } = context.params;
  if (!matchId) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Nie znaleziono spotkania"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Supabase nie jest skonfigurowane"));
  }

  const { data: match } = await supabase
    .from("matches")
    .select("actual_home_score, actual_away_score, scheduled_at, tournament_id, tournament:tournaments(status)")
    .eq("id", matchId)
    .single<{
      actual_home_score: number | null;
      actual_away_score: number | null;
      scheduled_at: string;
      tournament_id: string;
      tournament: { status: TournamentStatus } | null;
    }>();

  if (!match) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Nie znaleziono spotkania"));
  }

  function errorRedirectUrl(message: string) {
    return `/admin/tournaments/${match!.tournament_id}/matches?error=${encodeURIComponent(message)}`;
  }

  if (match.actual_home_score !== null) {
    return context.redirect(errorRedirectUrl("Wynik już wprowadzony"));
  }
  if (match.tournament?.status !== "active") {
    return context.redirect(errorRedirectUrl("Nie można wprowadzić wyniku dla zamkniętego turnieju"));
  }
  if (new Date(match.scheduled_at) > new Date()) {
    return context.redirect(errorRedirectUrl("Nie można wprowadzić wyniku przed rozpoczęciem meczu"));
  }

  const form = await context.request.formData();
  const parsed = resultSchema.safeParse({
    actual_home_score: form.get("actual_home_score"),
    actual_away_score: form.get("actual_away_score"),
  });
  if (!parsed.success) {
    return context.redirect(errorRedirectUrl(parsed.error.issues[0].message));
  }
  const { actual_home_score, actual_away_score } = parsed.data;

  const { error: matchUpdateError } = await supabase
    .from("matches")
    .update({ actual_home_score, actual_away_score })
    .eq("id", matchId);
  if (matchUpdateError) {
    return context.redirect(errorRedirectUrl("Nie udało się zapisać wyniku"));
  }

  const { data: predictions, error: predictionsError } = await supabase
    .from("predictions")
    .select("id, match_id, user_id, predicted_home_score, predicted_away_score")
    .eq("match_id", matchId);
  if (predictionsError) {
    return context.redirect(errorRedirectUrl("Nie udało się zapisać wyniku"));
  }

  if (predictions && predictions.length > 0) {
    const scored = predictions.map((prediction) => ({
      ...prediction,
      points: calculatePoints(
        prediction.predicted_home_score,
        prediction.predicted_away_score,
        actual_home_score,
        actual_away_score,
      ),
    }));
    const { error: scoringError } = await supabase.from("predictions").upsert(scored, { onConflict: "id" });
    if (scoringError) {
      return context.redirect(errorRedirectUrl("Nie udało się zapisać wyniku"));
    }
  }

  return context.redirect(`/admin/tournaments/${match.tournament_id}/matches`);
};
