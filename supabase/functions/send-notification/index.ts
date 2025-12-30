import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface NotificationPayload {
  user_id: string;
  type: "new_match" | "match_accepted" | "new_message";
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

Deno.serve(async (req: Request) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const { user_id, type, title, body, data } = payload;

    if (!user_id || !type || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's active push tokens
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token, device_type")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (tokenError) {
      console.error("Error fetching tokens:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch push tokens" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      // Log notification even if no tokens
      await supabase.rpc("log_notification", {
        target_user_id: user_id,
        notification_type: type,
        notification_title: title,
        notification_body: body,
        notification_data: data || {},
      });

      return new Response(
        JSON.stringify({ message: "No active push tokens found", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Prepare Expo push messages
    const messages: ExpoPushMessage[] = tokens
      .filter((t) => t.token.startsWith("ExponentPushToken"))
      .map((t) => ({
        to: t.token,
        title,
        body,
        data: { ...data, type },
        sound: "default" as const,
        channelId: getChannelId(type),
      }));

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ message: "No valid Expo push tokens", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Send to Expo Push API
    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const pushResult = await pushResponse.json();

    // Log notification
    await supabase.rpc("log_notification", {
      target_user_id: user_id,
      notification_type: type,
      notification_title: title,
      notification_body: body,
      notification_data: data || {},
    });

    // Check for invalid tokens and deactivate them
    if (pushResult.data) {
      for (let i = 0; i < pushResult.data.length; i++) {
        const result = pushResult.data[i];
        if (result.status === "error") {
          if (
            result.details?.error === "DeviceNotRegistered" ||
            result.details?.error === "InvalidCredentials"
          ) {
            // Deactivate invalid token
            await supabase
              .from("push_tokens")
              .update({ is_active: false })
              .eq("token", messages[i].to);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        sent: messages.length,
        result: pushResult,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function getChannelId(type: string): string {
  switch (type) {
    case "new_match":
      return "matches";
    case "match_accepted":
      return "matches";
    case "new_message":
      return "messages";
    default:
      return "default";
  }
}
