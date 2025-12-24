import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface NotificationPayload {
  user_id: string;
  type: "new_match" | "match_accepted" | "new_message";
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
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

    const payload: NotificationPayload = await req.json();
    const { user_id, type, title, body, data } = payload;

    if (!user_id || !type || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get user's active push tokens
    const { data: tokens, error: tokensError } = await supabaseClient
      .from("push_tokens")
      .select("token, device_type")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (tokensError || !tokens?.length) {
      return new Response(
        JSON.stringify({ message: "No active push tokens found", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Log notification
    await supabaseClient.from("notification_logs").insert({
      user_id,
      type,
      title,
      body,
      data,
    });

    // 3. Prepare Expo push messages
    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data: { ...data, type },
      sound: "default",
      priority: "high",
      channelId: "default",
    }));

    // 4. Send to Expo Push API
    const expoPushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoPushResult = await expoPushResponse.json();

    // 5. Handle invalid tokens (mark as inactive)
    if (expoPushResult.data) {
      for (let i = 0; i < expoPushResult.data.length; i++) {
        const result = expoPushResult.data[i];
        if (result.status === "error") {
          if (
            result.details?.error === "DeviceNotRegistered" ||
            result.details?.error === "InvalidCredentials"
          ) {
            // Mark token as inactive
            await supabaseClient
              .from("push_tokens")
              .update({ is_active: false })
              .eq("token", tokens[i].token);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        sent: messages.length,
        results: expoPushResult,
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
