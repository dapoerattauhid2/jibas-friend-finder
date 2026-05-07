import { useState, useMemo, useEffect, useCallback } from "react";
import { PrintKuitansi } from "@/components/shared/PrintKuitansi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { supabase } from "@/integrations/supabase/client";
import {
  useJenisPembayaran, useLembaga, useTahunAjaranAktif,
  useTahunAjaran, formatRupiah, terbilang, namaBulan, BULAN_ORDER_AKADEMIK,
} from "@/hooks/useKeuangan";
import { useTarifSiswa } from "@/hooks/useTarifTagihan";
import { useTagihanBySiswa } from "@/hooks/useTagihan";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Printer, Check, X } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
import type {
  SiswaWithKelas,
  JenisPembayaran,
  PembayaranWithJenis,
  ProsesPembayaranRequest,
  FormPembayaran,
} from "@/types/keuangan";
import { isTipeSekali } from "@/types/keuangan";

const FORM_DEFAULT: FormPembayaran = {
  jenisId: "",
  bulan: new Date().getMonth() + 1,
  jumlah: "",
  tanggalBayar: new Date().toISOString().split("T")[0],
  keterangan: "",
};

// ─── Hook: proses pembayaran atomik via Edge Function ────────────────────────
function useProsesPembayaran() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ProsesPembayaranRequest) => {
      const { data, error } = await supabase.functions.invoke("proses-pembayaran", {
        body: payload,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Pembayaran gagal");
      return data as { pembayaran_id: string; jurnal_id: string; nomor_jurnal: string; jumlah: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pembayaran"] });
      qc.invalidateQueries({ queryKey: ["tagihan"] });
      qc.invalidateQueries({ queryKey: ["jurnal"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export default function InputPembayaran() {
  const [searchTerm,    setSearchTerm]    = useState("");
  const [selectedSiswa, setSelectedSiswa] = useState<SiswaWithKelas | null>(null);
  const [departemenId,  setDepartemenId]  = useState("");
  const [form, setForm] = useState<FormPembayaran>(FORM_DEFAULT);
  const [selectedTahunAjaranId, setSelectedTahunAjaranId] = useState("");

  const [showKuitansi, setShowKuitansi] = useState(false);
  const [lastPayment, setLastPayment] = useState<{
    pembayaran_id: string; jumlah: number; jenisNama: string;
    jenisTipe: string; siswa: SiswaWithKelas; bulan: number; tanggal_bayar: string;
  } | null>(null);

  const setField = useCallback(
    <K extends keyof FormPembayaran>(key: K, val: FormPembayaran[K]) =>
      setForm(prev => ({ ...prev, [key]: val })),
    []
  );
  const resetForm = useCallback(() => setForm(FORM_DEFAULT), []);

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: lembagaList }     = useLembaga();
  const { data: tahunAktif }      = useTahunAjaranAktif();
  const { data: tahunAjaranList } = useTahunAjaran();
  const { data: allJenisList }    = useJenisPembayaran(departemenId || undefined);

  const effectiveTahunAjaranId = selectedTahunAjaranId || tahunAktif?.id || "";

  // Search siswa — typed
  const { data: searchResults } = useQuery<SiswaWithKelas[]>({
    queryKey: ["search_siswa", searchTerm, departemenId],
    enabled: searchTerm.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("siswa")
        .select("id, nis, nama, foto_url, status, kelas_siswa(kelas_id, kelas(id, nama, departemen_id))")
        .or(`nama.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%`)
        .eq("status", "aktif")
        .limit(10);
      const all = (data ?? []) as SiswaWithKelas[];
      if (!departemenId) return all;
      return all.filter(s => s.kelas_siswa?.some(ks => ks.kelas?.departemen_id === departemenId));
    },
  });

  const siswaKelasId = selectedSiswa?.kelas_siswa?.[0]?.kelas?.id;

  // Jenis yang berlaku — filter tarif di DB, bukan loop di client
  const { data: applicableTarifJenisIds } = useQuery<Set<string>>({
    queryKey: ["applicable_tarif_jenis", selectedSiswa?.id, siswaKelasId, effectiveTahunAjaranId],
    enabled: !!selectedSiswa,
    queryFn: async () => {
      const filters: string[] = ["siswa_id.is.null"];
      if (selectedSiswa) filters.push(`siswa_id.eq.${selectedSiswa.id}`);

      const { data, error } = await supabase
        .from("tarif_tagihan")
        .select("jenis_id, siswa_id, kelas_id, tahun_ajaran_id")
        .eq("aktif", true)
        .or(filters.join(","));
      if (error) throw error;

      const validIds = new Set<string>();
      for (const t of (data ?? [])) {
        const matchSiswa = t.siswa_id === selectedSiswa!.id || !t.siswa_id;
        const matchKelas = t.kelas_id === siswaKelasId || !t.kelas_id;
        const matchTahun = t.tahun_ajaran_id === effectiveTahunAjaranId || !t.tahun_ajaran_id;
        if (matchSiswa && matchKelas && matchTahun && t.jenis_id) validIds.add(t.jenis_id);
      }
      return validIds;
    },
  });

  const jenisList = useMemo<JenisPembayaran[]>(() => {
    if (!allJenisList) return [];
    if (!selectedSiswa || !applicableTarifJenisIds) return allJenisList as JenisPembayaran[];
    return (allJenisList as JenisPembayaran[]).filter(j => applicableTarifJenisIds.has(j.id));
  }, [allJenisList, selectedSiswa, applicableTarifJenisIds]);

  const selectedJenis = jenisList.find(j => j.id === form.jenisId) ?? null;
  const isSekali      = selectedJenis ? isTipeSekali(selectedJenis.tipe) : false;

  const { data: tarifNominal } = useTarifSiswa(
    form.jenisId || undefined, selectedSiswa?.id, siswaKelasId, effectiveTahunAjaranId,
  );

  const { data: existingTagihan } = useTagihanBySiswa(
    selectedSiswa?.id, form.jenisId || undefined, isSekali ? undefined : form.bulan,
  );

  const { data: bulanDibayar } = useQuery<Set<number>>({
    queryKey: ["cek_bulan_dibayar", selectedSiswa?.id, form.jenisId, effectiveTahunAjaranId],
    enabled: !!selectedSiswa && !!form.jenisId && !isSekali,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pembayaran")
        .select("bulan")
        .eq("siswa_id", selectedSiswa!.id)
        .eq("jenis_id", form.jenisId)
        .eq("tahun_ajaran_id", effectiveTahunAjaranId);
      if (error) throw error;
      return new Set((data ?? []).map(r => r.bulan as number));
    },
  });

  const { data: pembayaranSekali } = useQuery<{ totalBayar: number; lunas: boolean }>({
    queryKey: ["cek_sekali", selectedSiswa?.id, form.jenisId, effectiveTahunAjaranId, tarifNominal],
    enabled: !!selectedSiswa && !!form.jenisId && isSekali && tarifNominal != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pembayaran")
        .select("jumlah")
        .eq("siswa_id", selectedSiswa!.id)
        .eq("jenis_id", form.jenisId)
        .eq("tahun_ajaran_id", effectiveTahunAjaranId);
      if (error) throw error;
      const total = (data ?? []).reduce((s, r) => s + Number(r.jumlah ?? 0), 0);
      return { totalBayar: total, lunas: (tarifNominal ?? 0) > 0 && total >= (tarifNominal ?? 0) };
    },
  });

  const { data: riwayat, isLoading: loadRiwayat } = useQuery<PembayaranWithJenis[]>({
    queryKey: ["pembayaran_siswa", selectedSiswa?.id],
    enabled: !!selectedSiswa,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pembayaran")
        .select("*, jenis_pembayaran:jenis_id(id, nama, tipe)")
        .eq("siswa_id", selectedSiswa!.id)
        .order("tanggal_bayar", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PembayaranWithJenis[];
    },
  });

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tarifNominal != null && form.jenisId) setField("jumlah", String(tarifNominal));
  }, [tarifNominal, form.jenisId]);

  useEffect(() => {
    if (tahunAktif?.id && !selectedTahunAjaranId) setSelectedTahunAjaranId(tahunAktif.id);
  }, [tahunAktif?.id]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isBayarDimuka  = !!(tahunAktif?.id && effectiveTahunAjaranId && effectiveTahunAjaranId !== tahunAktif.id);
  const tarifTidakAda  = !!(form.jenisId && selectedSiswa && tarifNominal == null);
  const isJumlahLocked = !isSekali && tarifNominal != null;
  const sudahBayar     = bulanDibayar ? BULAN_ORDER_AKADEMIK.filter(m => bulanDibayar.has(m)).length : 0;
  const belumBayar     = 12 - sudahBayar;
  const kelasNama      = selectedSiswa?.kelas_siswa?.[0]?.kelas?.nama ?? "-";
  const lembagaNama    = lembagaList?.find(l => l.id === departemenId)?.nama ?? "-";

  // ── Mutation ──────────────────────────────────────────────────────────────
  const prosesMutation = useProsesPembayaran();

  const handleSelectSiswa = useCallback((s: SiswaWithKelas) => {
    setSelectedSiswa(s);
    setSearchTerm("");
    const dept = s.kelas_siswa?.[0]?.kelas?.departemen_id;
    if (dept && !departemenId) setDepartemenId(dept);
  }, [departemenId]);

  const handleSubmit = async () => {
    if (!selectedSiswa || !form.jenisId || !form.jumlah || tarifTidakAda) return;
    if (!tahunAktif?.id) { toast.error("Tahun ajaran aktif belum dikonfigurasi"); return; }
    if (isSekali && pembayaranSekali?.lunas) { toast.error("Pembayaran ini sudah lunas"); return; }

    const result = await prosesMutation.mutateAsync({
      siswa_id:        selectedSiswa.id,
      jenis_id:        form.jenisId,
      bulan:           isSekali ? 0 : form.bulan,
      jumlah:          Number(form.jumlah),
      tanggal_bayar:   form.tanggalBayar,
      keterangan:      isBayarDimuka
        ? `[DIMUKA] ${form.keterangan || ""} - Untuk TA: ${tahunAjaranList?.find(t => t.id === effectiveTahunAjaranId)?.nama ?? ""}`.trim()
        : form.keterangan || undefined,
      departemen_id:   departemenId || undefined,
      tahun_ajaran_id: effectiveTahunAjaranId,
      is_bayar_dimuka: isBayarDimuka,
      tagihan_id:      existingTagihan?.id,
    });
    if (!result) return;

    setLastPayment({
      pembayaran_id: result.pembayaran_id,
      jumlah:        result.jumlah,
      jenisNama:     selectedJenis?.nama ?? "",
      jenisTipe:     selectedJenis?.tipe ?? "",
      siswa:         selectedSiswa,
      bulan:         form.bulan,
      tanggal_bayar: form.tanggalBayar,
    });
    setShowKuitansi(true);
    resetForm();
    toast.success("Pembayaran berhasil disimpan");
  };

  const riwayatColumns: DataTableColumn<PembayaranWithJenis>[] = [
    { key: "jenis_pembayaran", label: "Jenis", render: (_, r) => r.jenis_pembayaran?.nama ?? "-" },
    { key: "bulan",   label: "Bulan",   render: v => namaBulan(v as number) },
    { key: "jumlah",  label: "Jumlah",  render: v => formatRupiah(Number(v)) },
    { key: "tanggal_bayar", label: "Tanggal",
      render: v => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0 animate-fade-in">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-foreground">Pembayaran SPP</h1>
        <p className="text-xs text-muted-foreground">Input dan kelola pembayaran siswa</p>
        {!tahunAktif && <p className="text-xs text-destructive font-medium mt-1">⚠️ Tahun ajaran aktif belum dikonfigurasi.</p>}
      </div>

      {/* Search bar */}
      <div className="flex gap-2 items-end border-b border-border pb-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Ketik NIS atau nama siswa untuk mencari..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 h-11 text-base"
          />
          {searchResults && searchResults.length > 0 && searchTerm.length >= 2 && (
            <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map(s => (
                <button key={s.id} className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center gap-3"
                  onClick={() => handleSelectSiswa(s)}>
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                    {s.nama?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.nama}</p>
                    <p className="text-xs text-muted-foreground">NIS: {s.nis ?? "-"} • {s.kelas_siswa?.[0]?.kelas?.nama ?? "-"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <Select value={departemenId || "__all__"} onValueChange={v => { setDepartemenId(v === "__all__" ? "" : v); setSelectedSiswa(null); setField("jenisId", ""); }}>
          <SelectTrigger className="w-44 h-11"><SelectValue placeholder="Semua lembaga" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Lembaga</SelectItem>
            {lembagaList?.map(l => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedTahunAjaranId || tahunAktif?.id || ""} onValueChange={setSelectedTahunAjaranId}>
          <SelectTrigger className="w-48 h-11"><SelectValue placeholder="Tahun Ajaran" /></SelectTrigger>
          <SelectContent>
            {tahunAjaranList?.filter(t => !t.ditutup).map(t => (
              <SelectItem key={t.id} value={t.id}>{t.nama} {t.aktif ? "(Aktif)" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedSiswa && (
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0"
            onClick={() => { setSelectedSiswa(null); setField("jenisId", ""); }}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {selectedSiswa ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Kiri: profil + riwayat */}
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                  {selectedSiswa.nama?.[0]}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{selectedSiswa.nama}</h3>
                  <p className="text-xs text-muted-foreground">NIS: {selectedSiswa.nis ?? "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-muted-foreground">Kelas</span><span className="font-medium">{kelasNama}</span>
                <span className="text-muted-foreground">Lembaga</span><span className="font-medium">{lembagaNama}</span>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Riwayat Terakhir</h4>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {loadRiwayat ? <p className="text-xs text-muted-foreground">Memuat...</p>
                  : riwayat?.length ? riwayat.slice(0, 8).map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.jenis_pembayaran?.nama ?? "-"}</p>
                        <p className="text-muted-foreground">{r.bulan ? namaBulan(r.bulan) : "-"} • {r.tanggal_bayar ? format(new Date(r.tanggal_bayar), "dd/MM/yy") : "-"}</p>
                      </div>
                      <span className="font-medium text-primary shrink-0 ml-2">{formatRupiah(Number(r.jumlah))}</span>
                    </div>
                  )) : <p className="text-xs text-muted-foreground">Belum ada riwayat</p>}
              </div>
            </div>
          </div>

          {/* Kanan: form */}
          <div className="rounded-lg border p-4 space-y-4">
            <h4 className="text-sm font-semibold">Input Pembayaran</h4>
            {isBayarDimuka && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-2">
                <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  ⚡ Pembayaran Di Muka — dicatat sebagai liabilitas, diakui saat tahun ajaran target dimulai.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Jenis Pembayaran</Label>
                <Select value={form.jenisId} onValueChange={v => { setField("jenisId", v); setField("jumlah", ""); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                  <SelectContent>
                    {jenisList.map(j => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
                {tarifNominal != null && <p className="text-[11px] text-primary">⚡ Tarif: {formatRupiah(tarifNominal)}</p>}
                {tarifTidakAda && <p className="text-[11px] text-destructive font-medium">⚠️ Tarif belum dikonfigurasi</p>}
                {existingTagihan?.status === "belum_bayar" && (
                  <p className="text-[11px] text-amber-600">📋 Piutang: {formatRupiah(Number(existingTagihan.nominal))}</p>
                )}
              </div>
              {!isSekali && !(form.jenisId && bulanDibayar) && (
                <div className="space-y-1">
                  <Label className="text-xs">Bulan</Label>
                  <Select value={String(form.bulan)} onValueChange={v => setField("bulan", Number(v))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BULAN_ORDER_AKADEMIK.map(m => <SelectItem key={m} value={String(m)}>{namaBulan(m)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {form.jenisId && !isSekali && !tarifTidakAda && bulanDibayar && (
              <div className="space-y-2">
                <Label className="text-xs">Status Per Bulan</Label>
                <div className="grid grid-cols-6 gap-1.5">
                  {BULAN_ORDER_AKADEMIK.map(m => {
                    const sudah = bulanDibayar.has(m);
                    const isSelected = form.bulan === m;
                    return (
                      <button key={m} type="button" disabled={sudah}
                        onClick={() => !sudah && setField("bulan", m)}
                        className={cn(
                          "flex flex-col items-center gap-0.5 rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition-all",
                          sudah ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                            : isSelected ? "bg-primary/10 border-primary ring-2 ring-primary/50 text-primary cursor-pointer"
                            : "bg-destructive/5 border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
                        )}>
                        {sudah && <Check className="h-3 w-3" />}
                        <span>{namaBulan(m).slice(0, 3)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Lunas: <span className="font-medium text-emerald-600">{sudahBayar}</span>
                  {" · "}Belum: <span className="font-medium text-destructive">{belumBayar}</span>
                </p>
              </div>
            )}
            {form.jenisId && isSekali && !tarifTidakAda && pembayaranSekali && (
              <div className="rounded-md border p-3 text-sm">
                {pembayaranSekali.lunas ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Check className="h-4 w-4" />
                    <span className="font-medium">Lunas — {formatRupiah(pembayaranSekali.totalBayar)}</span>
                  </div>
                ) : (
                  <div className="space-y-0.5 text-xs">
                    <p>Nominal: <span className="font-medium">{formatRupiah(tarifNominal ?? 0)}</span></p>
                    {pembayaranSekali.totalBayar > 0 && <p>Dibayar: <span className="font-medium">{formatRupiah(pembayaranSekali.totalBayar)}</span></p>}
                    <p className="text-destructive font-medium">Sisa: {formatRupiah((tarifNominal ?? 0) - pembayaranSekali.totalBayar)}</p>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tanggal Bayar</Label>
                <Input type="date" className="h-9" value={form.tanggalBayar} onChange={e => setField("tanggalBayar", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Jumlah (Rp)</Label>
                <Input type="number" className={cn("h-9", isJumlahLocked && "bg-muted")}
                  value={form.jumlah} onChange={e => !isJumlahLocked && setField("jumlah", e.target.value)}
                  placeholder="0" disabled={isJumlahLocked} />
                {isJumlahLocked && <p className="text-[11px] text-muted-foreground">🔒 Sesuai tarif</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Keterangan</Label>
              <Textarea value={form.keterangan} onChange={e => setField("keterangan", e.target.value)} placeholder="Opsional" rows={2} />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!form.jenisId || !form.jumlah || !!tarifTidakAda || prosesMutation.isPending || (isSekali && pembayaranSekali?.lunas)}
              className="w-full"
            >
              {prosesMutation.isPending ? "Menyimpan..." : "Simpan & Cetak Kuitansi"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Ketik NIS atau nama di bar pencarian untuk memulai
        </div>
      )}

      {/* Dialog Kuitansi */}
      <Dialog open={showKuitansi} onOpenChange={setShowKuitansi}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Kuitansi Pembayaran</DialogTitle></DialogHeader>
          {lastPayment && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Lembaga</span><span className="font-medium">{lembagaNama}</span>
                <span className="text-muted-foreground">Nama</span><span className="font-medium">{lastPayment.siswa.nama}</span>
                <span className="text-muted-foreground">NIS</span><span>{lastPayment.siswa.nis ?? "-"}</span>
                <span className="text-muted-foreground">Kelas</span><span>{kelasNama}</span>
                <span className="text-muted-foreground">Jenis</span><span>{lastPayment.jenisNama}</span>
                {lastPayment.jenisTipe !== "sekali" && (
                  <><span className="text-muted-foreground">Bulan</span><span>{namaBulan(lastPayment.bulan)}</span></>
                )}
                <span className="text-muted-foreground">Jumlah</span>
                <span className="font-bold text-primary">{formatRupiah(lastPayment.jumlah)}</span>
                <span className="text-muted-foreground">Terbilang</span>
                <span className="italic">{terbilang(lastPayment.jumlah)}</span>
                <span className="text-muted-foreground">Tanggal</span>
                <span>{format(new Date(lastPayment.tanggal_bayar), "dd MMMM yyyy", { locale: idLocale })}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKuitansi(false)}>Tutup</Button>
            <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Cetak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lastPayment && <PrintKuitansi payment={lastPayment} kelasNama={kelasNama} lembagaNama={lembagaNama} />}
    </div>
  );
}
