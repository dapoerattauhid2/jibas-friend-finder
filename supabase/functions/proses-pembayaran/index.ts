/**
 * Edge Function: proses-pembayaran
 *
 * Menangani seluruh alur pembayaran siswa dalam SATU transaksi atomik:
 *   1. Validasi input & periode
 *   2. Ambil tarif dari DB (tidak percaya nominal dari frontend)
 *   3. Insert pembayaran
 *   4. Generate nomor jurnal
 *   5. Insert jurnal header + detail (debit/kredit)
 *   6. Link jurnal_id ke pembayaran
 *   7. Insert pendapatan_dimuka (jika bayar di muka)
 *   8. Update tagihan → lunas (jika ada piutang)
 *
 * Seluruh langkah 3-8 dibungkus dalam PostgreSQL transaction via RPC,
 * sehingga jika satu langkah gagal, semua di-rollback otomatis.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
    "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ProsesPembayaranRequest {
  siswa_id: string;
  jenis_id: string;
  bulan: number;           // 0 = sekali bayar, 1-12 = bulanan
  jumlah: number;          // nominal dari frontend (akan divalidasi ulang)
  tanggal_bayar: string;   // "yyyy-MM-dd"
  keterangan?: string;
  departemen_id?: string;
  tahun_ajaran_id: string;
  is_bayar_dimuka: boolean;
  tagihan_id?: string;     // id tagihan existing (piutang) bila ada
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized: missing auth header");

    const supabaseUrl   = Deno.env.get("SUPABASE_URL")!;
    const anonKey       = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized: invalid token");

    const admin = createClient(supabaseUrl, serviceKey);

    // Cek role
    const { data: profile } = await admin
      .from("users_profile")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || !["admin", "kepala_sekolah", "keuangan"].includes(profile.role)) {
      throw new Error("Forbidden: hanya admin/keuangan yang bisa memproses pembayaran");
    }

    // ── Parse & validasi input ───────────────────────────────────────────────
    const body: ProsesPembayaranRequest = await req.json();
    const {
      siswa_id, jenis_id, bulan, tanggal_bayar,
      keterangan, departemen_id, tahun_ajaran_id, is_bayar_dimuka, tagihan_id,
    } = body;

    if (!siswa_id || !jenis_id || !tanggal_bayar || !tahun_ajaran_id) {
      throw new Error("Field wajib tidak lengkap: siswa_id, jenis_id, tanggal_bayar, tahun_ajaran_id");
    }

    // ── Validasi periode tidak ditutup ───────────────────────────────────────
    const { data: periodeData } = await admin
      .from("tahun_ajaran")
      .select("id, nama, ditutup")
      .lte("tanggal_mulai", tanggal_bayar)
      .gte("tanggal_selesai", tanggal_bayar)
      .limit(1);
    const periodeLocked = (periodeData || []).find((p) => p.ditutup === true);
    if (periodeLocked) {
      throw new Error(`Transaksi ditolak: periode "${periodeLocked.nama}" sudah ditutup buku`);
    }

    // ── Ambil jenis pembayaran ───────────────────────────────────────────────
    const { data: jenis, error: jenisErr } = await admin
      .from("jenis_pembayaran")
      .select("id, nama, tipe, akun_pendapatan_id")
      .eq("id", jenis_id)
      .single();
    if (jenisErr || !jenis) throw new Error("Jenis pembayaran tidak ditemukan");
    const isSekali = jenis.tipe === "sekali";

    // ── Ambil tarif dari DB — JANGAN pakai nominal dari frontend ────────────
    const { data: kelasRow } = await admin
      .from("kelas_siswa")
      .select("kelas_id")
      .eq("siswa_id", siswa_id)
      .eq("aktif", true)
      .maybeSingle();

    const { data: tarifNominalRaw, error: tarifErr } = await admin.rpc("get_tarif_siswa", {
      p_jenis_id:       jenis_id,
      p_siswa_id:       siswa_id,
      p_kelas_id:       kelasRow?.kelas_id ?? null,
      p_tahun_ajaran_id: tahun_ajaran_id,
    });
    if (tarifErr) throw new Error("Gagal mengambil tarif: " + tarifErr.message);

    const jumlahValid = Number(tarifNominalRaw);
    if (!jumlahValid || jumlahValid <= 0) {
      throw new Error("Tarif pembayaran belum dikonfigurasi untuk siswa ini");
    }

    // ── Cek duplikasi pembayaran ─────────────────────────────────────────────
    if (isSekali) {
      // Untuk tipe sekali: cek total sudah lunas belum
      const { data: existingPay } = await admin
        .from("pembayaran")
        .select("jumlah")
        .eq("siswa_id", siswa_id)
        .eq("jenis_id", jenis_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id);
      const totalSudahBayar = (existingPay || []).reduce((s, r) => s + Number(r.jumlah || 0), 0);
      if (totalSudahBayar >= jumlahValid) {
        throw new Error("Pembayaran ini sudah lunas");
      }
    } else {
      const { data: dupCheck } = await admin
        .from("pembayaran")
        .select("id")
        .eq("siswa_id", siswa_id)
        .eq("jenis_id", jenis_id)
        .eq("bulan", bulan)
        .eq("tahun_ajaran_id", tahun_ajaran_id)
        .maybeSingle();
      if (dupCheck) throw new Error(`Pembayaran bulan ${bulan} untuk jenis ini sudah ada`);
    }

    // ── Ambil konfigurasi akun ───────────────────────────────────────────────
    const { data: pengaturanList } = await admin
      .from("pengaturan_akun")
      .select("kode_setting, akun_id")
      .in("kode_setting", ["kas_tunai", "piutang_siswa", "AKUN_PENDAPATAN_DIMUKA"]);

    const getAkun = (kode: string) =>
      pengaturanList?.find((p) => p.kode_setting === kode)?.akun_id ?? null;

    const kasAkunId      = getAkun("kas_tunai");
    const piutangAkunId  = getAkun("piutang_siswa");
    const dimukaAkunId   = getAkun("AKUN_PENDAPATAN_DIMUKA");

    if (!kasAkunId) throw new Error("Akun Kas Tunai belum dikonfigurasi di Pengaturan Akun");

    // Tentukan akun kredit
    let kreditAkunId: string | null;
    let kreditLabel: string;

    if (is_bayar_dimuka) {
      if (!dimukaAkunId) throw new Error("Akun Pendapatan Diterima di Muka belum dikonfigurasi");
      kreditAkunId = dimukaAkunId;
      kreditLabel  = "Pendapatan Diterima di Muka";
    } else if (tagihan_id && piutangAkunId) {
      kreditAkunId = piutangAkunId;
      kreditLabel  = "Piutang Siswa";
    } else {
      kreditAkunId = jenis.akun_pendapatan_id;
      kreditLabel  = `Pendapatan ${jenis.nama}`;
    }
    if (!kreditAkunId) throw new Error("Akun kredit belum dikonfigurasi");

    // ── Mulai proses atomik ──────────────────────────────────────────────────
    // Karena Supabase JS tidak support BEGIN/COMMIT langsung,
    // kita gunakan RPC `proses_pembayaran_atomik` yang dibungkus transaction di PostgreSQL.
    // Lihat file: supabase/migrations/..._proses_pembayaran_atomik.sql

    const { data: result, error: rpcErr } = await admin.rpc(
      "proses_pembayaran_atomik",
      {
        p_siswa_id:          siswa_id,
        p_jenis_id:          jenis_id,
        p_bulan:             isSekali ? 0 : bulan,
        p_jumlah:            jumlahValid,
        p_tanggal_bayar:     tanggal_bayar,
        p_keterangan:        keterangan ?? null,
        p_departemen_id:     departemen_id ?? null,
        p_tahun_ajaran_id:   tahun_ajaran_id,
        p_is_bayar_dimuka:   is_bayar_dimuka,
        p_tagihan_id:        tagihan_id ?? null,
        p_kas_akun_id:       kasAkunId,
        p_kredit_akun_id:    kreditAkunId,
        p_kredit_label:      kreditLabel,
        p_prefix_jurnal:     is_bayar_dimuka ? "JD" : "JP",
        p_petugas_id:        user.id,
        p_jenis_nama:        jenis.nama,
      }
    );

    if (rpcErr) throw new Error("Gagal memproses pembayaran: " + rpcErr.message);

    return new Response(
      JSON.stringify({
        success: true,
        pembayaran_id: result.pembayaran_id,
        jurnal_id:     result.jurnal_id,
        nomor_jurnal:  result.nomor_jurnal,
        jumlah:        jumlahValid,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err: any) {
    console.error("proses-pembayaran error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: err.message.startsWith("Unauthorized") ? 401
              : err.message.startsWith("Forbidden")    ? 403
              : 400,
      }
    );
  }
});
