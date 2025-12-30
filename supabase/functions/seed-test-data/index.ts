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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const results: string[] = [];

    // Get users
    const { data: users } = await supabase
      .from("users")
      .select("id, nickname, gender, is_profile_complete");

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ error: "No users found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find male and female users with complete profiles
    const maleUser = users.find(u => u.gender === "male" && u.is_profile_complete);
    const femaleUser = users.find(u => u.gender === "female" && u.is_profile_complete);

    if (!maleUser || !femaleUser) {
      return new Response(
        JSON.stringify({
          error: "Need at least one male and one female with complete profile",
          users
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    results.push(`Male user: ${maleUser.nickname} (${maleUser.id})`);
    results.push(`Female user: ${femaleUser.nickname} (${femaleUser.id})`);

    // Delete existing responses for these users
    await supabase.from("user_scenario_responses").delete().eq("user_id", maleUser.id);
    await supabase.from("user_scenario_responses").delete().eq("user_id", femaleUser.id);
    results.push("Deleted existing responses");

    // Add scenario responses for male user (all A options)
    const maleResponses = [
      { user_id: maleUser.id, scenario_id: 1, selected_option_id: 1 },
      { user_id: maleUser.id, scenario_id: 2, selected_option_id: 5 },
      { user_id: maleUser.id, scenario_id: 3, selected_option_id: 9 },
      { user_id: maleUser.id, scenario_id: 4, selected_option_id: 13 },
      { user_id: maleUser.id, scenario_id: 5, selected_option_id: 17 },
    ];

    const { error: maleError } = await supabase
      .from("user_scenario_responses")
      .insert(maleResponses);

    if (maleError) {
      results.push(`Male responses error: ${maleError.message}`);
    } else {
      results.push(`Added 5 responses for ${maleUser.nickname}`);
    }

    // Add scenario responses for female user (3 same, 2 different)
    const femaleResponses = [
      { user_id: femaleUser.id, scenario_id: 1, selected_option_id: 1 },  // Same
      { user_id: femaleUser.id, scenario_id: 2, selected_option_id: 5 },  // Same
      { user_id: femaleUser.id, scenario_id: 3, selected_option_id: 9 },  // Same
      { user_id: femaleUser.id, scenario_id: 4, selected_option_id: 14 }, // Different
      { user_id: femaleUser.id, scenario_id: 5, selected_option_id: 18 }, // Different
    ];

    const { error: femaleError } = await supabase
      .from("user_scenario_responses")
      .insert(femaleResponses);

    if (femaleError) {
      results.push(`Female responses error: ${femaleError.message}`);
    } else {
      results.push(`Added 5 responses for ${femaleUser.nickname}`);
    }

    // Trigger matching by calling create_matches_for_user RPC
    const { data: matchCount, error: matchError } = await supabase
      .rpc("create_matches_for_user", { target_user_id: maleUser.id });

    if (matchError) {
      results.push(`Matching error: ${matchError.message}`);
    } else {
      results.push(`Created ${matchCount} matches for ${maleUser.nickname}`);
    }

    // Get created matches
    const { data: matches } = await supabase
      .from("matches")
      .select("id, user_a_id, user_b_id, compatibility_score, match_reason, user_a_status, user_b_status, is_matched");

    return new Response(
      JSON.stringify({
        success: true,
        results,
        matches,
        maleUser: { id: maleUser.id, nickname: maleUser.nickname },
        femaleUser: { id: femaleUser.id, nickname: femaleUser.nickname },
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
