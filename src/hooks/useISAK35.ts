import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SaldoAkun {
  akun_id: string;
  kode: string;
  nama: string;
  pos_isak35: string;
  saldo_normal: string;
  urutan_isak35: number;
  saldo: number;
}

async function hitungSaldoAkun(tahun: number, departemenId?: string): Promise<SaldoAkun[]> {
  const { data: akunList, error: akunErr } = await supabase
    .from("akun_rekening")
    .select("id, kode, nama, pos_isak35, saldo_normal, urutan_isak35, saldo_awal")
    .not("pos_isak35", "is", null)
    .eq("aktif", true)
    .order("urutan_isak35");
  if (akunErr) throw akunErr;

  let q = supabase
    .from("jurnal_detail")
    .select("akun_id, debit, kredit, jurnal!inner(tanggal, status, departemen_id)")
    .eq("jurnal.status", "posted")
    .gte("jurnal.tanggal", `${tahun}-01-01`)
    .lte("jurnal.tanggal", `${tahun}-12-31`);
  if (departemenId) q = (q as any).eq("jurnal.departemen_id", departemenId);
  const { data: details, error: detErr } = await q;
  if (detErr) throw detErr;

  const mutasi: Record<string, { debit: number; kredit: number }> = {};
  for (const d of (details as any[]) || []) {
    if (!mutasi[d.akun_id]) mutasi[d.akun_id] = { debit: 0, kredit: 0 };
    mutasi[d.akun_id].debit += Number(d.debit || 0);
    mutasi[d.akun_id].kredit += Number(d.kredit || 0);
  }

  const saldoAwalQuery = supabase
    .from("saldo_awal_isak35" as any)
    .select("akun_id, saldo")
    .eq("tahun", tahun);
  if (departemenId) saldoAwalQuery.eq("departemen_id", departemenId);
  const { data: saldoAwalData } = await saldoAwalQuery;
  const saldoAwalMap: Record<string, number> = {};
  for (const s of (saldoAwalData as any[]) || []) saldoAwalMap[s.akun_id] = Number(s.saldo || 0);

  return (akunList || []).map((akun: any) => {
    const m = mutasi[akun.id] || { debit: 0, kredit: 0 };
    const saldoAwal = saldoAwalMap[akun.id] ?? Number(akun.saldo_awal || 0);
    const saldo = akun.saldo_normal === "D"
      ? saldoAwal + m.debit - m.kredit
      : saldoAwal + m.kredit - m.debit;
    return { akun_id: akun.id, kode: akun.kode, nama: akun.nama, pos_isak35: akun.pos_isak35, saldo_normal: akun.saldo_normal, urutan_isak35: akun.urutan_isak35, saldo };
  });
}

function depresiasiSatuAset(harga: number, umurBulan: number, tglPerolehan: string, tahun: number) {
  const bpb = harga / umurBulan;
  const tgl = new Date(tglPerolehan);
  const mulai = tgl.getFullYear() * 12 + tgl.getMonth();
  let bebanTahunIni = 0, akumulasi = 0;
  for (let i = 0; i < umurBulan; i++) {
    const bulanKe = mulai + i;
    const thn = Math.floor(bulanKe / 12);
    if (thn <= tahun) akumulasi += bpb;
    if (thn === tahun) bebanTahunIni += bpb;
  }
  return { bebanTahunIni, akumulasi, nilaiBuku: harga - akumulasi };
}

async function totalDepresiasi(tahun: number, departemenId?: string) {
  let q = supabase.from("aset_tetap" as any).select("*").eq("aktif", true);
  if (departemenId) q = q.eq("departemen_id", departemenId);
  const { data, error } = await q;
  if (error) throw error;
  let totalHP = 0, totalBeban = 0, totalAkum = 0, totalNB = 0;
  for (const a of (data as any[]) || []) {
    totalHP += Number(a.harga_perolehan);
    const r = depresiasiSatuAset(Number(a.harga_perolehan), a.umur_ekonomis_bulan, a.tanggal_perolehan, tahun);
    totalBeban += r.bebanTahunIni; totalAkum += r.akumulasi; totalNB += r.nilaiBuku;
  }
  return { totalHP, totalBeban, totalAkum, totalNB };
}

