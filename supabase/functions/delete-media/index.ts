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
    const { media_url, room_id } = await req.json();

    if (!media_url || !room_id) {
      return new Response(
        JSON.stringify({ error: "media_url and room_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Schedule deletion after 2 hours
    const deleteAfterMs = 2 * 60 * 60 * 1000; // 2 hours

    // Wait 2 hours then delete
    setTimeout(async () => {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Parse the media_url JSON to get storage path
        let storagePath: string;
        try {
          const parsed = JSON.parse(media_url);
          storagePath = parsed.path;
        } catch {
          storagePath = media_url;
        }

        // Delete from storage
        await supabase.storage.from("encrypted-media").remove([storagePath]);

        // Delete media_views record
        await supabase.from("media_views").delete().eq("media_url", media_url);

        // Null out media_url in messages
        await supabase
          .from("messages")
          .update({ media_url: null, media_type: null })
          .eq("media_url", media_url)
          .eq("room_id", room_id);
      } catch (e) {
        console.error("Failed to delete media:", e);
      }
    }, deleteAfterMs);

    return new Response(
      JSON.stringify({ success: true, delete_at: new Date(Date.now() + deleteAfterMs).toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
