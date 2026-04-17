import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useTahunAjaran, formatRupiah } from "@/hooks/useKeuangan";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, AlertTriangle, TrendingUp, TrendingDown, DollarSign, History } from "lucide-react";
import { StatsCard } from "@/components/shared/StatsCard";

export default function TutupBuku() {
  const [tahunId, setTahunId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const qc = useQueryClient();

  const { data: taList } = useTahunAjaran();
  const selectedTA = taList?.find((t: any) => t.id === tahunId);

  // Check AKUN_ASET_NETO_TIDAK_TERIKAT setting (ISAK 35 nirlaba; legacy: AKUN_LABA_DITAHAN)
  const { data: akunAsetNeto } = useQuery({
    queryKey: ["pengaturan_akun", "AKUN_ASET_NETO_TIDAK_TERIKAT"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pengaturan_akun")
        .select("*, akun:akun_id(id, kode, nama)")
        .in("kode_setting", ["AKUN_ASET_NETO_TIDAK_TERIKAT", "AKUN_LABA_DITAHAN"])
        .order("kode_setting", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  // Fetch log tutup buku history
  const { data: logHistory } = useQuery({
    queryKey: ["log_tutup_buku"],
    queryFn: async () => {
      const { data } = await supabase
        .from("log_tutup_buku" as any)
        .select("*")
        .order("tanggal_proses", { ascending: false })
        .limit(20);
      return (data || []) as any[];
    },
  });

  // Get all accounts with calculated balances for the selected year
  const { data: saldoAkun, isLoading } = useQuery({
    queryKey: ["saldo_akun_tutup_buku", tahunId],
    enabled: !!tahunId && !!selectedTA,
    queryFn: async () => {
      const tahunMulai = selectedTA?.tanggal_mulai;
      const tahunSelesai = selectedTA?.tanggal_selesai;
      if (!tahunMulai || !tahunSelesai) return [];

      const { data: akun } = await supabase
        .from("akun_rekening")
        .select("id, kode, nama, jenis, saldo_normal, saldo_awal")
        .eq("aktif", true)
        .order("kode");

      if (!akun?.length) return [];

      const { data: jurnalList } = await supabase
        .from("jurnal")
        .select("id")
        .gte("tanggal", tahunMulai)
        .lte("tanggal", tahunSelesai)
        .eq("status", "posted");

      const jurnalIds = jurnalList?.map(j => j.id) || [];

      let details: any[] = [];
      if (jurnalIds.length > 0) {
        const { data } = await supabase
          .from("jurnal_detail")
          .select("akun_id, debit, kredit")
          .in("jurnal_id", jurnalIds);
        details = data || [];
      }

      return akun.map((a) => {
        const akunDetails = details.filter(d => d.akun_id === a.id);
        const totalDebit = akunDetails.reduce((s, d) => s + Number(d.debit || 0), 0);
        const totalKredit = akunDetails.reduce((s, d) => s + Number(d.kredit || 0), 0);
        const saldoAwal = Number(a.saldo_awal || 0);
        const saldoAkhir = a.saldo_normal === "debit"
          ? saldoAwal + totalDebit - totalKredit
          : saldoAwal + totalKredit - totalDebit;

        return {
          id: a.id,
          kode: a.kode,
          nama: a.nama,
          jenis: a.jenis,
          saldo_normal: a.saldo_normal,
          saldo_awal: saldoAwal,
          totalDebit,
          totalKredit,
          saldoAkhir,
        };
      });
    },
  });

  // Compute summary
  const totalPendapatan = saldoAkun?.filter(a => a.jenis === "Pendapatan").reduce((s, a) => s + a.saldoAkhir, 0) || 0;
  const totalBeban = saldoAkun?.filter(a => a.jenis === "Beban").reduce((s, a) => s + a.saldoAkhir, 0) || 0;
  const labaRugi = totalPendapatan - totalBeban;

  const hasAkunEkuitas = !!akunAsetNeto?.akun_id;
  const isTADitutup = selectedTA?.ditutup === true;

  const tutupBukuMutation = useMutation({
    mutationFn: async () => {
      if (!saldoAkun?.length || !selectedTA) throw new Error("Data tidak lengkap");
      if (!hasAkunEkuitas) throw new Error("Akun Aset Neto Tidak Terikat belum dikonfigurasi. Atur di Keuangan → Referensi Keuangan → Pengaturan Akun.");

      const akunEkuitasId = akunAsetNeto.akun_id;

      // 1. Update saldo_awal for each account to saldoAkhir
      for (const akun of saldoAkun) {
        await supabase
          .from("akun_rekening")
          .update({ saldo_awal: akun.saldoAkhir })
          .eq("id", akun.id);
      }

      // 2. Generate closing journal
      const tahun = new Date(selectedTA.tanggal_selesai).getFullYear();
      const { data: nomorJurnal } = await supabase.rpc("generate_nomor_jurnal", {
        p_prefix: "TB",
        p_tahun: tahun,
      });

      const pendapatan = saldoAkun.filter(a => a.jenis === "Pendapatan" && a.saldoAkhir !== 0);
      const beban = saldoAkun.filter(a => a.jenis === "Beban" && a.saldoAkhir !== 0);

      let jurnalId: string | null = null;

      if (pendapatan.length > 0 || beban.length > 0 || labaRugi !== 0) {
        const totalDebitJurnal = pendapatan.reduce((s, a) => s + a.saldoAkhir, 0) + (labaRugi < 0 ? Math.abs(labaRugi) : 0);
        const totalKreditJurnal = beban.reduce((s, a) => s + a.saldoAkhir, 0) + (labaRugi > 0 ? labaRugi : 0);

        const { data: jurnal, error: jErr } = await supabase
          .from("jurnal")
          .insert({
            nomor: nomorJurnal || `TB-${tahun}`,
            tanggal: selectedTA.tanggal_selesai,
            keterangan: `Jurnal Penutup Tahun Buku ${selectedTA.nama}`,
            status: "posted",
            total_debit: totalDebitJurnal,
            total_kredit: totalKreditJurnal,
          })
          .select()
          .single();

        if (!jErr && jurnal) {
          jurnalId = (jurnal as any).id;
          const detailRows: any[] = [];
          let urutan = 1;

          // Close revenue accounts (debit pendapatan)
          for (const a of pendapatan) {
            detailRows.push({
              jurnal_id: jurnalId,
              akun_id: a.id,
              keterangan: `Penutup ${a.nama}`,
              debit: a.saldoAkhir,
              kredit: 0,
              urutan: urutan++,
            });
          }

          // Close expense accounts (kredit beban)
          for (const a of beban) {
            detailRows.push({
              jurnal_id: jurnalId,
              akun_id: a.id,
              keterangan: `Penutup ${a.nama}`,
              debit: 0,
              kredit: a.saldoAkhir,
              urutan: urutan++,
            });
          }

          // Transfer surplus/defisit ke Aset Neto Tidak Terikat (ISAK 35)
          if (labaRugi > 0) {
            // Surplus → Kredit Aset Neto
            detailRows.push({
              jurnal_id: jurnalId,
              akun_id: akunEkuitasId,
              keterangan: `Surplus periode ${selectedTA.nama}`,
              debit: 0,
              kredit: labaRugi,
              urutan: urutan++,
            });
          } else if (labaRugi < 0) {
            // Defisit → Debit Aset Neto
            detailRows.push({
              jurnal_id: jurnalId,
              akun_id: akunEkuitasId,
              keterangan: `Defisit periode ${selectedTA.nama}`,
              debit: Math.abs(labaRugi),
              kredit: 0,
              urutan: urutan++,
            });
          }

          if (detailRows.length > 0) {
            await supabase.from("jurnal_detail").insert(detailRows);
          }
        }
      }

      // 3. Mark tahun ajaran as ditutup and deactivate
      await supabase.from("tahun_ajaran").update({ ditutup: true, aktif: false } as any).eq("id", selectedTA.id);

      // 4. Insert audit log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("log_tutup_buku" as any).insert({
        tahun_ajaran_id: selectedTA.id,
        user_id: user?.id,
        total_laba_rugi: labaRugi,
        jurnal_id: jurnalId,
        keterangan: `Tutup buku ${selectedTA.nama}. Surplus/Defisit: ${formatRupiah(labaRugi)}`,
      });

      return selectedTA.nama;
    },
    onSuccess: (nama) => {
      qc.invalidateQueries({ queryKey: ["tahun_ajaran"] });
      qc.invalidateQueries({ queryKey: ["saldo_akun_tutup_buku"] });
      qc.invalidateQueries({ queryKey: ["log_tutup_buku"] });
      toast.success(`Tutup buku ${nama} berhasil. Saldo awal telah diperbarui dan surplus/defisit dipindahkan ke Aset Neto Tidak Terikat.`);
      setTahunId("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const columns: DataTableColumn<any>[] = [
    { key: "kode", label: "Kode" },
    { key: "nama", label: "Nama Akun" },
    { key: "jenis", label: "Jenis" },
    { key: "saldo_awal", label: "Saldo Awal", render: (v) => formatRupiah(Number(v)) },
    { key: "totalDebit", label: "Total Debit", render: (v) => formatRupiah(Number(v)) },
    { key: "totalKredit", label: "Total Kredit", render: (v) => formatRupiah(Number(v)) },
    { key: "saldoAkhir", label: "Saldo Akhir", render: (v) => {
      const val = Number(v);
      return <span className={val < 0 ? "text-destructive" : ""}>{formatRupiah(val)}</span>;
    }},
  ];

  const logColumns: DataTableColumn<any>[] = [
    { key: "tanggal_proses", label: "Tanggal", render: (v) => new Date(v as string).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
    { key: "total_laba_rugi", label: "Laba/Rugi", render: (v) => {
      const val = Number(v);
      return <span className={val < 0 ? "text-destructive" : "text-emerald-600"}>{formatRupiah(val)}</span>;
    }},
    { key: "keterangan", label: "Keterangan" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tutup Buku</h1>
        <p className="text-sm text-muted-foreground">Proses akhir tahun buku — hitung saldo akhir, transfer laba/rugi ke ekuitas, dan kunci periode</p>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning">Perhatian!</p>
            <p className="text-muted-foreground">Proses tutup buku akan mengubah saldo awal setiap akun, memindahkan surplus/defisit ke akun <strong>Aset Neto Tidak Terikat</strong> (ISAK 35), dan mengunci periode sehingga tidak bisa diinput transaksi baru. Proses ini tidak dapat dibatalkan.</p>
          </div>
        </CardContent>
      </Card>

      {/* Warning if AKUN_ASET_NETO_TIDAK_TERIKAT not configured */}
      {!hasAkunEkuitas && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Akun Aset Neto Tidak Terikat Belum Dikonfigurasi</p>
              <p className="text-muted-foreground">Silakan atur akun <strong>Aset Neto Tidak Terikat</strong> (Ekuitas Nirlaba) di menu <strong>Keuangan → Referensi Keuangan → Pengaturan Akun</strong> sebelum melakukan tutup buku.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="max-w-md">
            <Label>Pilih Tahun Buku</Label>
            <Select value={tahunId} onValueChange={setTahunId}>
              <SelectTrigger><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
              <SelectContent>
                {taList?.map((t: any) => (
                  <SelectItem key={t.id} value={t.id} disabled={t.ditutup}>
                    {t.nama} {t.aktif ? "(Aktif)" : ""} {t.ditutup ? "🔒 Sudah Ditutup" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {tahunId && isTADitutup && (
        <Card className="border-muted">
          <CardContent className="pt-6 text-center text-muted-foreground">
            <Lock className="h-8 w-8 mx-auto mb-2" />
            <p>Tahun buku ini sudah ditutup dan tidak bisa diproses ulang.</p>
          </CardContent>
        </Card>
      )}

      {tahunId && !isTADitutup && (
        <>
          {/* Summary cards */}
          {saldoAkun && saldoAkun.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatsCard
                title="Total Pendapatan"
                value={formatRupiah(totalPendapatan)}
                icon={TrendingUp}
              />
              <StatsCard
                title="Total Beban"
                value={formatRupiah(totalBeban)}
                icon={TrendingDown}
              />
              <StatsCard
                title={labaRugi >= 0 ? "Surplus" : "Defisit"}
                value={formatRupiah(Math.abs(labaRugi))}
                icon={DollarSign}
              />
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldo Akun — {selectedTA?.nama}</CardTitle>
              <CardDescription>Preview saldo akhir sebelum tutup buku</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-40" /> : (
                <DataTable columns={columns} data={saldoAkun || []} exportable exportFilename={`tutup-buku-${selectedTA?.nama}`} pageSize={50} />
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="lg"
              onClick={() => setShowConfirm(true)}
              disabled={tutupBukuMutation.isPending || !saldoAkun?.length || !hasAkunEkuitas}
            >
              <Lock className="h-4 w-4 mr-2" />
              {tutupBukuMutation.isPending ? "Memproses..." : "Proses Tutup Buku"}
            </Button>
          </div>
        </>
      )}

      {/* Riwayat Tutup Buku */}
      {logHistory && logHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4" />
              Riwayat Tutup Buku
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={logColumns} data={logHistory} pageSize={10} />
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Konfirmasi Tutup Buku"
        description={`Anda yakin ingin menutup buku untuk tahun ${selectedTA?.nama}? Surplus/Defisit sebesar ${formatRupiah(labaRugi)} akan dipindahkan ke akun Aset Neto Tidak Terikat (ISAK 35). Saldo akhir akan menjadi saldo awal periode berikutnya. Periode akan dikunci dan proses ini tidak dapat dibatalkan.`}
        onConfirm={() => tutupBukuMutation.mutate()}
        confirmLabel="Ya, Tutup Buku"
        variant="destructive"
      />
    </div>
  );
}
