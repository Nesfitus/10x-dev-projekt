import type { APIRoute } from "astro";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";

export const prerender = false;

const createUserSchema = z.object({
  email: z.email("Podaj poprawny adres e-mail").trim(),
  password: z.string().trim().min(6, "Hasło musi mieć co najmniej 6 znaków").max(72, "Hasło jest za długie"),
});

function errorRedirectUrl(message: string) {
  return `/admin/users?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  const form = await context.request.formData();
  const parsed = createUserSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });

  if (!parsed.success) {
    return context.redirect(errorRedirectUrl(parsed.error.issues[0].message));
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return context.redirect(errorRedirectUrl("Supabase service_role is not configured"));
  }

  const { error } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (error) {
    if (error.code === "email_exists") {
      return context.redirect(errorRedirectUrl("Konto z tym adresem e-mail już istnieje"));
    }
    return context.redirect(errorRedirectUrl("Nie udało się utworzyć konta"));
  }

  return context.redirect("/admin/users");
};
