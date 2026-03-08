import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message_id, session_token, encrypted_blob, iv } = await req.json();

    if (!message_id || !session_token || !encrypted_blob || !iv) {
      return new Response(
        JSON.stringify({ error: "message_id, session_token, encrypted_blob, and iv are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get the message to find the sender
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .select("id, sender_name, room_id, expires_at")
      .eq("id", message_id)
      .maybeSingle();

    if (msgError || !message) {
      return new Response(
        JSON.stringify({ error: "Message not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if message has expired
    if (message.expires_at && new Date(message.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Message has expired and cannot be edited" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validate session token matches the sender
    const { data: session, error: sessionError } = await supabase
      .from("room_sessions")
      .select("username")
      .eq("room_id", message.room_id)
      .eq("session_token", session_token)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Invalid session token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verify the session user is the message sender
    if (session.username !== message.sender_name) {
      return new Response(
        JSON.stringify({ error: "You can only edit your own messages" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Perform the edit
    const { error: updateError } = await supabase
      .from("messages")
      .update({ encrypted_blob, iv })
      .eq("id", message_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Update last_message_at on room
    await supabase
      .from("rooms")
      .update({ last_message_at: new Date().toISOString() })
      .eq("room_id", message.room_id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("edit-message error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
