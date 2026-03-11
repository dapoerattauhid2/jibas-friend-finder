import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getPredikat(nilai: number): string {
  if (nilai >= 90) return "A";
  if (nilai >= 80) return "B";
  if (nilai >= 70) return "C";
  if (nilai >= 60) return "D";
  return "E";
}

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

    // Role check: admin, kepala_sekolah, guru, or parent/student of the siswa
    const userId = claimsData.claims.sub;
    const { data: profile } = await supabase
      .from("users_profile")
      .select("role")
      .eq("id", userId)
      .single();

    const allowedRoles = ["admin", "kepala_sekolah", "guru", "keuangan"];
    const isStaff = profile && allowedRoles.includes(profile.role);

    const { siswa_id, mapel_id, kelas_id, tahun_ajaran_id, semester_id } = await req.json();

    if (!isStaff) {
      // Check if user is the student or parent
      const { data: isOwn } = await supabase.rpc("is_own_siswa", { _user_id: userId, _siswa_id: siswa_id });
      const { data: isParent } = await supabase.rpc("is_ortu_of", { p_user_id: userId, p_siswa_id: siswa_id });
      if (!isOwn && !isParent) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: grades } = await supabase
      .from("penilaian")
      .select("jenis_ujian, nilai")
      .eq("siswa_id", siswa_id)
      .eq("mapel_id", mapel_id)
      .eq("kelas_id", kelas_id)
      .eq("tahun_ajaran_id", tahun_ajaran_id)
      .eq("semester_id", semester_id);

    if (!grades || grades.length === 0) {
      return new Response(JSON.stringify({ error: "Tidak ada data penilaian" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const weights: Record<string, number> = {
      tugas: 0.2,
      ulangan_harian: 0.2,
      uts: 0.25,
      uas: 0.35,
    };

    const grouped: Record<string, number[]> = {};
    for (const g of grades) {
      const key = g.jenis_ujian || "tugas";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(Number(g.nilai) || 0);
    }

    let nilaiAkhir = 0;
    let totalWeight = 0;
    for (const [jenis, values] of Object.entries(grouped)) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const w = weights[jenis] || 0.25;
      nilaiAkhir += avg * w;
      totalWeight += w;
    }

    if (totalWeight > 0) nilaiAkhir = nilaiAkhir / totalWeight * 1;
    const rounded = Math.round(nilaiAkhir * 100) / 100;
    const predikat = getPredikat(rounded);

    return new Response(JSON.stringify({ nilai_akhir: rounded, predikat }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
