import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

const PROTECTED_ROUTES = ["/dashboard"];
const ADMIN_ROUTES = ["/admin"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  let disabledMessage: string | null = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, disabled")
        .eq("id", user.id)
        .single<{ role: UserRole; disabled: boolean }>();

      if (profile?.disabled) {
        await supabase.auth.signOut();
        context.locals.user = null;
        context.locals.role = null;
        disabledMessage = "Twoje konto zostało dezaktywowane.";
      } else {
        context.locals.role = profile?.role ?? null;
      }
    } else {
      context.locals.role = null;
    }
  } else {
    context.locals.user = null;
    context.locals.role = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect(
        disabledMessage ? `/auth/signin?error=${encodeURIComponent(disabledMessage)}` : "/auth/signin",
      );
    }
  }

  if (ADMIN_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (context.locals.role !== "admin") {
      if (context.locals.user) {
        return context.redirect("/dashboard");
      }
      return context.redirect(
        disabledMessage ? `/auth/signin?error=${encodeURIComponent(disabledMessage)}` : "/auth/signin",
      );
    }
  }

  return next();
});
