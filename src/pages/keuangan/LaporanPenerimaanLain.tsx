import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { useLembaga, formatRupiah } from "@/hooks/useKeuangan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, FileText } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const now = new Date();

export default function LaporanPenerimaanLain() {
  const [departemenId, setDepartemenId] = useState("");
  const [tahun, setTahun] = useState(now.getFullYear());
  const [bulanDari, setBulanDari] = useState(1);
  const [bulanSampai, setBulanSampai] = useState(now.getMonth() + 1);

  const { data: lembagaList } = useLembaga();

  // Get jenis pembayaran to identify non-SPP types
  const { data: jenisList } = useQuery({
    queryKey: ["jenis_pembayaran_all_for_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jenis_pembayaran")
        .select("id, nama")
        .order("nama");
      if (error) throw error;
      return data || [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["laporan_penerimaan_lain", departemenId, tahun, bulanDari, bulanSampai],
    queryFn: async () => {
      const startDate = `${tahun}-${String(bulanDari).padStart(2, "0")}-01`;
      const endMonth = bulanSampai === 12 ? 1 : bulanSampai + 1;
      const endYear = bulanSampai === 12 ? tahun + 1 : tahun;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      let q = supabase
        .from("pembayaran")
        .select("id, tanggal_bayar, jumlah, bulan, keterangan, jenis_pembayaran:jenis_id(id, nama), siswa:siswa_id(nama, nis), departemen:departemen_id(nama, kode)")
        .gte("tanggal_bayar", startDate)
        .lt("tanggal_bayar", endDate)
        .order("tanggal_bayar", { ascending: false });

      if (departemenId) q = q.eq("departemen_id", departemenId);

      const { data: rows, error } = await q;
      if (error) throw error;

      // Filter non-SPP: exclude items where jenis nama contains "SPP" (case insensitive)
      return ((rows || []) as any[]).filter((r: any) => {
        const nama = r.jenis_pembayaran?.nama?.toLowerCase() || "";
        return !nama.includes("spp");
      });
    },
  });

  // Group by jenis
  const grouped = (data || []).reduce((acc: Record<string, { nama: string; total: number; count: number }>, r: any) => {
    const jenisNama = r.jenis_pembayaran?.nama || "Tanpa Jenis";
    const jenisId = r.jenis_pembayaran?.id || "none";
    if (!acc[jenisId]) acc[jenisId] = { nama: jenisNama, total: 0, count: 0 };
    acc[jenisId].total += Number(r.jumlah || 0);
    acc[jenisId].count += 1;
    return acc;
  }, {});

  const summaryData = Object.entries(grouped)
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = summaryData.reduce((s, r) => s + r.total, 0);

  const bulanNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

  const summaryColumns: DataTableColumn<any>[] = [
    { key: "nama", label: "Jenis Penerimaan", sortable: true },
    { key: "count", label: "Jumlah Transaksi", sortable: true },
    { key: "total", label: "Total Nominal", sortable: true, render: (v) => formatRupiah(Number(v)) },
    {
      key: "persen", label: "% dari Total",
      render: (_, r) => grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(1)}%` : "0%",
    },
  ];

  const detailColumns: DataTableColumn<any>[] = [
    { key: "tanggal_bayar", label: "Tanggal", sortable: true, render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "siswa", label: "Siswa", render: (_, r) => r.siswa ? `${r.siswa.nama} (${r.siswa.nis || "-"})` : "-" },
    { key: "jenis", label: "Jenis", render: (_, r) => r.jenis_pembayaran?.nama || "-" },
    { key: "departemen", label: "Lembaga", render: (_, r) => r.departemen?.kode || "-" },
    { key: "jumlah", label: "Jumlah", sortable: true, render: (v) => formatRupiah(Number(v)) },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Laporan Penerimaan Lain</h1>
        <p className="text-sm text-muted-foreground">Penerimaan selain SPP (pendaftaran, uang pangkal, dll)</p>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label>Lembaga</Label>
          <Select value={departemenId || "__all__"} onValueChange={(v) => setDepartemenId(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Semua Lembaga</SelectItem>
              {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Dari Bulan</Label>
          <Select value={String(bulanDari)} onValueChange={(v) => setBulanDari(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {bulanNames.map((b, i) => <SelectItem key={i} value={String(i + 1)}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Sampai Bulan</Label>
          <Select value={String(bulanSampai)} onValueChange={(v) => setBulanSampai(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {bulanNames.map((b, i) => <SelectItem key={i} value={String(i + 1)}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-24" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatsCard title="Total Penerimaan Lain" value={formatRupiah(grandTotal)} icon={TrendingUp} color="success" />
        <StatsCard title="Jumlah Transaksi" value={data?.length || 0} icon={FileText} color="info" />
      </div>

      <Card>
        <CardHeader><CardTitle>Ringkasan per Jenis</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={summaryColumns} data={summaryData} loading={isLoading} exportable exportFilename="ringkasan_penerimaan_lain" pageSize={20} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Detail Transaksi</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={detailColumns} data={data || []} loading={isLoading} exportable exportFilename="detail_penerimaan_lain" pageSize={20} />
        </CardContent>
      </Card>
    </div>
  );
}
