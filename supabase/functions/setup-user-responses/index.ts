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
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Delete existing responses
    await supabase.from("user_scenario_responses").delete().eq("user_id", user_id);

    // Add scenario responses (B, B, A, C, B options)
    const responses = [
      { user_id, scenario_id: 1, selected_option_id: 2 },  // B
      { user_id, scenario_id: 2, selected_option_id: 6 },  // B
      { user_id, scenario_id: 3, selected_option_id: 9 },  // A
      { user_id, scenario_id: 4, selected_option_id: 15 }, // C
      { user_id, scenario_id: 5, selected_option_id: 18 }, // B
    ];

    const { error: insertError } = await supabase
      .from("user_scenario_responses")
      .insert(responses);

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark profile as complete
    await supabase
      .from("users")
      .update({ is_profile_complete: true })
      .eq("id", user_id);

    // Trigger matching
    const { data: matchCount, error: matchError } = await supabase
      .rpc("create_matches_for_user", { target_user_id: user_id });

    // Get matches
    const { data: matches } = await supabase
      .from("matches")
      .select("id, user_a_id, user_b_id, compatibility_score, is_matched")
      .or(`user_a_id.eq.${user_id},user_b_id.eq.${user_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        matchCount: matchCount || 0,
        matches,
        matchError: matchError?.message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
