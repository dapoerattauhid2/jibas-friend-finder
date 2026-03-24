import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function error(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractRombelCode(namaKelas: string): number | null {
  const lastChar = namaKelas.trim().slice(-1).toUpperCase();
  const code = lastChar.charCodeAt(0) - 64; // A=1, B=2, ...
  return code >= 1 && code <= 26 ? code : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return error("Unauthorized", 401);
    }

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseAnon.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return error("Unauthorized", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Role check
    const userId = claimsData.claims.sub;
    const { data: profile } = await supabase
      .from("users_profile")
      .select("role")
      .eq("id", userId)
      .single();

    if (
      !profile ||
      !["admin", "kepala_sekolah"].includes(profile.role)
    ) {
      return error("Forbidden", 403);
    }

    const { siswa_id, departemen_id, angkatan_id, kelas_id } =
      await req.json();

    if (!siswa_id || !departemen_id || !angkatan_id || !kelas_id) {
      return error(
        "siswa_id, departemen_id, angkatan_id, dan kelas_id diperlukan"
      );
    }

    // 1. Fetch departemen → NPSN
    const { data: dept } = await supabase
      .from("departemen")
      .select("npsn")
      .eq("id", departemen_id)
      .single();

    if (!dept?.npsn) {
      return error("NPSN belum diisi untuk jenjang ini");
    }
    const npsn4 = dept.npsn.slice(-4);

    // 2. Fetch angkatan → nama (tahun)
    const { data: angkatan } = await supabase
      .from("angkatan")
      .select("nama")
      .eq("id", angkatan_id)
      .single();

    if (!angkatan) {
      return error("Angkatan tidak ditemukan", 404);
    }
    const tahunMatch = angkatan.nama.trim().match(/\d{4}/);
    if (!tahunMatch) {
      return error(
        "Format nama angkatan harus mengandung tahun, contoh: 2025 atau 2025/2026"
      );
    }
    const tahun2 = tahunMatch[0].slice(-2);

    // 3. Fetch kelas → nama → kode rombel
    const { data: kelas } = await supabase
      .from("kelas")
      .select("nama")
      .eq("id", kelas_id)
      .single();

    if (!kelas) {
      return error("Kelas tidak ditemukan", 404);
    }
    const rombelCode = extractRombelCode(kelas.nama);
    if (rombelCode === null) {
      return error("Format nama kelas tidak valid");
    }
    const kodeRombel = String(rombelCode);

    // 4. Count existing NIS with same pattern to get next urut
    // Pattern: {npsn4}{3 digit urut}{kodeRombel}{tahun2}
    // We match: npsn4 + ___ + kodeRombel + tahun2
    const likePattern = `${npsn4}___${kodeRombel}${tahun2}`;

    const MAX_RETRIES = 5;
    let generatedNIS = "";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { count } = await supabase
        .from("siswa")
        .select("*", { count: "exact", head: true })
        .like("nis", likePattern);

      const urut = (count || 0) + 1 + attempt;
      const urutStr = String(urut).padStart(3, "0");
      generatedNIS = `${npsn4}${urutStr}${kodeRombel}${tahun2}`;

      // Check uniqueness
      const { count: existCount } = await supabase
        .from("siswa")
        .select("*", { count: "exact", head: true })
        .eq("nis", generatedNIS);

      if ((existCount || 0) === 0) {
        // Unique — update siswa
        const { error: updateErr } = await supabase
          .from("siswa")
          .update({ nis: generatedNIS })
          .eq("id", siswa_id);

        if (updateErr) {
          return error(updateErr.message, 500);
        }

        return new Response(
          JSON.stringify({ success: true, nis: generatedNIS }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
    }

    return error("Gagal generate NIS, coba lagi", 500);
  } catch (err: unknown) {
    console.error("generate-nis error:", err);
    return error("Internal server error", 500);
  }
});
