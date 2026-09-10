import type { APIRoute } from "astro";

export const POST: APIRoute = (context) => {
  return context.redirect(`/auth/signup?error=${encodeURIComponent("Rejestracja jest zamknięta")}`);
};
