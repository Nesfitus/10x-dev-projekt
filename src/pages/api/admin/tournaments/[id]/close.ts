import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import type { TournamentStatus } from "@/types";

export const prerender = false;

function errorRedirectUrl(message: string) {
  return `/admin/tournaments?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  const { id: tournamentId } = context.params;
  if (!tournamentId) {
    return context.redirect(errorRedirectUrl("Nie znaleziono turnieju"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirectUrl("Supabase nie jest skonfigurowane"));
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("status")
    .eq("id", tournamentId)
    .single<{ status: TournamentStatus }>();

  if (!tournament) {
    return context.redirect(errorRedirectUrl("Nie znaleziono turnieju"));
  }
  if (tournament.status !== "active") {
    return context.redirect(errorRedirectUrl("Turniej jest już zamknięty"));
  }

  const { error } = await supabase.from("tournaments").update({ status: "closed" }).eq("id", tournamentId);
  if (error) {
    return context.redirect(errorRedirectUrl("Nie udało się zamknąć turnieju"));
  }

  return context.redirect("/admin/tournaments");
};
