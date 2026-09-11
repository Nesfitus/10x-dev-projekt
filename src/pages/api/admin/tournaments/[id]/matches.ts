import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import type { TournamentStatus } from "@/types";

export const prerender = false;

// datetime-local inputs never carry timezone info (e.g. "2026-09-20T18:00").
// The regex pins the browser-produced shape before we append ":00Z" and
// coerce to a Date — this avoids the native Date constructor's lenient
// fallback parser silently accepting garbage strings as valid dates.
const matchSchema = z.object({
  home_team: z.string().trim().min(1, "Nazwa gospodarza jest wymagana").max(200, "Nazwa gospodarza jest za długa"),
  away_team: z.string().trim().min(1, "Nazwa gościa jest wymagana").max(200, "Nazwa gościa jest za długa"),
  scheduled_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Nieprawidłowy termin spotkania")
    .transform((value) => `${value}:00Z`)
    .pipe(z.coerce.date({ error: "Nieprawidłowy termin spotkania" })),
});

function errorRedirectUrl(tournamentId: string, message: string) {
  return `/admin/tournaments/${tournamentId}/matches?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  const { id: tournamentId } = context.params;
  if (!tournamentId) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Nie znaleziono turnieju"));
  }

  const form = await context.request.formData();
  const parsed = matchSchema.safeParse({
    home_team: form.get("home_team"),
    away_team: form.get("away_team"),
    scheduled_at: form.get("scheduled_at"),
  });

  if (!parsed.success) {
    return context.redirect(errorRedirectUrl(tournamentId, parsed.error.issues[0].message));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirectUrl(tournamentId, "Supabase is not configured"));
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .single<{ status: TournamentStatus }>();

  if (!tournament) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Nie znaleziono turnieju"));
  }
  if (tournament.status !== "active") {
    return context.redirect(errorRedirectUrl(tournamentId, "Nie można dodawać spotkań do zamkniętego turnieju"));
  }

  const { error } = await supabase.from("matches").insert({
    tournament_id: tournamentId,
    home_team: parsed.data.home_team,
    away_team: parsed.data.away_team,
    scheduled_at: parsed.data.scheduled_at,
    created_by: context.locals.user?.id,
  });

  if (error) {
    return context.redirect(errorRedirectUrl(tournamentId, "Nie udało się dodać spotkania"));
  }

  return context.redirect(`/admin/tournaments/${tournamentId}/matches`);
};
