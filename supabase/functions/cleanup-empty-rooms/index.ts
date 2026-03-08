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

  // Validate service role key to prevent unauthorized invocations
  const authHeader = req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!authHeader || !authHeader.endsWith(serviceRoleKey)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Step 1: Prune all stale presence records globally (last_seen > 5 min ago)
    const { data: pruned } = await supabase
      .from("presence")
      .delete()
      .lt("last_seen", fiveMinutesAgo)
      .select("id");
    
    if (pruned && pruned.length > 0) {
      console.log(`Pruned ${pruned.length} stale presence records`);
    }

    // Step 2: Find rooms with no message activity for 2+ hours
    const { data: inactiveRooms } = await supabase
      .from("rooms")
      .select("room_id")
      .eq("active", true)
      .lt("last_message_at", twoHoursAgo);

    if (!inactiveRooms || inactiveRooms.length === 0) {
      console.log("No inactive rooms found");
      return new Response(
        JSON.stringify({ success: true, deleted: 0, prunedPresence: pruned?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${inactiveRooms.length} inactive rooms to check`);
    let deleted = 0;

    for (const room of inactiveRooms) {
      const roomId = room.room_id;

      // Double-check: no active presence (after pruning stale ones above)
      const { count } = await supabase
        .from("presence")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .eq("is_active", true);

      if ((count ?? 0) > 0) {
        console.log(`Skipping room ${roomId}: ${count} active users remaining`);
        continue;
      }

      // Delete in correct FK order
        await supabase.from("reactions").delete().eq("room_id", roomId);
        await supabase.from("read_receipts").delete().eq("room_id", roomId);
        await supabase.from("media_views").delete().eq("room_id", roomId);
        await supabase.from("room_sessions").delete().eq("room_id", roomId);

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
      deleted++;
    }

    return new Response(
      JSON.stringify({ success: true, deleted, prunedPresence: pruned?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("cleanup-empty-rooms error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
