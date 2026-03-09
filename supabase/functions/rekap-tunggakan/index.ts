import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { siswa_id, tahun_ajaran_id } = await req.json();

    // Get all jenis_pembayaran that are active
    const { data: jenisList } = await supabase
      .from("jenis_pembayaran")
      .select("id, nama, nominal, tipe")
      .eq("aktif", true);

    if (!jenisList) {
      return new Response(JSON.stringify({ tunggakan: [], total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get payments made by this student
    let query = supabase
      .from("pembayaran")
      .select("jenis_id, bulan, jumlah")
      .eq("siswa_id", siswa_id);

    if (tahun_ajaran_id) {
      query = query.eq("tahun_ajaran_id", tahun_ajaran_id);
    }

    const { data: payments } = await query;

    // Calculate outstanding per jenis
    const tunggakan: Array<{ jenis: string; bulan: number; nominal: number; terbayar: number; sisa: number; tipe: string }> = [];
    let total = 0;

    for (const jenis of jenisList) {
      const nominal = Number(jenis.nominal) || 0;
      const tipe = jenis.tipe || "bulanan";

      if (tipe === "sekali") {
        // One-time payment: check if paid at all (bulan=0 or any bulan)
        const paid = (payments || [])
          .filter((p) => p.jenis_id === jenis.id)
          .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);

        const sisa = nominal - paid;
        if (sisa > 0) {
          tunggakan.push({
            jenis: jenis.nama,
            bulan: 0,
            nominal,
            terbayar: paid,
            sisa,
            tipe: "sekali",
          });
          total += sisa;
        }
      } else {
        // Monthly payment: check months 1-12
        for (let bulan = 1; bulan <= 12; bulan++) {
          const paid = (payments || [])
            .filter((p) => p.jenis_id === jenis.id && p.bulan === bulan)
            .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);

          const sisa = nominal - paid;
          if (sisa > 0) {
            tunggakan.push({
              jenis: jenis.nama,
              bulan,
              nominal,
              terbayar: paid,
              sisa,
              tipe: "bulanan",
            });
            total += sisa;
          }
        }
      }
    }

    return new Response(JSON.stringify({ tunggakan, total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
