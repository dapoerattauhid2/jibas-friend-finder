import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabaseAnon.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userId = claimsData.claims.sub;
    const { data: profile } = await supabase
      .from("users_profile")
      .select("role")
      .eq("id", userId)
      .single();

    const { siswa_id, tahun_ajaran_id } = await req.json();

    const staffRoles = ["admin", "kepala_sekolah", "keuangan", "kasir"];
    const isStaff = profile && staffRoles.includes(profile.role);

    if (!isStaff) {
      const { data: isOwn } = await supabase.rpc("is_own_siswa", { _user_id: userId, _siswa_id: siswa_id });
      const { data: isParent } = await supabase.rpc("is_ortu_of", { p_user_id: userId, p_siswa_id: siswa_id });
      if (!isOwn && !isParent) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: jenisList } = await supabase
      .from("jenis_pembayaran")
      .select("id, nama, nominal, tipe")
      .eq("aktif", true);

    if (!jenisList) {
      return new Response(JSON.stringify({ tunggakan: [], total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase
      .from("pembayaran")
      .select("jenis_id, bulan, jumlah")
      .eq("siswa_id", siswa_id);

    if (tahun_ajaran_id) {
      query = query.eq("tahun_ajaran_id", tahun_ajaran_id);
    }

    const { data: payments } = await query;

    const tunggakan: Array<{ jenis: string; bulan: number; nominal: number; terbayar: number; sisa: number; tipe: string }> = [];
    let total = 0;

    for (const jenis of jenisList) {
      const nominal = Number(jenis.nominal) || 0;
      const tipe = jenis.tipe || "bulanan";

      if (tipe === "sekali") {
        const paid = (payments || [])
          .filter((p) => p.jenis_id === jenis.id)
          .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);

        const sisa = nominal - paid;
        if (sisa > 0) {
          tunggakan.push({ jenis: jenis.nama, bulan: 0, nominal, terbayar: paid, sisa, tipe: "sekali" });
          total += sisa;
        }
      } else {
        for (let bulan = 1; bulan <= 12; bulan++) {
          const paid = (payments || [])
            .filter((p) => p.jenis_id === jenis.id && p.bulan === bulan)
            .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);

          const sisa = nominal - paid;
          if (sisa > 0) {
            tunggakan.push({ jenis: jenis.nama, bulan, nominal, terbayar: paid, sisa, tipe: "bulanan" });
            total += sisa;
          }
        }
      }
    }

    return new Response(JSON.stringify({ tunggakan, total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
