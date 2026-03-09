import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppPayload {
  phone: string;
  message: string;
}

interface BulkPayload {
  phones: string[];
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || ""
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    // Check role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabaseAdmin
      .from("users_profile")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "kepala_sekolah"].includes(profile.role)) {
      throw new Error("Forbidden: hanya admin yang bisa mengirim notifikasi");
    }

    const WA_GATEWAY_URL = Deno.env.get("WA_GATEWAY_URL");
    const WA_GATEWAY_TOKEN = Deno.env.get("WA_GATEWAY_TOKEN");

    if (!WA_GATEWAY_URL) {
      throw new Error("WA_GATEWAY_URL belum dikonfigurasi");
    }

    const body = await req.json();
    const results: { phone: string; success: boolean; error?: string }[] = [];

    // Support single or bulk send
    const phones: string[] = body.phones || (body.phone ? [body.phone] : []);
    const message: string = body.message;

    if (!phones.length || !message) {
      throw new Error("phone(s) dan message wajib diisi");
    }

    for (const phone of phones) {
      try {
        // Format phone number (remove + and spaces, ensure format)
        const cleanPhone = phone.replace(/\D/g, "");
        const jid = cleanPhone.includes("@") ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        
        if (WA_GATEWAY_TOKEN) {
          headers["Authorization"] = `Bearer ${WA_GATEWAY_TOKEN}`;
        }

        const res = await fetch(`${WA_GATEWAY_URL}/send-message`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            jid,
            message: {
              text: message,
            },
          }),
        });

        const data = await res.json();
        
        if (!res.ok || data.error) {
          results.push({ phone, success: false, error: data.error || data.message || "Failed to send" });
        } else {
          results.push({ phone, success: true });
        }
      } catch (err: any) {
        results.push({ phone, success: false, error: err.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: results.length - successCount,
        details: results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("send-whatsapp error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.message.includes("Unauthorized") ? 401 : 400,
      }
    );
  }
});
