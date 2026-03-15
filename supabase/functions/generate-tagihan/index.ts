import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with anon client
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Check role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await adminClient
      .from("users_profile")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "kepala_sekolah", "keuangan"].includes(profile.role)) {
      throw new Error("Forbidden: hanya admin/keuangan yang bisa generate tagihan");
    }

    const body = await req.json();
    const { tahun_ajaran_id, jenis_id, bulan, departemen_id } = body;

    if (!tahun_ajaran_id || !jenis_id) {
      throw new Error("tahun_ajaran_id dan jenis_id wajib diisi");
    }

    // Get jenis pembayaran info
    const { data: jenis, error: jenisErr } = await adminClient
      .from("jenis_pembayaran")
      .select("id, nama, nominal, tipe, akun_pendapatan_id")
      .eq("id", jenis_id)
      .single();
    if (jenisErr || !jenis) throw new Error("Jenis pembayaran tidak ditemukan");

    // Get piutang account
    const { data: pengaturan } = await adminClient
      .from("pengaturan_akun")
      .select("kode_setting, akun_id")
      .in("kode_setting", ["piutang_siswa"]);
    const piutangAkunId = pengaturan?.find((p) => p.kode_setting === "piutang_siswa")?.akun_id;

    if (!piutangAkunId) {
      throw new Error("Akun piutang siswa belum dikonfigurasi di Pengaturan Akun");
    }
    if (!jenis.akun_pendapatan_id) {
      throw new Error(`Akun pendapatan belum diset untuk jenis "${jenis.nama}"`);
    }

    // Get all active students with their classes
    let siswaQuery = adminClient
      .from("kelas_siswa")
      .select("siswa_id, kelas_id, siswa:siswa_id(id, nama, status)")
      .eq("aktif", true)
      .eq("tahun_ajaran_id", tahun_ajaran_id);

    if (departemen_id) {
      siswaQuery = siswaQuery.eq("kelas:kelas_id(departemen_id)", departemen_id);
    }

    // Use a simpler approach: get all kelas_siswa, then filter
    const { data: kelasSiswaList, error: ksErr } = await adminClient
      .from("kelas_siswa")
      .select("siswa_id, kelas_id")
      .eq("aktif", true)
      .eq("tahun_ajaran_id", tahun_ajaran_id);

    if (ksErr) throw new Error("Gagal mengambil data kelas siswa: " + ksErr.message);
    if (!kelasSiswaList || kelasSiswaList.length === 0) {
      return new Response(JSON.stringify({ success: true, generated: 0, skipped: 0, message: "Tidak ada siswa aktif di tahun ajaran ini" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing tagihan to avoid duplicates
    let existingQuery = adminClient
      .from("tagihan")
      .select("siswa_id")
      .eq("jenis_id", jenis_id)
      .eq("tahun_ajaran_id", tahun_ajaran_id);

    if (bulan != null) {
      existingQuery = existingQuery.eq("bulan", bulan);
    } else {
      existingQuery = existingQuery.is("bulan", null);
    }

    const { data: existingTagihan } = await existingQuery;
    const existingSet = new Set((existingTagihan || []).map((t) => t.siswa_id));

    // Filter out already-existing
    const toGenerate = kelasSiswaList.filter((ks) => !existingSet.has(ks.siswa_id));

    if (toGenerate.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        generated: 0,
        skipped: kelasSiswaList.length,
        message: "Semua tagihan sudah di-generate sebelumnya",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tarif for each student using the DB function
    let generated = 0;
    const errors: string[] = [];
    const tanggalHariIni = new Date().toISOString().split("T")[0];
    const tahunSekarang = new Date().getFullYear();

    // Process in batches of 50
    const batchSize = 50;
    for (let i = 0; i < toGenerate.length; i += batchSize) {
      const batch = toGenerate.slice(i, i + batchSize);

      for (const ks of batch) {
        try {
          // Get tarif for this student
          const { data: nominal } = await adminClient.rpc("get_tarif_siswa", {
            p_jenis_id: jenis_id,
            p_siswa_id: ks.siswa_id,
            p_kelas_id: ks.kelas_id,
            p_tahun_ajaran_id: tahun_ajaran_id,
          });

          const tarifNominal = Number(nominal) || Number(jenis.nominal) || 0;
          if (tarifNominal <= 0) continue;

          // Create piutang journal
          const bulanLabel = bulan ? `-B${bulan}` : "";
          const { data: nomorJurnal } = await adminClient.rpc("generate_nomor_jurnal", {
            p_prefix: "JPI",
            p_tahun: tahunSekarang,
          });

          const { data: jurnal, error: jErr } = await adminClient
            .from("jurnal")
            .insert({
              nomor: nomorJurnal,
              tanggal: tanggalHariIni,
              keterangan: `Piutang ${jenis.nama}${bulanLabel} - siswa ${ks.siswa_id}`,
              departemen_id: departemen_id || null,
              total_debit: tarifNominal,
              total_kredit: tarifNominal,
              status: "posted",
            })
            .select("id")
            .single();

          if (jErr || !jurnal) {
            errors.push(`Jurnal gagal untuk siswa ${ks.siswa_id}`);
            continue;
          }

          // Journal details: Debit Piutang | Credit Pendapatan
          await adminClient.from("jurnal_detail").insert([
            {
              jurnal_id: jurnal.id,
              akun_id: piutangAkunId,
              keterangan: `Piutang ${jenis.nama}`,
              debit: tarifNominal,
              kredit: 0,
              urutan: 1,
            },
            {
              jurnal_id: jurnal.id,
              akun_id: jenis.akun_pendapatan_id,
              keterangan: `Pendapatan ${jenis.nama}`,
              debit: 0,
              kredit: tarifNominal,
              urutan: 2,
            },
          ]);

          // Create tagihan record
          const { error: tagErr } = await adminClient.from("tagihan").insert({
            siswa_id: ks.siswa_id,
            jenis_id: jenis_id,
            tahun_ajaran_id: tahun_ajaran_id,
            kelas_id: ks.kelas_id,
            bulan: bulan || null,
            nominal: tarifNominal,
            status: "belum_bayar",
            jurnal_piutang_id: jurnal.id,
            created_by: user.id,
          });

          if (tagErr) {
            // Unique constraint violation = already exists, skip
            if (tagErr.code === "23505") continue;
            errors.push(`Tagihan gagal untuk siswa ${ks.siswa_id}: ${tagErr.message}`);
            continue;
          }

          generated++;
        } catch (err: any) {
          errors.push(`Error siswa ${ks.siswa_id}: ${err.message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      generated,
      skipped: existingSet.size,
      total_siswa: kelasSiswaList.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
