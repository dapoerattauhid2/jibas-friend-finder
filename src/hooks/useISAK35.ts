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

export function useLaporanKomprehensif(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_komprehensif", tahun, departemenId],
    queryFn: async () => {
      const [saldo, dep] = await Promise.all([hitungSaldoAkun(tahun, departemenId), totalDepresiasi(tahun, departemenId)]);
      const get = (pos: string) => saldo.filter(a => a.pos_isak35 === pos);
      const pendapatan = get("pendapatan");
      const totalPendapatan = pendapatan.reduce((s, a) => s + a.saldo, 0);
      const beban = get("beban").map(a => a.kode === "5-120" ? { ...a, saldo: dep.totalBeban } : a);
      const totalBeban = beban.reduce((s, a) => s + a.saldo, 0);
      const surplusDefisit = totalPendapatan - totalBeban;
      const pendapatanTerbatas = get("pendapatan_terbatas");
      const totalPT = pendapatanTerbatas.reduce((s, a) => s + a.saldo, 0);
      const bebanTerbatas = get("beban_terbatas");
      const totalBT = bebanTerbatas.reduce((s, a) => s + a.saldo, 0);
      const surplusTerbatas = totalPT - totalBT;
      const pkl = get("pkl").reduce((s, a) => s + a.saldo, 0);
      return { pendapatan, totalPendapatan, beban, totalBeban, surplusDefisit, pendapatanTerbatas, totalPT, bebanTerbatas, totalBT, surplusTerbatas, pkl, totalKomprehensif: surplusDefisit + surplusTerbatas + pkl, dep };
    },
  });
}

export function useLaporanPosisiKeuangan(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_posisi", tahun, departemenId],
    queryFn: async () => {
      const [saldo, dep] = await Promise.all([hitungSaldoAkun(tahun, departemenId), totalDepresiasi(tahun, departemenId)]);
      const g = (kode: string) => saldo.find(a => a.kode === kode)?.saldo ?? 0;
      const asetLancar = { kas: g("1-111"), piutang: g("1-112"), invJP: g("1-113"), persediaan: g("1-114"), lainnya: g("1-115") };
      const totalAL = Object.values(asetLancar).reduce((s, v) => s + v, 0);
      const asetTL = { properti: g("1-211"), invJG: g("1-212"), asetTetap: dep.totalHP, akmPenyusutan: -dep.totalAkum };
      const totalATL = Object.values(asetTL).reduce((s, v) => s + v, 0);
      const totalAset = totalAL + totalATL;
      const liabJP = { pdd: g("2-111"), utangJP: g("2-112") };
      const totalLJP = liabJP.pdd + liabJP.utangJP;
      const liabJG = { utangJG: g("2-113"), lik: g("2-114") };
      const totalLJG = liabJG.utangJG + liabJG.lik;
      const totalLiabilitas = totalLJP + totalLJG;
      const totalAsetNeto = totalAset - totalLiabilitas;
      const surplusAkumulasian = g("2-115");
      return { asetLancar, totalAL, asetTL, totalATL, totalAset, liabJP, totalLJP, liabJG, totalLJG, totalLiabilitas, totalAsetNeto, surplusAkumulasian, selisih: totalAset - totalLiabilitas - totalAsetNeto };
    },
  });
}

export function useLaporanArusKas(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_arus_kas", tahun, departemenId],
    queryFn: async () => {
      const saldo = await hitungSaldoAkun(tahun, departemenId);
      const g = (kode: string) => saldo.find(a => a.kode === kode)?.saldo ?? 0;
      const penerimaanOperasi = ["4-114","4-115","4-116","4-117","4-118"].reduce((s, k) => s + g(k), 0);
      const pengeluaranOperasi = ["5-111","5-112","5-113","5-114","5-115","5-116","5-117","5-118","5-119","5-121"].reduce((s, k) => s + g(k), 0);
      const arusOperasi = penerimaanOperasi - pengeluaranOperasi;
      const arusInvestasi = -(g("1-213"));
      const arusPendanaan = g("2-112") + g("2-113");
      const kenaikanKas = arusOperasi + arusInvestasi + arusPendanaan;
      const kasAwal = 0;
      return { penerimaanOperasi, pengeluaranOperasi, arusOperasi, arusInvestasi, arusPendanaan, kenaikanKas, kasAwal, kasAkhir: kasAwal + kenaikanKas };
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
