import type { UserRole } from "@/types";

export function requireRole(locals: App.Locals, role: UserRole): Response | null {
  if (locals.role !== role) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