// ============================================================
// Akun yang di-EXCLUDE dari laporan ISAK 35
// - 5824: Hibah Antar Lembaga → transfer internal, bukan beban operasional
// - 1901: Rekening Antar Lembaga → rekening internal, bukan aset riil
// - 1902: Rekening Antar Bagian  → rekening internal, bukan aset riil
// ============================================================
const EXCLUDE_BEBAN_TRANSFER = ["5824"];          // exclude dari beban
const EXCLUDE_ASET_INTERNAL  = ["1901", "1902"];  // exclude dari aset tidak lancar

// Helper: filter accounts by pos_isak35 and only include those with non-zero saldo
function byPos(saldo: SaldoAkun[], ...positions: string[]) {
  return saldo.filter(a => positions.includes(a.pos_isak35));
}

function sumSaldo(items: SaldoAkun[]) {
  return items.reduce((s, a) => s + a.saldo, 0);
}

// ============================================================
// Identifikasi akun KAS & SETARA KAS (untuk metode langsung)
// Akun kas/bank di CoA: kode 1101–1213 dengan nama berawalan KAS / BANK
// pos_isak35 = aset_lancar
// ============================================================
function isAkunKas(kode: string, nama: string): boolean {
  const n = (nama || "").toUpperCase().trim();
  return n.startsWith("KAS ") || n === "KAS" || n.startsWith("BANK ") || n === "BANK";
}

interface AkunMeta { id: string; kode: string; nama: string; pos_isak35: string | null; jenis: string }

async function getAkunMeta(): Promise<Record<string, AkunMeta>> {
  const { data } = await supabase
    .from("akun_rekening")
    .select("id, kode, nama, pos_isak35, jenis")
    .eq("aktif", true);
  const map: Record<string, AkunMeta> = {};
  for (const a of (data as any[]) || []) map[a.id] = a;
  return map;
}

export function useLaporanKomprehensif(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_komprehensif", tahun, departemenId],
    queryFn: async () => {
      const [saldo, dep] = await Promise.all([hitungSaldoAkun(tahun, departemenId), totalDepresiasi(tahun, departemenId)]);

      // Pendapatan tanpa pembatasan
      const pendapatan = byPos(saldo, "pendapatan_tidak_terikat");
      const totalPendapatan = sumSaldo(pendapatan);

      // Beban (program + penunjang) + tambah beban depresiasi sebagai item virtual
      // Exclude akun transfer internal (Hibah Antar Lembaga dll) — bukan beban operasional ISAK35
      const bebanAkun = byPos(saldo, "beban_program", "beban_penunjang")
        .filter(a => !EXCLUDE_BEBAN_TRANSFER.includes(a.kode));
      const bebanDepresiasiItem: SaldoAkun | null = dep.totalBeban > 0 ? {
        akun_id: "__depresiasi__",
        kode: "DEP",
        nama: "Beban Depresiasi Aset Tetap",
        pos_isak35: "beban_penunjang",
        saldo_normal: "D",
        urutan_isak35: 9999,
        saldo: dep.totalBeban,
      } : null;
      const beban = bebanDepresiasiItem ? [...bebanAkun, bebanDepresiasiItem] : bebanAkun;
      const totalBeban = sumSaldo(beban);

      const surplusDefisit = totalPendapatan - totalBeban;

      // Pendapatan dengan pembatasan (terikat temporer + permanen)
      const pendapatanTerbatas = byPos(saldo, "pendapatan_terikat_temporer", "pendapatan_terikat_permanen");
      const totalPT = sumSaldo(pendapatanTerbatas);

      // Beban terbatas (if any accounts mapped)
      const bebanTerbatas = byPos(saldo, "beban_terbatas");
      const totalBT = sumSaldo(bebanTerbatas);

      const surplusTerbatas = totalPT - totalBT;

      // Penghasilan Komprehensif Lain
      const pklItems = byPos(saldo, "pkl");
      const pkl = sumSaldo(pklItems);

      return {
        pendapatan, totalPendapatan,
        beban, totalBeban,
        surplusDefisit,
        pendapatanTerbatas, totalPT,
        bebanTerbatas, totalBT,
        surplusTerbatas,
        pkl,
        totalKomprehensif: surplusDefisit + surplusTerbatas + pkl,
        dep,
      };
    },
  });
}

