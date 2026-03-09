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
import { Lock, AlertTriangle } from "lucide-react";

export default function TutupBuku() {
  const [tahunId, setTahunId] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const qc = useQueryClient();

  const { data: taList } = useTahunAjaran();

  const selectedTA = taList?.find((t: any) => t.id === tahunId);

  // Get all accounts with calculated balances for the selected year
  const { data: saldoAkun, isLoading } = useQuery({
    queryKey: ["saldo_akun_tutup_buku", tahunId],
    enabled: !!tahunId && !!selectedTA,
    queryFn: async () => {
      const tahunMulai = selectedTA?.tanggal_mulai;
      const tahunSelesai = selectedTA?.tanggal_selesai;
      if (!tahunMulai || !tahunSelesai) return [];

      // Get all accounts
      const { data: akun } = await supabase
        .from("akun_rekening")
        .select("id, kode, nama, jenis, saldo_normal, saldo_awal")
        .eq("aktif", true)
        .order("kode");

      if (!akun?.length) return [];

      // Get all journal details within the period
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

  const tutupBukuMutation = useMutation({
    mutationFn: async () => {
      if (!saldoAkun?.length || !selectedTA) throw new Error("Data tidak lengkap");

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

      // Separate revenue/expense accounts for closing
      const pendapatan = saldoAkun.filter(a => a.jenis === "Pendapatan" && a.saldoAkhir !== 0);
      const beban = saldoAkun.filter(a => a.jenis === "Beban" && a.saldoAkhir !== 0);
      const labaRugi = pendapatan.reduce((s, a) => s + a.saldoAkhir, 0) - beban.reduce((s, a) => s + a.saldoAkhir, 0);

      if (pendapatan.length > 0 || beban.length > 0) {
        const { data: jurnal, error: jErr } = await supabase
          .from("jurnal")
          .insert({
            nomor: nomorJurnal || `TB-${tahun}`,
            tanggal: selectedTA.tanggal_selesai,
            keterangan: `Jurnal Penutup Tahun Buku ${selectedTA.nama}`,
            status: "posted",
            total_debit: pendapatan.reduce((s, a) => s + a.saldoAkhir, 0) + beban.reduce((s, a) => s + a.saldoAkhir, 0),
            total_kredit: pendapatan.reduce((s, a) => s + a.saldoAkhir, 0) + beban.reduce((s, a) => s + a.saldoAkhir, 0),
          })
          .select()
          .single();

        if (!jErr && jurnal) {
          const details: any[] = [];
          let urutan = 1;

          // Close revenue accounts (debit pendapatan)
          for (const a of pendapatan) {
            details.push({
              jurnal_id: jurnal.id,
              akun_id: a.id,
              keterangan: `Penutup ${a.nama}`,
              debit: a.saldoAkhir,
              kredit: 0,
              urutan: urutan++,
            });
          }

          // Close expense accounts (kredit beban)
          for (const a of beban) {
            details.push({
              jurnal_id: jurnal.id,
              akun_id: a.id,
              keterangan: `Penutup ${a.nama}`,
              debit: 0,
              kredit: a.saldoAkhir,
              urutan: urutan++,
            });
          }

          if (details.length > 0) {
            await supabase.from("jurnal_detail").insert(details);
          }
        }
      }

      // 3. Deactivate the tahun ajaran
      await supabase.from("tahun_ajaran").update({ aktif: false }).eq("id", selectedTA.id);

      return selectedTA.nama;
    },
    onSuccess: (nama) => {
      qc.invalidateQueries({ queryKey: ["tahun_ajaran"] });
      qc.invalidateQueries({ queryKey: ["saldo_akun_tutup_buku"] });
      toast.success(`Tutup buku ${nama} berhasil. Saldo awal telah diperbarui.`);
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

  const totalSaldoAkhir = saldoAkun?.reduce((s, a) => s + a.saldoAkhir, 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tutup Buku</h1>
        <p className="text-sm text-muted-foreground">Proses akhir tahun buku — hitung saldo akhir dan generate jurnal penutup</p>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning">Perhatian!</p>
            <p className="text-muted-foreground">Proses tutup buku akan mengubah saldo awal setiap akun rekening dan membuat jurnal penutup. Proses ini tidak dapat dibatalkan.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="max-w-md">
            <Label>Pilih Tahun Buku</Label>
            <Select value={tahunId} onValueChange={setTahunId}>
              <SelectTrigger><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
              <SelectContent>
                {taList?.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nama} {t.aktif ? "(Aktif)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {tahunId && (
        <>
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
              disabled={tutupBukuMutation.isPending || !saldoAkun?.length}
            >
              <Lock className="h-4 w-4 mr-2" />
              {tutupBukuMutation.isPending ? "Memproses..." : "Proses Tutup Buku"}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Konfirmasi Tutup Buku"
        description={`Anda yakin ingin menutup buku untuk tahun ${selectedTA?.nama}? Saldo akhir akan menjadi saldo awal periode berikutnya. Proses ini tidak dapat dibatalkan.`}
        onConfirm={() => tutupBukuMutation.mutate()}
        confirmText="Ya, Tutup Buku"
        variant="destructive"
      />
    </div>
  );
}
