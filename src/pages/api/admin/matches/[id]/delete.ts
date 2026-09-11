import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  const { id: matchId } = context.params;
  if (!matchId) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Nie znaleziono spotkania"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Supabase is not configured"));
  }

  const { data: match } = await supabase
    .from("matches")
    .select("tournament_id, scheduled_at")
    .eq("id", matchId)
    .single<{ tournament_id: string; scheduled_at: string }>();

  if (!match) {
    return context.redirect("/admin/tournaments?error=" + encodeURIComponent("Nie znaleziono spotkania"));
  }

  const matchesUrl = `/admin/tournaments/${match.tournament_id}/matches`;

  if (new Date(match.scheduled_at) <= new Date()) {
    return context.redirect(
      `${matchesUrl}?error=${encodeURIComponent("Nie można usunąć spotkania, które już się rozpoczęło")}`,
    );
  }

  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) {
    return context.redirect(`${matchesUrl}?error=${encodeURIComponent("Nie udało się usunąć spotkania")}`);
  }

  return context.redirect(matchesUrl);
};
