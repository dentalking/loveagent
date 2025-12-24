import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PersonalityVector {
  [key: string]: number;
}

interface UserResponse {
  user_id: string;
  scenario_id: number;
  personality_vector: PersonalityVector;
}

interface UserProfile {
  id: string;
  nickname: string;
  gender: string;
  birth_year: number;
  location: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get current user profile
    const { data: currentUser, error: userError } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", user_id)
      .single();

    if (userError || !currentUser) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get current user's responses with personality vectors
    const { data: userResponses, error: responsesError } = await supabaseClient
      .from("user_scenario_responses")
      .select(`
        scenario_id,
        selected_option_id,
        scenario_options!inner(personality_vector)
      `)
      .eq("user_id", user_id);

    if (responsesError || !userResponses?.length) {
      return new Response(
        JSON.stringify({ error: "User has no scenario responses" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Find potential matches (opposite gender, profile complete, not already matched)
    const targetGender = currentUser.gender === "male" ? "female" : "male";

    const { data: potentialMatches, error: matchesError } = await supabaseClient
      .from("users")
      .select("id, nickname, gender, birth_year, location")
      .eq("gender", targetGender)
      .eq("is_profile_complete", true)
      .neq("id", user_id);

    if (matchesError || !potentialMatches?.length) {
      return new Response(
        JSON.stringify({ error: "No potential matches found", matches: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Get existing matches to exclude
    const { data: existingMatches } = await supabaseClient
      .from("matches")
      .select("user_a_id, user_b_id")
      .or(`user_a_id.eq.${user_id},user_b_id.eq.${user_id}`);

    const matchedUserIds = new Set(
      existingMatches?.flatMap((m) => [m.user_a_id, m.user_b_id]) || []
    );
    matchedUserIds.delete(user_id);

    // 5. Filter out already matched users
    const unmatchedUsers = potentialMatches.filter(
      (u) => !matchedUserIds.has(u.id)
    );

    if (!unmatchedUsers.length) {
      return new Response(
        JSON.stringify({ message: "No new matches available", matches: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Calculate compatibility for each potential match
    const matchResults = [];

    for (const candidate of unmatchedUsers) {
      // Get candidate's responses
      const { data: candidateResponses } = await supabaseClient
        .from("user_scenario_responses")
        .select(`
          scenario_id,
          selected_option_id,
          scenario_options!inner(personality_vector)
        `)
        .eq("user_id", candidate.id);

      if (!candidateResponses?.length) continue;

      // Calculate compatibility score
      const score = calculateCompatibility(userResponses, candidateResponses);
      const reason = generateMatchReason(userResponses, candidateResponses, score);

      matchResults.push({
        candidate,
        score,
        reason,
      });
    }

    // 7. Sort by score and take top matches
    matchResults.sort((a, b) => b.score - a.score);
    const topMatches = matchResults.slice(0, 5); // Top 5 matches

    // 8. Create match records
    const createdMatches = [];

    for (const match of topMatches) {
      if (match.score < 50) continue; // Minimum threshold

      // Ensure user_a_id < user_b_id for consistency
      const [user_a_id, user_b_id] = [user_id, match.candidate.id].sort();

      const { data: newMatch, error: insertError } = await supabaseClient
        .from("matches")
        .insert({
          user_a_id,
          user_b_id,
          compatibility_score: match.score,
          match_reason: match.reason,
        })
        .select()
        .single();

      if (!insertError && newMatch) {
        createdMatches.push({
          ...newMatch,
          other_user: match.candidate,
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Created ${createdMatches.length} new matches`,
        matches: createdMatches,
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

/**
 * Calculate compatibility score between two users based on personality vectors
 */
function calculateCompatibility(
  userResponses: any[],
  candidateResponses: any[]
): number {
  const userVectors = extractVectors(userResponses);
  const candidateVectors = extractVectors(candidateResponses);

  if (!userVectors.length || !candidateVectors.length) {
    return 0;
  }

  // Calculate average similarity across all scenarios
  let totalSimilarity = 0;
  let comparisons = 0;

  for (const userVec of userVectors) {
    for (const candVec of candidateVectors) {
      if (userVec.scenarioId === candVec.scenarioId) {
        const similarity = cosineSimilarity(userVec.vector, candVec.vector);
        totalSimilarity += similarity;
        comparisons++;
      }
    }
  }

  if (comparisons === 0) return 50; // Default if no common scenarios

  const avgSimilarity = totalSimilarity / comparisons;

  // Convert to 0-100 scale (cosine similarity is -1 to 1)
  return Math.round(((avgSimilarity + 1) / 2) * 100);
}

/**
 * Extract personality vectors from responses
 */
function extractVectors(responses: any[]): { scenarioId: number; vector: number[] }[] {
  return responses
    .filter((r) => r.scenario_options?.personality_vector)
    .map((r) => ({
      scenarioId: r.scenario_id,
      vector: Object.values(r.scenario_options.personality_vector as PersonalityVector),
    }));
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Generate a human-readable match reason
 */
function generateMatchReason(
  userResponses: any[],
  candidateResponses: any[],
  score: number
): string {
  const reasons: string[] = [];

  // Find matching scenarios
  const userScenarios = new Map(userResponses.map((r) => [r.scenario_id, r.selected_option_id]));
  const candidateScenarios = new Map(candidateResponses.map((r) => [r.scenario_id, r.selected_option_id]));

  let sameChoices = 0;
  for (const [scenarioId, optionId] of userScenarios) {
    if (candidateScenarios.get(scenarioId) === optionId) {
      sameChoices++;
    }
  }

  if (sameChoices >= 3) {
    reasons.push("많은 가치관이 일치해요");
  } else if (sameChoices >= 2) {
    reasons.push("중요한 가치관이 비슷해요");
  }

  if (score >= 80) {
    reasons.push("서로 잘 맞을 가능성이 높아요");
  } else if (score >= 65) {
    reasons.push("좋은 대화 상대가 될 수 있어요");
  }

  // Category-specific reasons
  const categoryReasons: Record<number, string> = {
    1: "갈등 해결 방식이 비슷해요",
    2: "커리어와 관계에 대한 생각이 통해요",
    3: "생활 방식이 잘 맞아요",
    4: "미래에 대한 비전이 비슷해요",
    5: "신뢰에 대한 생각이 비슷해요",
  };

  for (const [scenarioId, optionId] of userScenarios) {
    if (candidateScenarios.get(scenarioId) === optionId && categoryReasons[scenarioId]) {
      reasons.push(categoryReasons[scenarioId]);
      break; // Just add one specific reason
    }
  }

  return reasons.slice(0, 2).join(". ") || "새로운 만남을 시작해보세요";
}
