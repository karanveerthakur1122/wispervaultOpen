const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit } = await req.json();
    const apiKey = Deno.env.get("TENOR_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "TENOR_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const endpoint = query && query !== "trending" ? "search" : "featured";
    const params = new URLSearchParams({
      key: apiKey,
      client_key: "wispervault",
      limit: String(limit || 30),
      media_filter: "gif,tinygif",
    });
    if (endpoint === "search") {
      params.set("q", query);
    }

    const url = `https://tenor.googleapis.com/v2/${endpoint}?${params.toString()}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      console.error("Tenor API error:", data);
      return new Response(
        JSON.stringify({ error: data.error?.message || "Tenor API error" }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map to simpler format
    const results = (data.results || []).map((r: any) => ({
      id: r.id,
      title: r.title || r.content_description || "",
      preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || "",
      url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url || "",
    }));

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