export function useLaporanPosisiKeuangan(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_posisi", tahun, departemenId],
    queryFn: async () => {
      const [saldo, dep] = await Promise.all([hitungSaldoAkun(tahun, departemenId), totalDepresiasi(tahun, departemenId)]);

      // Aset Lancar - all accounts with pos_isak35 = 'aset_lancar'
      const asetLancarItems = byPos(saldo, "aset_lancar");
      const totalAL = sumSaldo(asetLancarItems);

      // Aset Tidak Lancar - exclude rekening antar lembaga/bagian (akun internal)
      const asetTidakLancarItems = byPos(saldo, "aset_tidak_lancar")
        .filter(a => !EXCLUDE_ASET_INTERNAL.includes(a.kode));
      const totalATL = sumSaldo(asetTidakLancarItems);

      const totalAset = totalAL + totalATL;

      // Liabilitas Jangka Pendek
      const liabJPItems = byPos(saldo, "kewajiban_jangka_pendek");
      const totalLJP = sumSaldo(liabJPItems);

      // Liabilitas Jangka Panjang
      const liabJGItems = byPos(saldo, "kewajiban_jangka_panjang");
      const totalLJG = sumSaldo(liabJGItems);

      const totalLiabilitas = totalLJP + totalLJG;

      // Aset Neto - SALDO AKTUAL dari akun ekuitas (sumber kebenaran ISAK 35)
      const asetNetoItems = byPos(saldo, "aset_neto_tidak_terikat", "aset_neto_terikat_temporer", "aset_neto_terikat_permanen");
      const totalAsetNetoSaldo = sumSaldo(asetNetoItems);

      // Surplus/Defisit periode berjalan (belum di-tutup-buku-kan ke ekuitas)
      const pendapatanTT = sumSaldo(byPos(saldo, "pendapatan_tidak_terikat"));
      const bebanTT = sumSaldo(
        byPos(saldo, "beban_program", "beban_penunjang")
          .filter(a => !EXCLUDE_BEBAN_TRANSFER.includes(a.kode))
      ) + dep.totalBeban;
      const surplusBerjalan = pendapatanTT - bebanTT;

      const pendapatanTerbatas = sumSaldo(byPos(saldo, "pendapatan_terikat_temporer", "pendapatan_terikat_permanen"));
      const bebanTerbatas = sumSaldo(byPos(saldo, "beban_terbatas"));
      const surplusTerbatasBerjalan = pendapatanTerbatas - bebanTerbatas;

      // Total aset neto = saldo akun + surplus periode berjalan
      const totalAsetNeto = totalAsetNetoSaldo + surplusBerjalan + surplusTerbatasBerjalan;

      // Selisih neraca (harus 0 jika jurnal seimbang)
      const selisih = totalAset - totalLiabilitas - totalAsetNeto;

      return {
        asetLancarItems, totalAL,
        asetTidakLancarItems, totalATL,
        totalAset,
        liabJPItems, totalLJP,
        liabJGItems, totalLJG,
        totalLiabilitas,
        asetNetoItems, totalAsetNetoSaldo,
        surplusBerjalan, surplusTerbatasBerjalan,
        totalAsetNeto,
        selisih,
        dep,
      };
    },
  });
}

