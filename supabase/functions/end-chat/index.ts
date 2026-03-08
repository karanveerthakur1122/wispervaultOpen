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
    const { room_id, session_token } = await req.json();

    if (!room_id || typeof room_id !== "string") {
      return new Response(
        JSON.stringify({ error: "room_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!session_token || typeof session_token !== "string") {
      return new Response(
        JSON.stringify({ error: "session_token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate session token belongs to the room creator
    const { data: session, error: sessionError } = await supabase
      .from("room_sessions")
      .select("username, is_creator")
      .eq("room_id", room_id)
      .eq("session_token", session_token)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Invalid session token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!session.is_creator) {
      return new Response(
        JSON.stringify({ error: "Only the room creator can end the chat" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete in correct FK order: children first, then parents

    // 1. Delete reactions (FK -> messages)
    await supabase.from("reactions").delete().eq("room_id", room_id);

    // 2. Delete read receipts (FK -> messages)
    await supabase.from("read_receipts").delete().eq("room_id", room_id);

    // 3. Delete media views (FK -> rooms)
    await supabase.from("media_views").delete().eq("room_id", room_id);

    // 4. Delete room sessions
    await supabase.from("room_sessions").delete().eq("room_id", room_id);

    // 5. Delete encrypted media from storage
    const { data: mediaFiles } = await supabase.storage
      .from("encrypted-media")
      .list(room_id);
    if (mediaFiles && mediaFiles.length > 0) {
      const paths = mediaFiles.map((f) => `${room_id}/${f.name}`);
      await supabase.storage.from("encrypted-media").remove(paths);
    }

    // 6. Delete all messages (FK -> rooms)
    await supabase.from("messages").delete().eq("room_id", room_id);

    // 7. Delete all presence (FK -> rooms)
    await supabase.from("presence").delete().eq("room_id", room_id);

    // 8. Delete the room
    await supabase.from("rooms").delete().eq("room_id", room_id);

    console.log(`Room ${room_id} fully deleted`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("end-chat error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
