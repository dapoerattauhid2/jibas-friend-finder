import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatRupiah } from "@/hooks/useKeuangan";
import { toast } from "sonner";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  Link2, Link2Off, CheckCircle2, AlertTriangle,
  RefreshCw, Building2, ArrowLeftRight, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────
interface SaldoRekon {
  kode: string;
  akun_nama: string;
  departemen_id: string;
  departemen: string;
  total_debit: number;
  total_kredit: number;
  saldo_neto: number;
}

interface JurnalBelumMatch {
  akun_kode: string;
  jurnal_id: string;
  nomor: string;
  tanggal: string;
  keterangan: string;
  departemen_id: string;
  departemen: string;
  debit: number;
  kredit: number;
  net: number;
}

interface KandidatPasangan {
  jurnal_id: string;
  nomor: string;
  tanggal: string;
  keterangan: string;
  departemen: string;
  debit: number;
  kredit: number;
  net: number;
  skor_kecocokan: number;
}

// ─── Main Component ──────────────────────────────────────────
export default function RekonsiliasiAntarLembaga() {
  const [filterAkun, setFilterAkun] = useState<"1901" | "1902" | "semua">("semua");
  const [filterDept, setFilterDept] = useState("");
  const [selectedJurnal, setSelectedJurnal] = useState<JurnalBelumMatch | null>(null);
  const [selectedKandidat, setSelectedKandidat] = useState<KandidatPasangan | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const qc = useQueryClient();

  // ─── Data: Saldo per departemen
  const { data: saldoList, isLoading: loadSaldo } = useQuery({
    queryKey: ["rekon_saldo", filterAkun],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_rekon_antar_lembaga" as any)
        .select("*");
      if (error) throw error;
      return (data || []) as SaldoRekon[];
    },
  });

  // ─── Data: Jurnal belum match
  const { data: belumMatchList, isLoading: loadBelum } = useQuery({
    queryKey: ["rekon_belum_match", filterAkun, filterDept],
    queryFn: async () => {
      let q = (supabase.from("v_rekon_belum_match" as any).select("*") as any)
        .order("tanggal", { ascending: false });
      if (filterAkun !== "semua") q = q.eq("akun_kode", filterAkun);
      if (filterDept) q = q.eq("departemen_id", filterDept);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as JurnalBelumMatch[];
    },
  });

  // ─── Data: Kandidat pasangan untuk jurnal terpilih
  const { data: kandidatList, isLoading: loadKandidat } = useQuery({
    queryKey: ["rekon_kandidat", selectedJurnal?.jurnal_id],
    enabled: !!selectedJurnal,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_cari_kandidat_pasangan" as any, {
        p_jurnal_id: selectedJurnal!.jurnal_id,
        p_akun_kode: selectedJurnal!.akun_kode,
        p_hari_toleransi: 14,
      });
      if (error) throw error;
      return (data || []) as KandidatPasangan[];
    },
  });

  // ─── Data: Pasangan yang sudah di-match
  const { data: pasanganList, isLoading: loadPasangan } = useQuery({
    queryKey: ["rekon_pasangan"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("jurnal_pasangan" as any).select(`
        *,
        jurnal_a:jurnal_id_a(nomor, tanggal, keterangan, departemen:departemen_id(nama)),
        jurnal_b:jurnal_id_b(nomor, tanggal, keterangan, departemen:departemen_id(nama))
      `) as any).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // ─── Mutation: Simpan pasangan
  const savePasangan = useMutation({
    mutationFn: async () => {
      if (!selectedJurnal || !selectedKandidat) throw new Error("Pilih jurnal dan kandidat");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase.from("jurnal_pasangan" as any).insert({
        jurnal_id_a: selectedJurnal.jurnal_id,
        jurnal_id_b: selectedKandidat.jurnal_id,
        akun_kode: selectedJurnal.akun_kode,
        jumlah: Math.abs(selectedJurnal.net),
        keterangan: `${selectedJurnal.departemen} ↔ ${selectedKandidat.departemen}`,
        dibuat_oleh: user?.id,
      }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pasangan berhasil disimpan! Jurnal ini sudah ter-rekon.");
      qc.invalidateQueries({ queryKey: ["rekon_belum_match"] });
      qc.invalidateQueries({ queryKey: ["rekon_pasangan"] });
      qc.invalidateQueries({ queryKey: ["rekon_kandidat"] });
      setSelectedJurnal(null);
      setSelectedKandidat(null);
      setConfirmOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Mutation: Auto Match (1-klik, pakai fn_match_jurnal_pasangan)
  const autoMatch = useMutation({
    mutationFn: async (row: JurnalBelumMatch) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("fn_match_jurnal_pasangan" as any, {
        p_jurnal_id: row.jurnal_id,
        p_akun_kode: row.akun_kode,
        p_user_id: user?.id ?? null,
        p_hari_toleransi: 14,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.ok) throw new Error(result?.pesan || "Gagal auto-match");
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        `✅ ${result.nomor_pasangan} (${result.departemen}) · Rp ${Number(result.jumlah).toLocaleString("id-ID")} · Skor ${result.skor}`
      );
      qc.invalidateQueries({ queryKey: ["rekon_belum_match"] });
      qc.invalidateQueries({ queryKey: ["rekon_pasangan"] });
      qc.invalidateQueries({ queryKey: ["rekon_saldo"] });
      if (selectedJurnal?.jurnal_id === result.jurnal_id_a) {
        setSelectedJurnal(null);
        setSelectedKandidat(null);
      }
    },
    onError: (e: any) => toast.error(`Auto-match gagal: ${e.message}`),
  });

  // ─── Mutation: Hapus pasangan
  const deletePasangan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("jurnal_pasangan" as any).delete().eq("id", id) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pasangan dihapus");
      qc.invalidateQueries({ queryKey: ["rekon_belum_match"] });
      qc.invalidateQueries({ queryKey: ["rekon_pasangan"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ─── Computed stats
  const filtered = useMemo(() => {
    if (!saldoList) return [];
    if (filterAkun === "semua") return saldoList;
    return saldoList.filter(s => s.kode === filterAkun);
  }, [saldoList, filterAkun]);

  const totalKonsolidasi1901 = saldoList
    ?.filter(s => s.kode === "1901")
    .reduce((sum, s) => sum + Number(s.saldo_neto), 0) || 0;
  const totalKonsolidasi1902 = saldoList
    ?.filter(s => s.kode === "1902")
    .reduce((sum, s) => sum + Number(s.saldo_neto), 0) || 0;
  const totalBelumMatch = belumMatchList?.length || 0;
  const totalSudahMatch = pasanganList?.length || 0;

  // ─── Unique departemen dari belum match
  const deptOptions = useMemo(() => {
    if (!belumMatchList) return [];
    const seen = new Map<string, string>();
    belumMatchList.forEach(r => {
      if (r.departemen_id) seen.set(r.departemen_id, r.departemen);
    });
    return Array.from(seen, ([id, nama]) => ({ id, nama }));
  }, [belumMatchList]);

  // ─── Columns: Saldo per departemen
  const saldoColumns: DataTableColumn<any>[] = [
    { key: "kode", label: "Akun", render: (v) => <span className="font-mono font-semibold">{v as string}</span> },
    { key: "akun_nama", label: "Nama Akun" },
    { key: "departemen", label: "Departemen" },
    { key: "total_debit", label: "Total Debit", render: (v) => formatRupiah(Number(v)) },
    { key: "total_kredit", label: "Total Kredit", render: (v) => formatRupiah(Number(v)) },
    {
      key: "saldo_neto", label: "Saldo Neto",
      render: (v) => {
        const val = Number(v);
        const isZero = Math.abs(val) < 1;
        return (
          <span className={cn(
            "font-bold",
            isZero ? "text-emerald-600" : val > 0 ? "text-blue-600" : "text-destructive"
          )}>
            {isZero ? "✓ 0" : formatRupiah(val)}
          </span>
        );
      }
    },
  ];

  // ─── Columns: Belum match
  const belumMatchColumns: DataTableColumn<any>[] = [
    {
      key: "akun_kode", label: "Akun",
      render: (v) => (
        <Badge variant="outline" className={v === "1901" ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-purple-50 text-purple-700 border-purple-300"}>
          {v as string}
        </Badge>
      )
    },
    { key: "nomor", label: "No. Jurnal", render: (v) => <span className="font-mono text-xs">{v as string}</span> },
    { key: "tanggal", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "departemen", label: "Departemen" },
    {
      key: "net", label: "Net (D-K)",
      render: (v) => {
        const val = Number(v);
        return <span className={val > 0 ? "text-blue-600 font-semibold" : "text-destructive font-semibold"}>{formatRupiah(val)}</span>;
      }
    },
    { key: "keterangan", label: "Keterangan", render: (v) => <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{v as string}</span> },
    {
      key: "_aksi", label: "",
      render: (_, r) => {
        const isAutoLoading = autoMatch.isPending && (autoMatch.variables as JurnalBelumMatch)?.jurnal_id === r.jurnal_id;
        return (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
              disabled={autoMatch.isPending}
              onClick={(e) => { e.stopPropagation(); autoMatch.mutate(r as JurnalBelumMatch); }}
            >
              {isAutoLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Auto
            </Button>
            <Button
              size="sm"
              variant={selectedJurnal?.jurnal_id === r.jurnal_id ? "default" : "outline"}
              className="text-xs h-7"
              onClick={() => {
                setSelectedJurnal(selectedJurnal?.jurnal_id === r.jurnal_id ? null : r as JurnalBelumMatch);
                setSelectedKandidat(null);
              }}
            >
              {selectedJurnal?.jurnal_id === r.jurnal_id ? "✓ Dipilih" : "Manual"}
            </Button>
          </div>
        );
      },
    },
  ];

  // ─── Columns: Kandidat pasangan
  const kandidatColumns: DataTableColumn<any>[] = [
    {
      key: "skor_kecocokan", label: "Skor",
      render: (v) => {
        const skor = Number(v);
        return (
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={cn("h-2 w-2 rounded-full", i <= skor ? "bg-emerald-500" : "bg-muted")} />
            ))}
          </div>
        );
      }
    },
    { key: "nomor", label: "No. Jurnal", render: (v) => <span className="font-mono text-xs">{v as string}</span> },
    { key: "tanggal", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "departemen", label: "Departemen" },
    { key: "net", label: "Net", render: (v) => <span className="font-semibold">{formatRupiah(Number(v))}</span> },
    { key: "keterangan", label: "Keterangan", render: (v) => <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{v as string}</span> },
    {
      key: "_pilih", label: "",
      render: (_, r) => (
        <Button
          size="sm"
          variant={selectedKandidat?.jurnal_id === r.jurnal_id ? "default" : "outline"}
          className="text-xs h-7"
          onClick={() => setSelectedKandidat(selectedKandidat?.jurnal_id === r.jurnal_id ? null : r as KandidatPasangan)}
        >
          {selectedKandidat?.jurnal_id === r.jurnal_id ? "✓ Dipilih" : "Pilih"}
        </Button>
      ),
    },
  ];

  // ─── Columns: Sudah match
  const pasanganColumns: DataTableColumn<any>[] = [
    { key: "akun_kode", label: "Akun", render: (v) => <Badge variant="outline">{v as string}</Badge> },
    {
      key: "jurnal_a", label: "Jurnal A",
      render: (_, r) => (
        <div className="text-xs">
          <p className="font-mono">{(r as any).jurnal_a?.nomor}</p>
          <p className="text-muted-foreground">{(r as any).jurnal_a?.departemen?.nama}</p>
        </div>
      )
    },
    {
      key: "_arrow", label: "",
      render: () => <ArrowLeftRight className="h-4 w-4 text-muted-foreground mx-auto" />
    },
    {
      key: "jurnal_b", label: "Jurnal B",
      render: (_, r) => (
        <div className="text-xs">
          <p className="font-mono">{(r as any).jurnal_b?.nomor}</p>
          <p className="text-muted-foreground">{(r as any).jurnal_b?.departemen?.nama}</p>
        </div>
      )
    },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    {
      key: "_hapus", label: "",
      render: (_, r) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive h-7 text-xs"
          onClick={() => deletePasangan.mutate((r as any).id)}
          disabled={deletePasangan.isPending}
        >
          Hapus
        </Button>
      )
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rekonsiliasi Antar Lembaga / Bagian</h1>
        <p className="text-sm text-muted-foreground">
          Pasangkan jurnal akun 1901 & 1902 antar departemen agar saldo konsolidasi = 0
        </p>
      </div>

      {/* Info banner */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <CardContent className="pt-4 pb-4 flex items-start gap-3 text-sm">
          <ArrowLeftRight className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-blue-800 dark:text-blue-300">
            <strong>Cara kerja:</strong> Akun 1901 & 1902 bersifat <em>reciprocal</em> — debit di departemen A = kredit di departemen B.
            Laporan per-departemen menampilkan saldo masing-masing, tapi laporan <strong>konsolidasi yayasan otomatis mengeliminasi</strong> akun ini sehingga saldo = 0.
            Gunakan fitur ini untuk mencocokkan pasangan jurnal yang belum ter-rekon.
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Selisih Konsolidasi 1901"
          value={formatRupiah(Math.abs(totalKonsolidasi1901))}
          icon={totalKonsolidasi1901 === 0 ? CheckCircle2 : AlertTriangle}
          color={totalKonsolidasi1901 === 0 ? "success" : "destructive"}
        />
        <StatsCard
          title="Selisih Konsolidasi 1902"
          value={formatRupiah(Math.abs(totalKonsolidasi1902))}
          icon={totalKonsolidasi1902 === 0 ? CheckCircle2 : AlertTriangle}
          color={totalKonsolidasi1902 === 0 ? "success" : "destructive"}
        />
        <StatsCard
          title="Belum Dipasangkan"
          value={totalBelumMatch}
          icon={Link2Off}
          color="warning"
        />
        <StatsCard
          title="Sudah Dipasangkan"
          value={totalSudahMatch}
          icon={Link2}
          color="success"
        />
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label>Filter Akun</Label>
          <Select value={filterAkun} onValueChange={(v) => setFilterAkun(v as any)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Akun</SelectItem>
              <SelectItem value="1901">1901 — Antar Lembaga</SelectItem>
              <SelectItem value="1902">1902 — Antar Bagian</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Filter Departemen</Label>
          <Select value={filterDept || "__all__"} onValueChange={(v) => setFilterDept(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Semua Departemen</SelectItem>
              {deptOptions.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Saldo per Departemen */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Saldo Akun 1901 & 1902 per Departemen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={saldoColumns}
            data={filtered}
            loading={loadSaldo}
            pageSize={20}
            exportable
            exportFilename="saldo-rekon-antar-lembaga"
          />
        </CardContent>
      </Card>

      {/* Panel Rekonsiliasi Manual */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Kiri: Jurnal Belum Match */}
        <Card className={cn(selectedJurnal && "ring-2 ring-primary/30")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2Off className="h-4 w-4 text-destructive" />
              Jurnal Belum Dipasangkan
              <Badge variant="destructive" className="ml-auto">{totalBelumMatch}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedJurnal && (
              <div className="mb-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
                <p className="font-semibold text-primary">Dipilih: {selectedJurnal.nomor}</p>
                <p className="text-muted-foreground text-xs">{selectedJurnal.departemen} · {selectedJurnal.keterangan}</p>
                <p className="text-xs mt-1">Net: <span className="font-bold">{formatRupiah(selectedJurnal.net)}</span></p>
              </div>
            )}
            <DataTable
              columns={belumMatchColumns}
              data={belumMatchList || []}
              loading={loadBelum}
              pageSize={10}
            />
          </CardContent>
        </Card>

        {/* Kanan: Kandidat Pasangan */}
        <Card className={cn(!selectedJurnal && "opacity-50 pointer-events-none")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-warning" />
              Kandidat Pasangan
              {selectedJurnal && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  untuk {selectedJurnal.nomor} · {selectedJurnal.departemen}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedJurnal ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Pilih jurnal di sebelah kiri untuk melihat kandidat pasangan
              </div>
            ) : loadKandidat ? (
              <div className="py-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Mencari kandidat...
              </div>
            ) : !kandidatList?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-warning" />
                Tidak ada kandidat pasangan ditemukan.
                <br />Kemungkinan jurnal pasangan belum diinput atau keterangan berbeda.
              </div>
            ) : (
              <>
                <DataTable
                  columns={kandidatColumns}
                  data={kandidatList}
                  loading={false}
                  pageSize={10}
                />
                {selectedKandidat && (
                  <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      Akan dipasangkan:
                    </p>
                    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                      <span>{selectedJurnal.nomor} ({selectedJurnal.departemen})</span>
                      <ArrowLeftRight className="h-3 w-3" />
                      <span>{selectedKandidat.nomor} ({selectedKandidat.departemen})</span>
                    </div>
                    <p className="text-xs mt-1">Jumlah: <strong>{formatRupiah(Math.abs(selectedJurnal.net))}</strong></p>
                    <Button
                      className="mt-2 w-full"
                      size="sm"
                      onClick={() => setConfirmOpen(true)}
                      disabled={savePasangan.isPending}
                    >
                      <Link2 className="h-3.5 w-3.5 mr-1.5" />
                      Simpan Pasangan
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pasangan yang sudah match */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Pasangan Jurnal Sudah Ter-Rekon
            <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-300">{totalSudahMatch}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={pasanganColumns}
            data={pasanganList || []}
            loading={loadPasangan}
            pageSize={10}
            exportable
            exportFilename="pasangan-jurnal-rekon"
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Konfirmasi Pasangan Jurnal"
        description={`Pasangkan jurnal ${selectedJurnal?.nomor} (${selectedJurnal?.departemen}) dengan ${selectedKandidat?.nomor} (${selectedKandidat?.departemen}) untuk akun ${selectedJurnal?.akun_kode}? Jumlah: ${formatRupiah(Math.abs(selectedJurnal?.net || 0))}`}
        onConfirm={() => savePasangan.mutate()}
        loading={savePasangan.isPending}
      />
    </div>
  );
}
