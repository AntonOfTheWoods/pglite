// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.177.1/http/server.ts"
import { corsHeaders } from "../shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const supabaseClient = createClient(
    // Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    }
  );
  const headers = [...req.headers.entries()];
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const {
    data: { user },
    error
  } = await supabaseClient.auth.getUser(token);

  return new Response(
    JSON.stringify({user, headers, message: `"Hello from Edge Functions!"`, error, token, url: Deno.env.get("SUPABASE_URL"), anonKey: Deno.env.get("SUPABASE_ANON_KEY") }),
    // `"Hello from Edge Functions! Found user ${user} with headers ${headers}"`,
    { headers: { "Content-Type": "application/json" } },
  )
})

// To invoke:
// curl 'http://localhost:<KONG_HTTP_PORT>/functions/v1/hello' \
//   --header 'Authorization: Bearer <anon/service_role API key>'