// ============================================================
// LAPORAN ARUS KAS — METODE LANGSUNG (ISAK 35)
// - Penerimaan & pengeluaran kas dirinci dari jurnal_detail akun kas
// - Klasifikasi operasi/investasi/pendanaan berdasarkan akun lawan
// - Kas awal diambil dari saldo_awal_isak35 (atau saldo_awal akun)
// ============================================================
export function useLaporanArusKas(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_arus_kas_direct", tahun, departemenId],
    queryFn: async () => {
      const akunMeta = await getAkunMeta();

      // Identifikasi akun kas & setara kas
      const akunKasIds = new Set<string>();
      for (const a of Object.values(akunMeta)) {
        if (a.pos_isak35 === "aset_lancar" && isAkunKas(a.kode, a.nama)) {
          akunKasIds.add(a.id);
        }
      }

      // Saldo awal kas — dari saldo_awal_isak35 untuk tahun ini (atau saldo_awal akun)
      const saldoAwalQ = supabase
        .from("saldo_awal_isak35" as any)
        .select("akun_id, saldo")
        .eq("tahun", tahun);
      if (departemenId) saldoAwalQ.eq("departemen_id", departemenId);
      const { data: saldoAwalRows } = await saldoAwalQ;
      const saldoAwalMap: Record<string, number> = {};
      for (const r of (saldoAwalRows as any[]) || []) saldoAwalMap[r.akun_id] = Number(r.saldo || 0);

      // Saldo akun fallback
      const { data: akunSaldoAwal } = await supabase
        .from("akun_rekening")
        .select("id, saldo_awal")
        .in("id", Array.from(akunKasIds).length > 0 ? Array.from(akunKasIds) : ["00000000-0000-0000-0000-000000000000"]);
      let kasAwal = 0;
      for (const a of (akunSaldoAwal as any[]) || []) {
        kasAwal += saldoAwalMap[a.id] ?? Number(a.saldo_awal || 0);
      }

      // Ambil semua jurnal posted di tahun terkait yang menyentuh akun kas
      let jq = supabase
        .from("jurnal")
        .select("id")
        .eq("status", "posted")
        .gte("tanggal", `${tahun}-01-01`)
        .lte("tanggal", `${tahun}-12-31`);
      if (departemenId) jq = jq.eq("departemen_id", departemenId);
      const { data: jurnalRows } = await jq;
      const jurnalIds = (jurnalRows || []).map((j: any) => j.id);

      let allDetails: any[] = [];
      if (jurnalIds.length > 0) {
        // Batch IN to avoid url length limit
        const batchSize = 500;
        for (let i = 0; i < jurnalIds.length; i += batchSize) {
          const batch = jurnalIds.slice(i, i + batchSize);
          const { data } = await supabase
            .from("jurnal_detail")
            .select("jurnal_id, akun_id, debit, kredit")
            .in("jurnal_id", batch);
          allDetails.push(...((data as any[]) || []));
        }
      }

      // Kelompokkan detail per jurnal
      const perJurnal: Record<string, any[]> = {};
      for (const d of allDetails) {
        if (!perJurnal[d.jurnal_id]) perJurnal[d.jurnal_id] = [];
        perJurnal[d.jurnal_id].push(d);
      }

      // Akumulator per kategori (operasi/investasi/pendanaan)
      // Penerimaan: kas debit (uang masuk). Pengeluaran: kas kredit (uang keluar).
      const acc = {
        operasiPenerimaan: 0,
        operasiPengeluaran: 0,
        investasiPenerimaan: 0,
        investasiPengeluaran: 0,
        pendanaanPenerimaan: 0,
        pendanaanPengeluaran: 0,
        // Detail penerimaan operasi per pos sumber
        rincianPenerimaanOperasi: {} as Record<string, number>,
        rincianPengeluaranOperasi: {} as Record<string, number>,
      };

      const klasifikasiByLawan = (lawanPos: string | null | undefined): "operasi" | "investasi" | "pendanaan" => {
        if (lawanPos === "aset_tidak_lancar") return "investasi";
        if (lawanPos === "kewajiban_jangka_panjang") return "pendanaan";
        if (lawanPos === "aset_neto_tidak_terikat" || lawanPos === "aset_neto_terikat_temporer" || lawanPos === "aset_neto_terikat_permanen") return "pendanaan";
        return "operasi";
      };

      const namaPos = (pos: string | null | undefined, fallbackNama: string): string => {
        switch (pos) {
          case "pendapatan_tidak_terikat": return "Penerimaan Kas dari Donasi/Sumbangan & Jasa Pendidikan";
          case "pendapatan_terikat_temporer": return "Penerimaan Kas dari Sumbangan Terikat Temporer";
          case "pendapatan_terikat_permanen": return "Penerimaan Kas dari Sumbangan Terikat Permanen";
          case "beban_program": return "Pembayaran Kas untuk Beban Program";
          case "beban_penunjang": return "Pembayaran Kas untuk Beban Penunjang";
          case "kewajiban_jangka_pendek": return "Pembayaran/Penerimaan Liabilitas Jangka Pendek";
          default: return fallbackNama;
        }
      };

      for (const jId of Object.keys(perJurnal)) {
        const rows = perJurnal[jId];
        const sisiKas = rows.filter(r => akunKasIds.has(r.akun_id));
        if (sisiKas.length === 0) continue;
        const sisiLawan = rows.filter(r => !akunKasIds.has(r.akun_id));

        const totalKasDebit = sisiKas.reduce((s, r) => s + Number(r.debit || 0), 0);
        const totalKasKredit = sisiKas.reduce((s, r) => s + Number(r.kredit || 0), 0);
        const totalLawanDebit = sisiLawan.reduce((s, r) => s + Number(r.debit || 0), 0);
        const totalLawanKredit = sisiLawan.reduce((s, r) => s + Number(r.kredit || 0), 0);

        // Net kas: positif = penerimaan, negatif = pengeluaran
        const netKas = totalKasDebit - totalKasKredit;
        if (netKas === 0) continue;

        // Distribusi proporsional terhadap akun lawan
        const isPenerimaan = netKas > 0;
        const totalLawanRelevan = isPenerimaan ? totalLawanKredit : totalLawanDebit;
        const absKas = Math.abs(netKas);

        for (const lr of sisiLawan) {
          const meta = akunMeta[lr.akun_id];
          // Skip akun transfer internal (rekening antara & hibah antar lembaga)
          if (meta?.kode && (EXCLUDE_BEBAN_TRANSFER.includes(meta.kode) || EXCLUDE_ASET_INTERNAL.includes(meta.kode))) continue;
          const pos = meta?.pos_isak35 ?? null;
          const nilaiLawan = isPenerimaan ? Number(lr.kredit || 0) : Number(lr.debit || 0);
          if (nilaiLawan === 0) continue;
          const porsi = totalLawanRelevan > 0 ? (nilaiLawan / totalLawanRelevan) * absKas : 0;
          const cat = klasifikasiByLawan(pos);
          if (isPenerimaan) {
            if (cat === "operasi") acc.operasiPenerimaan += porsi;
            else if (cat === "investasi") acc.investasiPenerimaan += porsi;
            else acc.pendanaanPenerimaan += porsi;
            if (cat === "operasi") {
              const key = namaPos(pos, meta?.nama || "Penerimaan Lain");
              acc.rincianPenerimaanOperasi[key] = (acc.rincianPenerimaanOperasi[key] || 0) + porsi;
            }
          } else {
            if (cat === "operasi") acc.operasiPengeluaran += porsi;
            else if (cat === "investasi") acc.investasiPengeluaran += porsi;
            else acc.pendanaanPengeluaran += porsi;
            if (cat === "operasi") {
              const key = namaPos(pos, meta?.nama || "Pengeluaran Lain");
              acc.rincianPengeluaranOperasi[key] = (acc.rincianPengeluaranOperasi[key] || 0) + porsi;
            }
          }
        }
      }

      const arusOperasi = acc.operasiPenerimaan - acc.operasiPengeluaran;
      const arusInvestasi = acc.investasiPenerimaan - acc.investasiPengeluaran;
      const arusPendanaan = acc.pendanaanPenerimaan - acc.pendanaanPengeluaran;
      const kenaikanKas = arusOperasi + arusInvestasi + arusPendanaan;

      return {
        // Untuk komponen lama (kompatibel)
        penerimaanOperasi: acc.operasiPenerimaan,
        pengeluaranOperasi: acc.operasiPengeluaran,
        arusOperasi,
        arusInvestasi,
        arusPendanaan,
        kenaikanKas,
        kasAwal,
        kasAkhir: kasAwal + kenaikanKas,
        // Detail metode langsung
        rincianPenerimaanOperasi: acc.rincianPenerimaanOperasi,
        rincianPengeluaranOperasi: acc.rincianPengeluaranOperasi,
        investasiPenerimaan: acc.investasiPenerimaan,
        investasiPengeluaran: acc.investasiPengeluaran,
        pendanaanPenerimaan: acc.pendanaanPenerimaan,
        pendanaanPengeluaran: acc.pendanaanPengeluaran,
      };
    },
  });
}

export function useAsetTetapList(departemenId?: string) {
  return useQuery({
    queryKey: ["aset_tetap", departemenId],
    queryFn: async () => {
      let q = supabase.from("aset_tetap" as any).select("*").eq("aktif", true).order("tanggal_perolehan");
      if (departemenId) q = q.eq("departemen_id", departemenId);
      const { data, error } = await q;
      if (error) throw error;
      const tahun = new Date().getFullYear();
      return ((data as any[]) || []).map((a: any) => ({ ...a, ...depresiasiSatuAset(Number(a.harga_perolehan), a.umur_ekonomis_bulan, a.tanggal_perolehan, tahun) }));
    },
  });
}

export function useCreateAsetTetap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { jenis_aset: string; tanggal_perolehan: string; umur_ekonomis_bulan: number; harga_perolehan: number; keterangan?: string; departemen_id?: string }) => {
      const { error } = await supabase.from("aset_tetap" as any).insert(v as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aset_tetap"] }); toast.success("Aset berhasil ditambahkan"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteAsetTetap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("aset_tetap" as any).update({ aktif: false } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aset_tetap"] }); toast.success("Aset dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });
}
