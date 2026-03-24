import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // GET: return list of active departemen + angkatan
  if (req.method === "GET") {
    const [deptRes, angkatanRes] = await Promise.all([
      supabase.from("departemen").select("id, nama, kode").eq("aktif", true).order("nama"),
      supabase.from("angkatan").select("id, nama, departemen_id").eq("aktif", true).order("nama", { ascending: false }),
    ]);

    if (deptRes.error) {
      return new Response(JSON.stringify({ error: deptRes.error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ departemen: deptRes.data, angkatan: angkatanRes.data || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // POST: register new student
  if (req.method === "POST") {
    try {
      const body = await req.json();

      const nama = (body.nama || "").trim();
      const departemen_id = (body.departemen_id || "").trim();
      const angkatan_id = (body.angkatan_id || "").trim() || null;
      const jenis_pendaftaran = ["baru", "pindahan", "alumni_internal"].includes(body.jenis_pendaftaran)
        ? body.jenis_pendaftaran : "baru";

      if (!nama || nama.length < 2 || nama.length > 200) {
        return new Response(
          JSON.stringify({ error: "Nama lengkap wajib diisi (2-200 karakter)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!departemen_id) {
        return new Response(
          JSON.stringify({ error: "Departemen/lembaga wajib dipilih" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate departemen exists
      const { data: dept } = await supabase
        .from("departemen").select("id").eq("id", departemen_id).eq("aktif", true).single();

      if (!dept) {
        return new Response(
          JSON.stringify({ error: "Departemen tidak valid" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const jk = body.jenis_kelamin === "P" ? "P" : "L";

      // Insert siswa
      const { data: siswa, error: siswaError } = await supabase
        .from("siswa")
        .insert({
          nama,
          jenis_kelamin: jk,
          tempat_lahir: (body.tempat_lahir || "").trim().slice(0, 100) || null,
          tanggal_lahir: body.tanggal_lahir || null,
          alamat: (body.alamat || "").trim().slice(0, 500) || null,
          telepon: (body.telepon || "").trim().slice(0, 20) || null,
          agama: "Islam",
          status: "calon",
          departemen_id,
          angkatan_id,
        })
        .select("id")
        .single();

      if (siswaError) {
        return new Response(
          JSON.stringify({ error: siswaError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert siswa_detail (parent info + pendaftaran info)
      const { error: detailError } = await supabase
        .from("siswa_detail")
        .insert({
          siswa_id: siswa.id,
          nama_ayah: (body.nama_ayah || "").trim().slice(0, 200) || null,
          nama_ibu: (body.nama_ibu || "").trim().slice(0, 200) || null,
          pekerjaan_ayah: (body.pekerjaan_ayah || "").trim().slice(0, 100) || null,
          pekerjaan_ibu: (body.pekerjaan_ibu || "").trim().slice(0, 100) || null,
          telepon_ortu: (body.telepon_ortu || "").trim().slice(0, 20) || null,
          alamat_ortu: (body.alamat_ortu || "").trim().slice(0, 500) || null,
          jenis_pendaftaran,
          asal_sekolah: jenis_pendaftaran !== "baru" ? (body.asal_sekolah || "").trim().slice(0, 200) || null : null,
          kelas_terakhir: jenis_pendaftaran !== "baru" ? (body.kelas_terakhir || "").trim().slice(0, 50) || null : null,
          alasan_pindah: jenis_pendaftaran === "pindahan" ? (body.alasan_pindah || "").trim().slice(0, 500) || null : null,
        });

      if (detailError) {
        await supabase.from("siswa").delete().eq("id", siswa.id);
        return new Response(
          JSON.stringify({ error: detailError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, siswa_id: siswa.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Data tidak valid" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
