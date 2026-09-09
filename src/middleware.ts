import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

const PROTECTED_ROUTES = ["/dashboard"];
const ADMIN_ROUTES = ["/admin"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: UserRole }>();
      context.locals.role = profile?.role ?? null;
    } else {
      context.locals.role = null;
    }
  } else {
    context.locals.user = null;
    context.locals.role = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (ADMIN_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (context.locals.role !== "admin") {
      return context.redirect(context.locals.user ? "/dashboard" : "/auth/signin");
    }
  }

  return next();
});
