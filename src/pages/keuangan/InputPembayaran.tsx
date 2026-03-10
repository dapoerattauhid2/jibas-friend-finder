import { useState, useMemo } from "react";
import { PrintKuitansi } from "@/components/shared/PrintKuitansi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { supabase } from "@/integrations/supabase/client";
import { useJenisPembayaran, usePembayaranBySiswa, useCreatePembayaran, useLembaga, formatRupiah, terbilang, namaBulan } from "@/hooks/useKeuangan";
import { useTarifSiswa } from "@/hooks/useTarifTagihan";
import { usePengaturanAkun } from "@/hooks/useJurnal";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Printer, Check } from "lucide-react";
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
  const { data: jenisList } = useJenisPembayaran(departemenId || undefined);
  const { data: riwayat, isLoading: loadRiwayat } = usePembayaranBySiswa(selectedSiswa?.id);
  const { data: pengaturanAkun } = usePengaturanAkun();
  const createMutation = useCreatePembayaran();

  // Search siswa
  const { data: searchResults } = useQuery({
    queryKey: ["search_siswa", searchTerm],
    enabled: searchTerm.length >= 2 && !!departemenId,
    queryFn: async () => {
      const { data } = await supabase
        .from("siswa")
        .select("id, nis, nama, foto_url, status, kelas_siswa(kelas(nama))")
        .or(`nama.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%`)
        .eq("status", "aktif")
        .limit(10);
      return data || [];
    },
  });

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);
  const isSekali = selectedJenis?.tipe === "sekali";

  // Get kelas_id of the selected student for tarif lookup
  const siswaKelasId = selectedSiswa?.kelas_siswa?.[0]?.kelas?.id;
  const { data: tarifNominal } = useTarifSiswa(jenisId || undefined, selectedSiswa?.id, siswaKelasId);

  // Auto-detect tunggakan: cek bulan yang sudah dibayar (untuk tipe bulanan)
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

  // Cek status pembayaran sekali bayar
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
      const totalBayar = (data || []).reduce((sum, r) => sum + (Number(r.jumlah) || 0), 0);
      return { totalBayar, lunas: totalBayar >= (Number(selectedJenis?.nominal) || 0) };
    },
  });

  const sudahBayar = bulanDibayar ? Array.from({ length: 12 }, (_, i) => bulanDibayar.has(i + 1)).filter(Boolean).length : 0;
  const belumBayar = bulanDibayar ? 12 - sudahBayar : 0;

  const handleSelectSiswa = (s: any) => {
    setSelectedSiswa(s);
    setSearchTerm("");
  };

  const handleSubmit = async () => {
    if (!selectedSiswa || !jenisId || !jumlah) return;

    // A. Validasi akun tersedia
    const kasAkunId = pengaturanAkun?.find((p: any) => p.kode_setting === "kas_tunai")?.akun?.id;
    const pendapatanAkunId = selectedJenis?.akun_pendapatan_id;
    const bisaAutoJurnal = kasAkunId && pendapatanAkunId;

    if (!bisaAutoJurnal) {
      toast.warning("Akun jurnal belum dikonfigurasi. Pembayaran tersimpan tanpa jurnal otomatis. Silakan buat jurnal manual.");
    }

    // B. Simpan pembayaran
    const result = await createMutation.mutateAsync({
      siswa_id: selectedSiswa.id,
      jenis_id: jenisId,
      bulan: isSekali ? 0 : Number(bulan),
      jumlah: Number(jumlah),
      tanggal_bayar: tanggalBayar,
      keterangan: keterangan || undefined,
      departemen_id: departemenId || undefined,
    });

    // C. Auto-jurnal jika akun tersedia
    if (bisaAutoJurnal && result?.id) {
      try {
        const tahunPembayaran = new Date(tanggalBayar).getFullYear();
        const { data: nomorJurnal, error: rpcError } = await supabase.rpc("generate_nomor_jurnal", {
          p_prefix: "JP",
          p_tahun: tahunPembayaran,
        });
        if (rpcError) throw rpcError;
        if (!nomorJurnal) throw new Error("Gagal mendapatkan nomor jurnal");

        const { data: jurnal, error: jErr } = await supabase
          .from("jurnal")
          .insert({
            nomor: nomorJurnal,
            tanggal: tanggalBayar,
            keterangan: isSekali
              ? `Penerimaan ${selectedJenis?.nama} - ${selectedSiswa.nama}`
              : `Penerimaan ${selectedJenis?.nama} - ${selectedSiswa.nama} (${namaBulan(Number(bulan))})`,
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
              akun_id: pendapatanAkunId,
              keterangan: isSekali
                ? `${selectedJenis?.nama} - ${selectedSiswa.nama}`
                : `${selectedJenis?.nama} - ${selectedSiswa.nama} ${namaBulan(Number(bulan))}`,
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
        toast.warning("Pembayaran berhasil, tapi jurnal otomatis gagal dibuat. Buat jurnal manual.");
      }
    }

    // D. Tampilkan kuitansi
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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pembayaran SPP</h1>
        <p className="text-sm text-muted-foreground">Input dan kelola pembayaran siswa</p>
      </div>

      {/* Lembaga + Search */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="max-w-md">
            <Label>Pilih Lembaga</Label>
            <Select value={departemenId} onValueChange={(v) => {
              setDepartemenId(v);
              setSelectedSiswa(null);
              setJenisId("");
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih lembaga terlebih dahulu" />
              </SelectTrigger>
              <SelectContent>
                {lembagaList?.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.kode} — {l.nama}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari siswa (NIS atau nama)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              disabled={!departemenId}
            />
            {searchResults && searchResults.length > 0 && searchTerm.length >= 2 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((s: any) => (
                  <button
                    key={s.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center gap-3"
                    onClick={() => handleSelectSiswa(s)}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {s.nama?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.nama}</p>
                      <p className="text-xs text-muted-foreground">NIS: {s.nis || "-"}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSiswa && (
        <>
          {/* Student info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {selectedSiswa.nama?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{selectedSiswa.nama}</h3>
                  <p className="text-sm text-muted-foreground">NIS: {selectedSiswa.nis || "-"} • Kelas: {kelasNama} • Lembaga: {lembagaNama}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Payment form */}
            <Card>
              <CardHeader><CardTitle>Input Pembayaran</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Jenis Pembayaran</Label>
                  <Select value={jenisId} onValueChange={(v) => {
                    setJenisId(v);
                    const j = jenisList?.find((x: any) => x.id === v);
                    if (j?.nominal) setJumlah(String(j.nominal));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                    <SelectContent>
                      {jenisList?.map((j: any) => (
                        <SelectItem key={j.id} value={j.id}>{j.nama} {j.nominal ? `(${formatRupiah(Number(j.nominal))})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Grid 12 bulan - hanya untuk tipe bulanan */}
                {jenisId && !isSekali && bulanDibayar && (
                  <div className="space-y-3">
                    <Label>Status Pembayaran Per Bulan</Label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
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
                              "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-xs font-medium transition-all",
                              sudah
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                                : isSelected
                                  ? "bg-primary/10 border-primary ring-2 ring-primary/50 text-primary cursor-pointer"
                                  : "bg-destructive/5 border-destructive/30 text-destructive hover:bg-destructive/10 cursor-pointer"
                            )}
                          >
                            {sudah && <Check className="h-3.5 w-3.5" />}
                            <span>{namaBulan(m).slice(0, 3)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sudah lunas: <span className="font-medium text-emerald-600">{sudahBayar} bulan</span>
                      {" | "}
                      Belum bayar: <span className="font-medium text-destructive">{belumBayar} bulan</span>
                    </p>
                  </div>
                )}

                {/* Status sekali bayar */}
                {jenisId && isSekali && pembayaranSekali && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <Label>Status Pembayaran</Label>
                    {pembayaranSekali.lunas ? (
                      <div className="flex items-center gap-2 text-emerald-600">
                        <Check className="h-4 w-4" />
                        <span className="font-medium">Sudah Lunas — {formatRupiah(pembayaranSekali.totalBayar)}</span>
                      </div>
                    ) : (
                      <div className="text-sm space-y-1">
                        <p>Nominal: <span className="font-medium">{formatRupiah(Number(selectedJenis?.nominal) || 0)}</span></p>
                        {pembayaranSekali.totalBayar > 0 && (
                          <p>Sudah dibayar: <span className="font-medium">{formatRupiah(pembayaranSekali.totalBayar)}</span></p>
                        )}
                        <p className="text-destructive font-medium">
                          Sisa: {formatRupiah((Number(selectedJenis?.nominal) || 0) - pembayaranSekali.totalBayar)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {!isSekali && !(jenisId && bulanDibayar) && (
                    <div>
                      <Label>Bulan</Label>
                      <Select value={bulan} onValueChange={setBulan}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{namaBulan(i + 1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className={(isSekali || (jenisId && bulanDibayar)) ? "col-span-2" : ""}>
                    <Label>Jumlah (Rp)</Label>
                    <Input type="number" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div>
                  <Label>Tanggal Bayar</Label>
                  <Input type="date" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} />
                </div>
                <div>
                  <Label>Keterangan</Label>
                  <Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Opsional" />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={!jenisId || !jumlah || createMutation.isPending || (isSekali && pembayaranSekali?.lunas)}
                  className="w-full"
                >
                  {createMutation.isPending ? "Menyimpan..." : "Simpan & Cetak Kuitansi"}
                </Button>
              </CardContent>
            </Card>

            {/* Riwayat */}
            <Card>
              <CardHeader><CardTitle>Riwayat Pembayaran</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  columns={riwayatColumns}
                  data={(riwayat as any[]) || []}
                  loading={loadRiwayat}
                  searchable={false}
                  pageSize={10}
                  emptyMessage="Belum ada riwayat pembayaran"
                />
              </CardContent>
            </Card>
          </div>
        </>
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

      {/* Hidden print layout */}
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
