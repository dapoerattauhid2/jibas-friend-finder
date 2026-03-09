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
import { TrendingDown, FileText } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const now = new Date();

export default function LaporanPengeluaran() {
  const [departemenId, setDepartemenId] = useState("");
  const [tahun, setTahun] = useState(now.getFullYear());
  const [bulanDari, setBulanDari] = useState(1);
  const [bulanSampai, setBulanSampai] = useState(now.getMonth() + 1);

  const { data: lembagaList } = useLembaga();

  const { data, isLoading } = useQuery({
    queryKey: ["laporan_pengeluaran_jenis", departemenId, tahun, bulanDari, bulanSampai],
    queryFn: async () => {
      const startDate = `${tahun}-${String(bulanDari).padStart(2, "0")}-01`;
      const endMonth = bulanSampai === 12 ? 1 : bulanSampai + 1;
      const endYear = bulanSampai === 12 ? tahun + 1 : tahun;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      let q = supabase
        .from("pengeluaran")
        .select("id, tanggal, jumlah, keterangan, jenis_pengeluaran:jenis_id(id, nama), departemen:departemen_id(nama, kode)")
        .gte("tanggal", startDate)
        .lt("tanggal", endDate)
        .order("tanggal", { ascending: false });

      if (departemenId) q = q.eq("departemen_id", departemenId);

      const { data: rows, error } = await q;
      if (error) throw error;
      return (rows || []) as any[];
    },
  });

  // Group by jenis
  const grouped = (data || []).reduce((acc: Record<string, { nama: string; total: number; count: number; items: any[] }>, r: any) => {
    const jenisNama = r.jenis_pengeluaran?.nama || "Tanpa Jenis";
    const jenisId = r.jenis_pengeluaran?.id || "none";
    if (!acc[jenisId]) acc[jenisId] = { nama: jenisNama, total: 0, count: 0, items: [] };
    acc[jenisId].total += Number(r.jumlah || 0);
    acc[jenisId].count += 1;
    acc[jenisId].items.push(r);
    return acc;
  }, {});

  const summaryData = Object.entries(grouped)
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = summaryData.reduce((s, r) => s + r.total, 0);
  const totalTrx = data?.length || 0;

  const bulanNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

  const summaryColumns: DataTableColumn<any>[] = [
    { key: "nama", label: "Jenis Pengeluaran", sortable: true },
    { key: "count", label: "Jumlah Transaksi", sortable: true },
    { key: "total", label: "Total Nominal", sortable: true, render: (v) => formatRupiah(Number(v)) },
    {
      key: "persen", label: "% dari Total",
      render: (_, r) => grandTotal > 0 ? `${((r.total / grandTotal) * 100).toFixed(1)}%` : "0%",
    },
  ];

  const detailColumns: DataTableColumn<any>[] = [
    { key: "tanggal", label: "Tanggal", sortable: true, render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "jenis", label: "Jenis", render: (_, r) => r.jenis_pengeluaran?.nama || "-" },
    { key: "departemen", label: "Lembaga", render: (_, r) => r.departemen?.kode || "-" },
    { key: "jumlah", label: "Jumlah", sortable: true, render: (v) => formatRupiah(Number(v)) },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Laporan Pengeluaran per Jenis</h1>
        <p className="text-sm text-muted-foreground">Ringkasan pengeluaran dikelompokkan berdasarkan jenis</p>
      </div>

      {/* Filter */}
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

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatsCard title="Total Pengeluaran" value={formatRupiah(grandTotal)} icon={TrendingDown} color="destructive" />
        <StatsCard title="Jumlah Transaksi" value={totalTrx} icon={FileText} color="info" />
      </div>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan per Jenis</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={summaryColumns} data={summaryData} loading={isLoading} exportable exportFilename="ringkasan_pengeluaran" pageSize={20} />
        </CardContent>
      </Card>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detail Transaksi</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={detailColumns} data={data || []} loading={isLoading} exportable exportFilename="detail_pengeluaran" pageSize={20} />
        </CardContent>
      </Card>
    </div>
  );
}
