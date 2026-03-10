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
    const clientKey = Deno.env.get("MIDTRANS_CLIENT_KEY") || "";
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY") || "";

    // Auto-detect mode from either key prefix
    const isSandbox =
      clientKey.startsWith("SB-") || serverKey.startsWith("SB-");

    return new Response(
      JSON.stringify({
        client_key: clientKey,
        is_sandbox: isSandbox,
        snap_url: isSandbox
          ? "https://app.sandbox.midtrans.com/snap/snap.js"
          : "https://app.midtrans.com/snap/snap.js",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
