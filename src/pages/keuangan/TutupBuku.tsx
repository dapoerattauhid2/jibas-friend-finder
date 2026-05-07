import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useTahunAjaran, formatRupiah } from "@/hooks/useKeuangan";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, AlertTriangle, TrendingUp, TrendingDown, DollarSign, History, GraduationCap, Briefcase } from "lucide-react";
import { StatsCard } from "@/components/shared/StatsCard";

const UNIT_CONFIG = {
  unit_pendidikan: {
    label: "Unit Pendidikan",
    icon: GraduationCap,
    kategori: ["unit_pendidikan"] as string[],
    keterangan: "TK, SD, SMP, SMA, MTA, UMUM, dan KEPONDOKAN",
    unitKey: "unit_pendidikan",
  },
  unit_usaha_dana: {
    label: "Unit Usaha & Dana",
    icon: Briefcase,
    kategori: ["unit_usaha", "unit_dana_terikat", "unit_yayasan"] as string[],
    keterangan: "Selain unit pendidikan (Unit Usaha, Dana Terikat, Yayasan)",
    unitKey: "unit_usaha_dana",
  },
} as const;

type UnitKey = keyof typeof UNIT_CONFIG;

function TutupBukuPanel({ unitKey, tahunId }: { unitKey: UnitKey; tahunId: string }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const qc = useQueryClient();
  const cfg = UNIT_CONFIG[unitKey];

  const { data: taList } = useTahunAjaran();
  const selectedTA = taList?.find((t: any) => t.id === tahunId);

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

  const { data: logUnit } = useQuery({
    queryKey: ["log_tutup_buku_unit", tahunId, unitKey],
    enabled: !!tahunId,
    queryFn: async () => {
      const { data } = await supabase
        .from("log_tutup_buku" as any)
        .select("*")
        .eq("tahun_ajaran_id", tahunId)
        .eq("unit", cfg.unitKey)
        .order("tanggal_proses", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const sudahDitutup = !!logUnit;

  const { data: saldoAkun, isLoading } = useQuery({
    queryKey: ["saldo_akun_unit", tahunId, unitKey],
    enabled: !!tahunId && !!selectedTA && !sudahDitutup,
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

      const { data: mutasiRows, error: mutasiErr } = await (supabase as any).rpc(
        "hitung_saldo_akun_per_kategori",
        {
          p_tanggal_mulai: tahunMulai,
          p_tanggal_selesai: tahunSelesai,
          p_kategori: cfg.kategori,
        }
      );
      if (mutasiErr) throw mutasiErr;

      const mutasiMap: Record<string, { debit: number; kredit: number }> = {};
      for (const m of (mutasiRows as any[]) || []) {
        mutasiMap[m.akun_id] = {
          debit: Number(m.total_debit || 0),
          kredit: Number(m.total_kredit || 0),
        };
      }

      return akun
        .map((a) => {
          const m = mutasiMap[a.id] || { debit: 0, kredit: 0 };
          const saldoAwal = Number(a.saldo_awal || 0);
          const isDebit = a.saldo_normal === "D" || a.saldo_normal === "debit";
          const saldoAkhir = isDebit
            ? saldoAwal + m.debit - m.kredit
            : saldoAwal + m.kredit - m.debit;
          return {
            id: a.id, kode: a.kode, nama: a.nama, jenis: a.jenis,
            saldo_normal: a.saldo_normal, saldo_awal: saldoAwal,
            totalDebit: m.debit, totalKredit: m.kredit, saldoAkhir,
            _hasMutasi: m.debit !== 0 || m.kredit !== 0,
          };
        })
        .filter((a) => a._hasMutasi);
    },
  });

  const totalPendapatan = saldoAkun?.filter(a => a.jenis?.toLowerCase() === "pendapatan").reduce((s, a) => s + a.saldoAkhir, 0) || 0;
  const totalBeban = saldoAkun?.filter(a => a.jenis?.toLowerCase() === "beban").reduce((s, a) => s + Math.abs(a.saldoAkhir), 0) || 0;
  const labaRugi = totalPendapatan - totalBeban;
  const hasAkunEkuitas = !!akunAsetNeto?.akun_id;
  const isTADitutup = selectedTA?.ditutup === true;

  const tutupBukuMutation = useMutation({
    mutationFn: async () => {
      if (!saldoAkun?.length || !selectedTA) throw new Error("Data tidak lengkap");
      if (!hasAkunEkuitas) throw new Error("Akun Aset Neto Tidak Terikat belum dikonfigurasi. Atur di Keuangan → Referensi Keuangan → Pengaturan Akun.");

      const akunEkuitasId = akunAsetNeto.akun_id;
      const tahun = new Date(selectedTA.tanggal_selesai).getFullYear();
      const prefix = `TB-${unitKey === "unit_pendidikan" ? "PEND" : "USDA"}`;
      const { data: nomorJurnal } = await supabase.rpc("generate_nomor_jurnal", { p_prefix: prefix, p_tahun: tahun });

      const pendapatan = saldoAkun.filter(a => a.jenis?.toLowerCase() === "pendapatan" && a.saldoAkhir !== 0);
      const beban = saldoAkun.filter(a => a.jenis?.toLowerCase() === "beban" && a.saldoAkhir !== 0);
      let jurnalId: string | null = null;

      if (pendapatan.length > 0 || beban.length > 0 || labaRugi !== 0) {
        const totalDebitJurnal = pendapatan.reduce((s, a) => s + a.saldoAkhir, 0) + (labaRugi < 0 ? Math.abs(labaRugi) : 0);
        const totalKreditJurnal = beban.reduce((s, a) => s + a.saldoAkhir, 0) + (labaRugi > 0 ? labaRugi : 0);

        const { data: jurnal, error: jErr } = await supabase
          .from("jurnal")
          .insert({
            nomor: nomorJurnal || `${prefix}-${tahun}`,
            tanggal: selectedTA.tanggal_selesai,
            keterangan: `Jurnal Penutup ${cfg.label} — ${selectedTA.nama}`,
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
          for (const a of pendapatan) {
            detailRows.push({ jurnal_id: jurnalId, akun_id: a.id, keterangan: `Penutup ${a.nama}`, debit: a.saldoAkhir, kredit: 0, urutan: urutan++ });
          }
          for (const a of beban) {
            detailRows.push({ jurnal_id: jurnalId, akun_id: a.id, keterangan: `Penutup ${a.nama}`, debit: 0, kredit: a.saldoAkhir, urutan: urutan++ });
          }
          if (labaRugi > 0) {
            detailRows.push({ jurnal_id: jurnalId, akun_id: akunEkuitasId, keterangan: `Surplus ${cfg.label} — ${selectedTA.nama}`, debit: 0, kredit: labaRugi, urutan: urutan++ });
          } else if (labaRugi < 0) {
            detailRows.push({ jurnal_id: jurnalId, akun_id: akunEkuitasId, keterangan: `Defisit ${cfg.label} — ${selectedTA.nama}`, debit: Math.abs(labaRugi), kredit: 0, urutan: urutan++ });
          }
          if (detailRows.length > 0) await supabase.from("jurnal_detail").insert(detailRows);
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("log_tutup_buku" as any).insert({
        tahun_ajaran_id: selectedTA.id,
        user_id: user?.id,
        total_laba_rugi: labaRugi,
        jurnal_id: jurnalId,
        unit: cfg.unitKey,
        keterangan: `Tutup buku ${cfg.label} — ${selectedTA.nama}. Surplus/Defisit: ${formatRupiah(labaRugi)}`,
      });

      return selectedTA.nama;
    },
    onSuccess: (nama) => {
      qc.invalidateQueries({ queryKey: ["log_tutup_buku_unit", tahunId, unitKey] });
      qc.invalidateQueries({ queryKey: ["saldo_akun_unit", tahunId, unitKey] });
      qc.invalidateQueries({ queryKey: ["log_tutup_buku"] });
      toast.success(`Tutup buku ${cfg.label} — ${nama} berhasil.`);
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

  if (!tahunId) return null;

  if (sudahDitutup) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
        <CardContent className="pt-6 flex items-center gap-3">
          <Lock className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">{cfg.label} sudah ditutup untuk tahun ini.</p>
            <p className="text-muted-foreground">
              Diproses pada {new Date(logUnit.tanggal_proses).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}.
              Surplus/Defisit: {formatRupiah(Number(logUnit.total_laba_rugi))}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isTADitutup) {
    return (
      <Card className="border-muted">
        <CardContent className="pt-6 text-center text-muted-foreground">
          <Lock className="h-8 w-8 mx-auto mb-2" />
          <p>Tahun buku ini sudah ditutup sepenuhnya.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-muted">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{cfg.label}</span> mencakup: {cfg.keterangan}.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
      ) : saldoAkun && saldoAkun.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard title="Total Pendapatan" value={formatRupiah(totalPendapatan)} icon={TrendingUp} />
          <StatsCard title="Total Beban" value={formatRupiah(totalBeban)} icon={TrendingDown} />
          <StatsCard title={labaRugi >= 0 ? "Surplus" : "Defisit"} value={formatRupiah(Math.abs(labaRugi))} icon={DollarSign} />
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo Akun — {cfg.label}</CardTitle>
          <CardDescription>
            Hanya menampilkan akun yang memiliki transaksi di departemen {cfg.label.toLowerCase()}.
            {!isLoading && saldoAkun?.length === 0 && " Tidak ada transaksi ditemukan untuk unit ini."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40" /> : (
            <DataTable columns={columns} data={saldoAkun || []} exportable exportFilename={`tutup-buku-${unitKey}-${selectedTA?.nama}`} pageSize={50} />
          )}
        </CardContent>
      </Card>

      {!hasAkunEkuitas && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Akun Aset Neto Tidak Terikat Belum Dikonfigurasi</p>
              <p className="text-muted-foreground">Silakan atur di menu <strong>Keuangan → Referensi Keuangan → Pengaturan Akun</strong>.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="destructive"
          size="lg"
          onClick={() => setShowConfirm(true)}
          disabled={tutupBukuMutation.isPending || !saldoAkun?.length || !hasAkunEkuitas}
        >
          <Lock className="h-4 w-4 mr-2" />
          {tutupBukuMutation.isPending ? "Memproses..." : `Proses Tutup Buku — ${cfg.label}`}
        </Button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={`Konfirmasi Tutup Buku — ${cfg.label}`}
        description={`Anda yakin ingin menutup buku ${cfg.label} untuk tahun ${selectedTA?.nama}? Surplus/Defisit sebesar ${formatRupiah(labaRugi)} akan dipindahkan ke akun Aset Neto Tidak Terikat (ISAK 35). Proses ini tidak dapat dibatalkan.`}
        onConfirm={() => tutupBukuMutation.mutate()}
        confirmLabel={`Ya, Tutup Buku ${cfg.label}`}
        variant="destructive"
      />
    </>
  );
}

export default function TutupBuku() {
  const [tahunId, setTahunId] = useState("");
  const { data: taList } = useTahunAjaran();

  const { data: logHistory } = useQuery({
    queryKey: ["log_tutup_buku"],
    queryFn: async () => {
      const { data } = await supabase
        .from("log_tutup_buku" as any)
        .select("*")
        .order("tanggal_proses", { ascending: false })
        .limit(30);
      return (data || []) as any[];
    },
  });

  const logColumns: DataTableColumn<any>[] = [
    { key: "tanggal_proses", label: "Tanggal", render: (v) => new Date(v as string).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
    { key: "unit", label: "Unit", render: (v) => {
      if (v === "unit_pendidikan") return "Unit Pendidikan";
      if (v === "unit_usaha_dana") return "Unit Usaha & Dana";
      return v || "Semua Unit (legacy)";
    }},
    { key: "total_laba_rugi", label: "Surplus / Defisit", render: (v) => {
      const val = Number(v);
      return <span className={val < 0 ? "text-destructive" : "text-emerald-600"}>{formatRupiah(val)}</span>;
    }},
    { key: "keterangan", label: "Keterangan" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tutup Buku</h1>
        <p className="text-sm text-muted-foreground">Proses akhir tahun buku per unit — transfer surplus/defisit ke ekuitas dan kunci periode</p>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="pt-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning">Perhatian!</p>
            <p className="text-muted-foreground">
              Tutup buku dilakukan <strong>per unit secara terpisah</strong>. Unit Pendidikan dan Unit Usaha & Dana masing-masing menghasilkan jurnal penutup sendiri berdasarkan transaksi di departemen masing-masing. Setiap proses memindahkan surplus/defisit ke akun <strong>Aset Neto Tidak Terikat</strong> (ISAK 35) dan tidak dapat dibatalkan.
            </p>
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
                  <SelectItem key={t.id} value={t.id} disabled={t.ditutup}>
                    {t.nama} {t.aktif ? "(Aktif)" : ""} {t.ditutup ? "🔒 Sudah Ditutup" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {tahunId && (
        <Tabs defaultValue="unit_pendidikan" className="space-y-4">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="unit_pendidikan" className="flex-1 gap-2">
              <GraduationCap className="h-4 w-4" />
              Unit Pendidikan
            </TabsTrigger>
            <TabsTrigger value="unit_usaha_dana" className="flex-1 gap-2">
              <Briefcase className="h-4 w-4" />
              Unit Usaha & Dana
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unit_pendidikan" className="space-y-4">
            <TutupBukuPanel unitKey="unit_pendidikan" tahunId={tahunId} />
          </TabsContent>

          <TabsContent value="unit_usaha_dana" className="space-y-4">
            <TutupBukuPanel unitKey="unit_usaha_dana" tahunId={tahunId} />
          </TabsContent>
        </Tabs>
      )}

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
    </div>
  );
}
