// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  // Disabled: Astro's built-in same-origin check produces false-positive
  // "Cross-site POST form submissions are forbidden" rejections behind the
  // Cloudflare Workers edge proxy (see astro#12851 for the same root cause
  // with other reverse proxies). CSRF protection is still provided by
  // Supabase's SameSite=Lax auth cookies.
  security: {
    checkOrigin: false,
  },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
