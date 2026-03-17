import { useState, useMemo, useEffect } from "react";
import { PrintKuitansi } from "@/components/shared/PrintKuitansi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { supabase } from "@/integrations/supabase/client";
import { useJenisPembayaran, usePembayaranBySiswa, useCreatePembayaran, useLembaga, useTahunAjaranAktif, useTahunAjaran, formatRupiah, terbilang, namaBulan } from "@/hooks/useKeuangan";
import { useTarifSiswa } from "@/hooks/useTarifTagihan";
import { usePengaturanAkun } from "@/hooks/useJurnal";
import { useTagihanBySiswa, useUpdateTagihanLunas } from "@/hooks/useTagihan";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Printer, Check, X } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function InputPembayaran() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSiswa, setSelectedSiswa] = useState<any>(null);
  const [showKuitansi, setShowKuitansi] = useState(false);
  const [lastPayment, setLastPayment] = useState<any>(null);
  const [departemenId, setDepartemenId] = useState("");

  // form state
  const [jenisId, setJenisId] = useState("");
  const [bulan, setBulan] = useState(String(new Date().getMonth() + 1));
  const [jumlah, setJumlah] = useState("");
  const [tanggalBayar, setTanggalBayar] = useState(format(new Date(), "yyyy-MM-dd"));
  const [keterangan, setKeterangan] = useState("");

  const { data: lembagaList } = useLembaga();
  const { data: tahunAktif } = useTahunAjaranAktif();
  const { data: tahunAjaranList } = useTahunAjaran();
  const { data: allJenisList } = useJenisPembayaran(departemenId || undefined);

  // State for tahun ajaran selection (default: active)
  const [selectedTahunAjaranId, setSelectedTahunAjaranId] = useState("");
  const { data: riwayat, isLoading: loadRiwayat } = usePembayaranBySiswa(selectedSiswa?.id);

  const siswaKelasId = selectedSiswa?.kelas_siswa?.[0]?.kelas?.id;

  const { data: applicableTarifJenisIds } = useQuery({
    queryKey: ["applicable_tarif_jenis", selectedSiswa?.id, siswaKelasId, tahunAktif?.id, departemenId],
    enabled: !!selectedSiswa && !!departemenId,
    queryFn: async () => {
      const kelasId = selectedSiswa?.kelas_siswa?.[0]?.kelas?.id || null;
      const q = supabase
        .from("tarif_tagihan")
        .select("jenis_id, siswa_id, kelas_id, tahun_ajaran_id")
        .eq("aktif", true);

      const { data, error } = await q;
      if (error) throw error;
      if (!data) return new Set<string>();

      const validIds = new Set<string>();
      for (const t of data) {
        const row = t as any;
        const matchSiswa = row.siswa_id === selectedSiswa.id || !row.siswa_id;
        const matchKelas = row.kelas_id === kelasId || !row.kelas_id;
        const matchTahun = row.tahun_ajaran_id === tahunAktif?.id || !row.tahun_ajaran_id;
        if (matchSiswa && matchKelas && matchTahun && t.jenis_id) {
          validIds.add(t.jenis_id);
        }
      }
      return validIds;
    },
  });

  const jenisList = useMemo(() => {
    if (!allJenisList) return [];
    if (!selectedSiswa || !applicableTarifJenisIds) return allJenisList;
    return allJenisList.filter((j: any) => applicableTarifJenisIds.has(j.id));
  }, [allJenisList, selectedSiswa, applicableTarifJenisIds]);

  const { data: pengaturanAkun } = usePengaturanAkun();
  const createMutation = useCreatePembayaran();
  const updateTagihanLunas = useUpdateTagihanLunas();

  // Global search — departemenId is optional filter
  const { data: searchResults } = useQuery({
    queryKey: ["search_siswa", searchTerm, departemenId],
    enabled: searchTerm.length >= 2,
    queryFn: async () => {
      let q = supabase
        .from("siswa")
        .select("id, nis, nama, foto_url, status, kelas_siswa(kelas_id, kelas(id, nama, departemen_id))")
        .or(`nama.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%`)
        .eq("status", "aktif")
        .limit(10);
      const { data } = await q;
      if (!data) return [];
      // Client-side filter by departemen if selected
      if (departemenId) {
        return data.filter((s: any) =>
          s.kelas_siswa?.some((ks: any) => ks.kelas?.departemen_id === departemenId)
        );
      }
      return data;
    },
  });

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);
  const isSekali = selectedJenis?.tipe === "sekali";

  const tagihanBulanToCheck = isSekali ? undefined : Number(bulan);
  const { data: existingTagihan } = useTagihanBySiswa(selectedSiswa?.id, jenisId || undefined, tagihanBulanToCheck);

  const { data: tarifNominal } = useTarifSiswa(jenisId || undefined, selectedSiswa?.id, siswaKelasId, tahunAktif?.id);

  const { data: bulanDibayar } = useQuery({
    queryKey: ["cek_tunggakan", selectedSiswa?.id, jenisId],
    enabled: !!selectedSiswa && !!jenisId && !isSekali,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pembayaran")
        .select("bulan")
        .eq("siswa_id", selectedSiswa.id)
        .eq("jenis_id", jenisId);
      if (error) throw error;
      return new Set((data || []).map((r) => r.bulan));
    },
  });

  const { data: pembayaranSekali } = useQuery({
    queryKey: ["cek_sekali", selectedSiswa?.id, jenisId],
    enabled: !!selectedSiswa && !!jenisId && isSekali,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pembayaran")
        .select("jumlah")
        .eq("siswa_id", selectedSiswa.id)
        .eq("jenis_id", jenisId);
      if (error) throw error;
      const effectiveNominal = tarifNominal || 0;
      const totalBayar = (data || []).reduce((sum, r) => sum + (Number(r.jumlah) || 0), 0);
      return { totalBayar, lunas: effectiveNominal > 0 && totalBayar >= effectiveNominal };
    },
  });

  const sudahBayar = bulanDibayar ? Array.from({ length: 12 }, (_, i) => bulanDibayar.has(i + 1)).filter(Boolean).length : 0;
  const belumBayar = bulanDibayar ? 12 - sudahBayar : 0;

  useEffect(() => {
    if (tarifNominal != null && jenisId) {
      setJumlah(String(tarifNominal));
    }
  }, [tarifNominal, jenisId]);

  // Default selectedTahunAjaranId to active
  useEffect(() => {
    if (tahunAktif?.id && !selectedTahunAjaranId) {
      setSelectedTahunAjaranId(tahunAktif.id);
    }
  }, [tahunAktif?.id]);

  const effectiveTahunAjaranId = selectedTahunAjaranId || tahunAktif?.id;
  const isBayarDimuka = !!(tahunAktif?.id && effectiveTahunAjaranId && effectiveTahunAjaranId !== tahunAktif.id);

  const handleSelectSiswa = (s: any) => {
    setSelectedSiswa(s);
    setSearchTerm("");
    // Auto-detect departemen from student's kelas
    const dept = s.kelas_siswa?.[0]?.kelas?.departemen_id;
    if (dept && !departemenId) {
      setDepartemenId(dept);
    }
  };

  const tarifTidakAda = jenisId && selectedSiswa && tarifNominal == null;
  const effectiveTarif = tarifNominal ?? 0;
  const isJumlahLocked = !isSekali && tarifNominal != null;

  const handleSubmit = async () => {
    if (!selectedSiswa || !jenisId || !jumlah || tarifTidakAda) return;

    if (!isSekali && isJumlahLocked && Number(jumlah) !== effectiveTarif) {
      toast.error(`Jumlah harus sesuai tarif: ${formatRupiah(effectiveTarif)}`);
      return;
    }

    if (isSekali && pembayaranSekali) {
      const sisa = effectiveTarif - pembayaranSekali.totalBayar;
      if (Number(jumlah) > sisa) {
        toast.error(`Jumlah melebihi sisa tagihan: ${formatRupiah(sisa)}`);
        return;
      }
    }

    if (!tahunAktif?.id) {
      toast.error("Tahun ajaran aktif belum dikonfigurasi. Pembayaran tidak dapat disimpan.");
      return;
    }

    const kasAkunId = pengaturanAkun?.find((p: any) => p.kode_setting === "kas_tunai")?.akun?.id;
    const pendapatanAkunId = selectedJenis?.akun_pendapatan_id;
    const piutangAkunId = pengaturanAkun?.find((p: any) => p.kode_setting === "piutang_siswa")?.akun?.id;
    const dimukaAkunId = pengaturanAkun?.find((p: any) => p.kode_setting === "AKUN_PENDAPATAN_DIMUKA")?.akun?.id;

    const hasPiutang = existingTagihan && existingTagihan.status === "belum_bayar";

    // Determine credit account based on payment type
    let kreditAkunId: string | undefined;
    let kreditLabel: string;
    if (isBayarDimuka && dimukaAkunId) {
      // Future period → credit to Unearned Revenue (Liability)
      kreditAkunId = dimukaAkunId;
      kreditLabel = "Pendapatan Diterima di Muka";
    } else if (hasPiutang) {
      kreditAkunId = piutangAkunId;
      kreditLabel = "Piutang";
    } else {
      kreditAkunId = pendapatanAkunId;
      kreditLabel = "Pendapatan";
    }

    const bisaAutoJurnal = kasAkunId && kreditAkunId;

    if (!bisaAutoJurnal) {
      if (isBayarDimuka && !dimukaAkunId) {
        toast.error("Akun Pendapatan Diterima di Muka belum dikonfigurasi di Pengaturan Akun. Silakan atur terlebih dahulu.");
        return;
      }
      toast.warning("Akun jurnal belum dikonfigurasi. Pembayaran tersimpan tanpa jurnal otomatis.");
    }

    const result = await createMutation.mutateAsync({
      siswa_id: selectedSiswa.id,
      jenis_id: jenisId,
      bulan: isSekali ? 0 : Number(bulan),
      jumlah: Number(jumlah),
      tanggal_bayar: tanggalBayar,
      keterangan: isBayarDimuka 
        ? `[DIMUKA] ${keterangan || ""} - Untuk TA: ${tahunAjaranList?.find((t: any) => t.id === effectiveTahunAjaranId)?.nama || ""}`.trim()
        : keterangan || undefined,
      departemen_id: departemenId || undefined,
      tahun_ajaran_id: effectiveTahunAjaranId || tahunAktif?.id || undefined,
    });

    if (bisaAutoJurnal && result?.id) {
      try {
        const tahunPembayaran = new Date(tanggalBayar).getFullYear();
        const { data: nomorJurnal, error: rpcError } = await supabase.rpc("generate_nomor_jurnal", {
          p_prefix: isBayarDimuka ? "JD" : "JP",
          p_tahun: tahunPembayaran,
        });
        if (rpcError) throw rpcError;
        if (!nomorJurnal) throw new Error("Gagal mendapatkan nomor jurnal");

        const keteranganJurnal = isSekali
          ? `Penerimaan ${selectedJenis?.nama} - ${selectedSiswa.nama}${isBayarDimuka ? " (Di Muka)" : ""}`
          : `Penerimaan ${selectedJenis?.nama} - ${selectedSiswa.nama} (${namaBulan(Number(bulan))})${isBayarDimuka ? " [Di Muka]" : ""}`;

        const { data: jurnal, error: jErr } = await supabase
          .from("jurnal")
          .insert({
            nomor: nomorJurnal,
            tanggal: tanggalBayar,
            keterangan: keteranganJurnal,
            referensi: result.id,
            departemen_id: departemenId || null,
            total_debit: Number(jumlah),
            total_kredit: Number(jumlah),
            status: "posted",
          })
          .select()
          .single();

        if (!jErr && jurnal) {
          await supabase.from("jurnal_detail").insert([
            {
              jurnal_id: jurnal.id,
              akun_id: kasAkunId,
              keterangan: `Kas penerimaan ${selectedJenis?.nama}`,
              debit: Number(jumlah),
              kredit: 0,
              urutan: 1,
            },
            {
              jurnal_id: jurnal.id,
              akun_id: kreditAkunId,
              keterangan: `${kreditLabel} ${selectedJenis?.nama} - ${selectedSiswa.nama}`,
              debit: 0,
              kredit: Number(jumlah),
              urutan: 2,
            },
          ]);

          await supabase
            .from("pembayaran")
            .update({ jurnal_id: jurnal.id })
            .eq("id", result.id);
        }
      } catch (jurnalError: any) {
        console.error("Auto-jurnal gagal:", jurnalError);
        toast.warning("Pembayaran berhasil, tapi jurnal otomatis gagal dibuat.");
      }
    }

    if (hasPiutang && result?.id) {
      try {
        await updateTagihanLunas.mutateAsync({ id: existingTagihan.id, pembayaran_id: result.id });
      } catch (err) {
        console.error("Update tagihan gagal:", err);
      }
    }

    setLastPayment({ ...result, jenisNama: selectedJenis?.nama, jenisTipe: selectedJenis?.tipe, siswa: selectedSiswa });
    setShowKuitansi(true);
    setJenisId("");
    setJumlah("");
    setKeterangan("");
  };

  const kelasNama = selectedSiswa?.kelas_siswa?.[0]?.kelas?.nama || "-";
  const lembagaNama = lembagaList?.find((l: any) => l.id === departemenId)?.nama || "-";

  const riwayatColumns: DataTableColumn<any>[] = [
    { key: "jenis", label: "Jenis", render: (_, r) => (r as any).jenis_pembayaran?.nama || "-" },
    { key: "bulan", label: "Bulan", render: (v) => namaBulan(v as number) },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    { key: "tanggal_bayar", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
  ];

  return (
    <div className="space-y-0 animate-fade-in">
      {/* Header */}
      <div className="mb-3">
        <h1 className="text-xl font-bold text-foreground">Pembayaran SPP</h1>
        <p className="text-xs text-muted-foreground">Input dan kelola pembayaran siswa</p>
        {!tahunAktif && (
          <p className="text-xs text-destructive font-medium mt-1">⚠️ Tahun ajaran aktif belum dikonfigurasi.</p>
        )}
      </div>

      {/* Search bar — prominent, full width */}
      <div className="flex gap-2 items-end border-b border-border pb-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Ketik NIS atau nama siswa untuk mencari..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 text-base"
          />
          {searchResults && searchResults.length > 0 && searchTerm.length >= 2 && (
            <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((s: any) => (
                <button
                  key={s.id}
                  className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center gap-3"
                  onClick={() => handleSelectSiswa(s)}
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                    {s.nama?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.nama}</p>
                    <p className="text-xs text-muted-foreground">
                      NIS: {s.nis || "-"} • {s.kelas_siswa?.[0]?.kelas?.nama || "-"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <Select value={departemenId || "__all__"} onValueChange={(v) => {
            setDepartemenId(v === "__all__" ? "" : v);
            setSelectedSiswa(null);
            setJenisId("");
          }}>
            <SelectTrigger className="w-44 h-11">
              <SelectValue placeholder="Semua lembaga" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Semua Lembaga</SelectItem>
              {lembagaList?.map((l: any) => (
                <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedSiswa && (
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={() => { setSelectedSiswa(null); setJenisId(""); }}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Two-column layout after student selected */}
      {selectedSiswa ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Left: Student profile + recent payments */}
          <div className="space-y-4">
            {/* Student card */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                  {selectedSiswa.nama?.[0]}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">{selectedSiswa.nama}</h3>
                  <p className="text-xs text-muted-foreground">NIS: {selectedSiswa.nis || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span className="text-muted-foreground">Kelas</span>
                <span className="font-medium">{kelasNama}</span>
                <span className="text-muted-foreground">Lembaga</span>
                <span className="font-medium">{lembagaNama}</span>
              </div>
            </div>

            {/* Recent payments */}
            <div className="rounded-lg border p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Riwayat Terakhir</h4>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {loadRiwayat ? (
                  <p className="text-xs text-muted-foreground">Memuat...</p>
                ) : (riwayat as any[])?.length ? (
                  (riwayat as any[]).slice(0, 8).map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{r.jenis_pembayaran?.nama || "-"}</p>
                        <p className="text-muted-foreground">{r.bulan ? namaBulan(r.bulan) : "-"} • {r.tanggal_bayar ? format(new Date(r.tanggal_bayar), "dd/MM/yy") : "-"}</p>
                      </div>
                      <span className="font-medium text-primary shrink-0 ml-2">{formatRupiah(Number(r.jumlah))}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Belum ada riwayat</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: Payment form */}
          <div className="rounded-lg border p-4 space-y-4">
            <h4 className="text-sm font-semibold">Input Pembayaran</h4>

            {/* Row 1: Jenis + Bulan inline */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Jenis Pembayaran</Label>
                <Select value={jenisId} onValueChange={(v) => { setJenisId(v); setJumlah(""); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                  <SelectContent>
                    {jenisList?.map((j: any) => (
                      <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tarifNominal != null && (
                  <p className="text-[11px] text-primary">⚡ Tarif: {formatRupiah(tarifNominal)}</p>
                )}
                {tarifTidakAda && (
                  <p className="text-[11px] text-destructive font-medium">⚠️ Tarif belum dikonfigurasi</p>
                )}
                {existingTagihan && existingTagihan.status === "belum_bayar" && (
                  <p className="text-[11px] text-amber-600">📋 Piutang: {formatRupiah(Number(existingTagihan.nominal))}</p>
                )}
              </div>

              {!isSekali && !(jenisId && bulanDibayar) && (
                <div className="space-y-1">
                  <Label className="text-xs">Bulan</Label>
                  <Select value={bulan} onValueChange={setBulan}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{namaBulan(i + 1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Month grid for bulanan */}
            {jenisId && !isSekali && !tarifTidakAda && bulanDibayar && (
              <div className="space-y-2">
                <Label className="text-xs">Status Per Bulan</Label>
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i + 1;
                    const sudah = bulanDibayar.has(m);
                    const isSelected = bulan === String(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={sudah}
                        onClick={() => !sudah && setBulan(String(m))}
                        className={cn(
                          "flex flex-col items-center gap-0.5 rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition-all",
                          sudah
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                            : isSelected
                              ? "bg-primary/10 border-primary ring-2 ring-primary/50 text-primary cursor-pointer"
                              : "bg-destructive/5 border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
                        )}
                      >
                        {sudah && <Check className="h-3 w-3" />}
                        <span>{namaBulan(m).slice(0, 3)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Lunas: <span className="font-medium text-emerald-600">{sudahBayar}</span>
                  {" · "}
                  Belum: <span className="font-medium text-destructive">{belumBayar}</span>
                </p>
              </div>
            )}

            {/* Sekali bayar status */}
            {jenisId && isSekali && !tarifTidakAda && pembayaranSekali && (
              <div className="rounded-md border p-3 text-sm">
                {pembayaranSekali.lunas ? (
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Check className="h-4 w-4" />
                    <span className="font-medium">Lunas — {formatRupiah(pembayaranSekali.totalBayar)}</span>
                  </div>
                ) : (
                  <div className="space-y-0.5 text-xs">
                    <p>Nominal: <span className="font-medium">{formatRupiah(effectiveTarif)}</span></p>
                    {pembayaranSekali.totalBayar > 0 && (
                      <p>Dibayar: <span className="font-medium">{formatRupiah(pembayaranSekali.totalBayar)}</span></p>
                    )}
                    <p className="text-destructive font-medium">Sisa: {formatRupiah(effectiveTarif - pembayaranSekali.totalBayar)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Row 2: Tanggal + Nominal inline */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tanggal Bayar</Label>
                <Input type="date" className="h-9" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Jumlah (Rp)</Label>
                <Input type="number" className={cn("h-9", isJumlahLocked && "bg-muted")} value={jumlah} onChange={(e) => !isJumlahLocked && setJumlah(e.target.value)} placeholder="0" disabled={isJumlahLocked} />
                {isJumlahLocked && <p className="text-[11px] text-muted-foreground">🔒 Sesuai tarif</p>}
              </div>
            </div>

            {/* Keterangan */}
            <div className="space-y-1">
              <Label className="text-xs">Keterangan</Label>
              <Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Opsional" rows={2} />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={!jenisId || !jumlah || !!tarifTidakAda || createMutation.isPending || (isSekali && pembayaranSekali?.lunas)}
              className="w-full"
            >
              {createMutation.isPending ? "Menyimpan..." : "Simpan & Cetak Kuitansi"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          Ketik NIS atau nama di bar pencarian untuk memulai
        </div>
      )}

      {/* Kuitansi Dialog */}
      <Dialog open={showKuitansi} onOpenChange={setShowKuitansi}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Kuitansi Pembayaran</DialogTitle></DialogHeader>
          {lastPayment && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Lembaga</span>
                <span className="font-medium">{lembagaNama}</span>
                <span className="text-muted-foreground">Nama</span>
                <span className="font-medium">{lastPayment.siswa.nama}</span>
                <span className="text-muted-foreground">NIS</span>
                <span>{lastPayment.siswa.nis || "-"}</span>
                <span className="text-muted-foreground">Kelas</span>
                <span>{kelasNama}</span>
                <span className="text-muted-foreground">Jenis</span>
                <span>{lastPayment.jenisNama}</span>
                {lastPayment.jenisTipe !== "sekali" && (
                  <>
                    <span className="text-muted-foreground">Bulan</span>
                    <span>{namaBulan(lastPayment.bulan)}</span>
                  </>
                )}
                <span className="text-muted-foreground">Jumlah</span>
                <span className="font-bold text-primary">{formatRupiah(lastPayment.jumlah)}</span>
                <span className="text-muted-foreground">Terbilang</span>
                <span className="italic col-span-1">{terbilang(lastPayment.jumlah)}</span>
                <span className="text-muted-foreground">Tanggal</span>
                <span>{format(new Date(lastPayment.tanggal_bayar), "dd MMMM yyyy", { locale: idLocale })}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKuitansi(false)}>Tutup</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Cetak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lastPayment && (
        <PrintKuitansi
          payment={lastPayment}
          kelasNama={kelasNama}
          lembagaNama={lembagaNama}
        />
      )}
    </div>
  );
}
