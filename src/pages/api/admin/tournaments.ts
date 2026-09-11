import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";

export const prerender = false;

const tournamentSchema = z.object({
  name: z.string().trim().min(1, "Nazwa turnieju jest wymagana").max(200, "Nazwa turnieju jest za długa"),
  description: z
    .string()
    .trim()
    .max(2000, "Opis jest za długi")
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return null;
      return value;
    }),
});

function errorRedirectUrl(message: string) {
  return `/admin/tournaments?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  const form = await context.request.formData();
  const parsed = tournamentSchema.safeParse({
    name: form.get("name"),
    description: form.get("description"),
  });

  if (!parsed.success) {
    return context.redirect(errorRedirectUrl(parsed.error.issues[0].message));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(errorRedirectUrl("Supabase is not configured"));
  }

  const { error } = await supabase.from("tournaments").insert({
    name: parsed.data.name,
    description: parsed.data.description,
    created_by: context.locals.user?.id,
  });

  if (error) {
    if (error.code === "23505") {
      return context.redirect(errorRedirectUrl("Istnieje już aktywny turniej — zamknij go, zanim utworzysz kolejny."));
    }
    return context.redirect(errorRedirectUrl("Nie udało się utworzyć turnieju"));
  }

  return context.redirect("/admin/tournaments");
};
