import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { match_id, user_id, accept } = await req.json();

    if (!match_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "match_id and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the match
    const { data: match, error: matchError } = await supabaseClient
      .from("matches")
      .select("*")
      .eq("id", match_id)
      .single();

    if (matchError || !match) {
      return new Response(
        JSON.stringify({ error: "Match not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine which user field to update
    const isUserA = match.user_a_id === user_id;
    const isUserB = match.user_b_id === user_id;

    if (!isUserA && !isUserB) {
      return new Response(
        JSON.stringify({ error: "User is not part of this match" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const status = accept !== false ? "accepted" : "rejected";
    const updateField = isUserA ? "user_a_status" : "user_b_status";

    // Update the match status
    const updateData: Record<string, any> = { [updateField]: status };

    // Check if both users have now accepted
    const otherStatus = isUserA ? match.user_b_status : match.user_a_status;
    if (status === "accepted" && otherStatus === "accepted") {
      updateData.is_matched = true;
      updateData.matched_at = new Date().toISOString();
    }

    const { data: updatedMatch, error: updateError } = await supabaseClient
      .from("matches")
      .update(updateData)
      .eq("id", match_id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, match: updatedMatch }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
