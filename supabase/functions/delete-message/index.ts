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
    const { message_id, session_token } = await req.json();

    if (!message_id || !session_token) {
      return new Response(
        JSON.stringify({ error: "message_id and session_token are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get the message
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .select("id, sender_name, room_id, media_url")
      .eq("id", message_id)
      .maybeSingle();

    if (msgError || !message) {
      return new Response(
        JSON.stringify({ error: "Message not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validate session token matches the sender
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

    // 3. Verify the session user is the message sender
    if (session.username !== message.sender_name) {
      return new Response(
        JSON.stringify({ error: "You can only delete your own messages" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Delete child records
    await supabase.from("reactions").delete().eq("message_id", message_id);
    await supabase.from("read_receipts").delete().eq("message_id", message_id);

    // 5. Delete media from storage if present
    if (message.media_url) {
      try {
        const parsed = JSON.parse(message.media_url);
        if (parsed.path) {
          await supabase.storage.from("encrypted-media").remove([parsed.path]);
        }
      } catch {
        // Not JSON — skip
      }
    }

    // 6. Delete the message
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .eq("id", message_id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: "Failed to delete message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("delete-message error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
