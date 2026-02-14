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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let deletedMessages = 0;
    let deletedRooms = 0;

    // ── 0. Prune stale presence records globally ──
    const { data: pruned } = await supabase
      .from("presence")
      .delete()
      .lt("last_seen", fiveMinutesAgo)
      .select("id");
    
    if (pruned && pruned.length > 0) {
      console.log(`Pruned ${pruned.length} stale presence records`);
    }

    // ── 1. Delete expired messages (expires_at < now) ──
    const { data: expiredMessages } = await supabase
      .from("messages")
      .select("id, room_id, media_url")
      .lt("expires_at", now);

    if (expiredMessages && expiredMessages.length > 0) {
      const msgIds = expiredMessages.map((m: { id: string }) => m.id);

      // Delete child records first
      await supabase.from("reactions").delete().in("message_id", msgIds);
      await supabase.from("read_receipts").delete().in("message_id", msgIds);

      // Delete associated media from storage
      for (const msg of expiredMessages) {
        if (msg.media_url) {
          try {
            const parsed = JSON.parse(msg.media_url);
            if (parsed.path) {
              await supabase.storage.from("encrypted-media").remove([parsed.path]);
            }
          } catch {
            // Not JSON or no path — skip
          }
        }
      }

      // Delete the messages themselves
      await supabase.from("messages").delete().in("id", msgIds);
      deletedMessages = msgIds.length;
      console.log(`Deleted ${deletedMessages} expired messages`);
    }

    // ── 2. Delete inactive rooms (no message for 2+ hours, no active users) ──
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: inactiveRooms } = await supabase
      .from("rooms")
      .select("room_id")
      .eq("active", true)
      .lt("last_message_at", twoHoursAgo);

    if (inactiveRooms && inactiveRooms.length > 0) {
      console.log(`Found ${inactiveRooms.length} inactive rooms to check`);
      
      for (const room of inactiveRooms) {
        const roomId = room.room_id;

        // Double-check: no active presence (stale ones already pruned above)
        const { count } = await supabase
          .from("presence")
          .select("id", { count: "exact", head: true })
          .eq("room_id", roomId)
          .eq("is_active", true);

        if ((count ?? 0) > 0) {
          console.log(`Skipping room ${roomId}: ${count} active users`);
          continue;
        }

        // Delete in FK order
        await supabase.from("reactions").delete().eq("room_id", roomId);
        await supabase.from("read_receipts").delete().eq("room_id", roomId);
        await supabase.from("media_views").delete().eq("room_id", roomId);

        // Delete encrypted media from storage
        const { data: mediaFiles } = await supabase.storage
          .from("encrypted-media")
          .list(roomId);
        if (mediaFiles && mediaFiles.length > 0) {
          const paths = mediaFiles.map((f: { name: string }) => `${roomId}/${f.name}`);
          await supabase.storage.from("encrypted-media").remove(paths);
        }

        await supabase.from("messages").delete().eq("room_id", roomId);
        await supabase.from("presence").delete().eq("room_id", roomId);
        await supabase.from("rooms").delete().eq("room_id", roomId);

        console.log(`Auto-deleted inactive room: ${roomId}`);
        deletedRooms++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, deletedMessages, deletedRooms, prunedPresence: pruned?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("cleanup-expired-messages error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
