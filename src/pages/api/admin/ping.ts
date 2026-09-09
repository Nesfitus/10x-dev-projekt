import type { APIRoute } from "astro";
import { requireRole } from "@/lib/auth";

// Temporary diagnostic endpoint proving requireRole() works end-to-end.
// Replaced by a real admin API endpoint in S-01.
export const GET: APIRoute = (context) => {
  const denied = requireRole(context.locals, "admin");
  if (denied) return denied;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
