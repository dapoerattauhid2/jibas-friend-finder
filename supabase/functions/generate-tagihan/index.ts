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

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

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
    const { tahun_ajaran_id, jenis_id, bulan, bulan_list, departemen_id, siswa_id, kelas_id } = body;

    const bulanArray: (number | null)[] = bulan_list && Array.isArray(bulan_list) && bulan_list.length > 0
      ? bulan_list
      : bulan != null
        ? [bulan]
        : [null];

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

    // Get students based on filters: siswa_id > kelas_id > all in tahun_ajaran
    let kelasSiswaList: { siswa_id: string; kelas_id: string }[] = [];

    if (siswa_id) {
      // Specific student - get their kelas for this tahun_ajaran
      const { data, error } = await adminClient
        .from("kelas_siswa")
        .select("siswa_id, kelas_id")
        .eq("siswa_id", siswa_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id)
        .eq("aktif", true);
      if (error) throw new Error("Gagal mengambil data kelas siswa: " + error.message);
      kelasSiswaList = data || [];
      // If student has no kelas_siswa entry, still generate with null kelas
      if (kelasSiswaList.length === 0) {
        kelasSiswaList = [{ siswa_id, kelas_id: kelas_id || null as any }];
      }
    } else if (kelas_id) {
      // All students in a specific kelas
      const { data, error } = await adminClient
        .from("kelas_siswa")
        .select("siswa_id, kelas_id")
        .eq("kelas_id", kelas_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id)
        .eq("aktif", true);
      if (error) throw new Error("Gagal mengambil data kelas siswa: " + error.message);
      kelasSiswaList = data || [];
    } else {
      // All active students in tahun_ajaran
      const { data, error } = await adminClient
        .from("kelas_siswa")
        .select("siswa_id, kelas_id")
        .eq("aktif", true)
        .eq("tahun_ajaran_id", tahun_ajaran_id);
      if (error) throw new Error("Gagal mengambil data kelas siswa: " + error.message);
      kelasSiswaList = data || [];
    }

    if (kelasSiswaList.length === 0) {
      return new Response(JSON.stringify({ success: true, generated: 0, skipped: 0, message: "Tidak ada siswa yang cocok dengan kriteria" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter by departemen if specified and not already filtered by kelas
    if (departemen_id && !siswa_id && !kelas_id) {
      const kelasIds = [...new Set(kelasSiswaList.map(ks => ks.kelas_id).filter(Boolean))];
      if (kelasIds.length > 0) {
        const { data: kelasData } = await adminClient
          .from("kelas")
          .select("id")
          .eq("departemen_id", departemen_id)
          .in("id", kelasIds);
        const validKelasIds = new Set((kelasData || []).map(k => k.id));
        kelasSiswaList = kelasSiswaList.filter(ks => validKelasIds.has(ks.kelas_id));
      }
    }

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const tanggalHariIni = new Date().toISOString().split("T")[0];
    const tahunSekarang = new Date().getFullYear();

    for (const currentBulan of bulanArray) {
      let existingQuery = adminClient
        .from("tagihan")
        .select("siswa_id")
        .eq("jenis_id", jenis_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id);

      if (currentBulan != null) {
        existingQuery = existingQuery.eq("bulan", currentBulan);
      } else {
        existingQuery = existingQuery.is("bulan", null);
      }

      const { data: existingTagihan } = await existingQuery;
      const existingSet = new Set((existingTagihan || []).map((t) => t.siswa_id));

      const toGenerate = kelasSiswaList.filter((ks) => !existingSet.has(ks.siswa_id));
      skipped += kelasSiswaList.length - toGenerate.length;
      if (toGenerate.length === 0) continue;

      for (const ks of toGenerate) {
        try {
          const { data: nominal } = await adminClient.rpc("get_tarif_siswa", {
            p_jenis_id: jenis_id,
            p_siswa_id: ks.siswa_id,
            p_kelas_id: ks.kelas_id,
            p_tahun_ajaran_id: tahun_ajaran_id,
          });

          const tarifNominal = Number(nominal) || Number(jenis.nominal) || 0;
          if (tarifNominal <= 0) continue;

          const bulanLabel = currentBulan ? `-B${currentBulan}` : "";
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
            errors.push(`Jurnal gagal untuk siswa ${ks.siswa_id} bulan ${currentBulan}`);
            continue;
          }

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

          const { error: tagErr } = await adminClient.from("tagihan").insert({
            siswa_id: ks.siswa_id,
            jenis_id: jenis_id,
            tahun_ajaran_id: tahun_ajaran_id,
            kelas_id: ks.kelas_id,
            bulan: currentBulan || null,
            nominal: tarifNominal,
            status: "belum_bayar",
            jurnal_piutang_id: jurnal.id,
            created_by: user.id,
          });

          if (tagErr) {
            if (tagErr.code === "23505") { skipped++; continue; }
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
      skipped,
      total_siswa: kelasSiswaList.length,
      bulan_count: bulanArray.filter((b) => b !== null).length || 1,
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
