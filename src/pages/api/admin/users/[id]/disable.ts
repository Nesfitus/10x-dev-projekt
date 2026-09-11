import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import type { UserRole } from "@/types";

export const prerender = false;

function errorRedirectUrl(message: string) {
  return `/admin/users?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  const { id } = context.params;
  const adminClient = createAdminClient();
  if (!adminClient) {
    return context.redirect(errorRedirectUrl("Supabase service_role is not configured"));
  }

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", id).single<{ role: UserRole }>();

  if (!profile) {
    return context.redirect(errorRedirectUrl("Nie znaleziono konta"));
  }
  if (profile.role === "admin") {
    return context.redirect(errorRedirectUrl("Nie można dezaktywować konta Admina"));
  }

  const { error } = await adminClient.from("profiles").update({ disabled: true }).eq("id", id);
  if (error) {
    return context.redirect(errorRedirectUrl("Nie udało się dezaktywować konta"));
  }

  return context.redirect("/admin/users");
};
