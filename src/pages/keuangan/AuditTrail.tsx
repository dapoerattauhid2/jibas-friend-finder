import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { useLembaga, formatRupiah } from "@/hooks/useKeuangan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { FileText, TrendingUp, TrendingDown, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const now = new Date();

interface AuditRow {
  id: string;
  tipe: "penerimaan" | "pengeluaran";
  tanggal: string;
  jenis: string;
  siswa?: string;
  lembaga: string;
  jumlah: number;
  keterangan: string;
  jurnal_nomor?: string;
}

export default function AuditTrail() {
  const [departemenId, setDepartemenId] = useState("");
  const [tipeFilter, setTipeFilter] = useState<"semua" | "penerimaan" | "pengeluaran">("semua");
  const [tanggalDari, setTanggalDari] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"));
  const [tanggalSampai, setTanggalSampai] = useState(format(now, "yyyy-MM-dd"));

  const { data: lembagaList } = useLembaga();

  const { data, isLoading } = useQuery({
    queryKey: ["audit_trail", departemenId, tipeFilter, tanggalDari, tanggalSampai],
    queryFn: async () => {
      const rows: AuditRow[] = [];

      // Fetch pembayaran (penerimaan)
      if (tipeFilter === "semua" || tipeFilter === "penerimaan") {
        let q = supabase
          .from("pembayaran")
          .select("id, tanggal_bayar, jumlah, keterangan, bulan, jenis_pembayaran:jenis_id(nama), siswa:siswa_id(nama, nis), departemen:departemen_id(nama, kode), jurnal:jurnal_id(nomor)")
          .gte("tanggal_bayar", tanggalDari)
          .lte("tanggal_bayar", tanggalSampai)
          .order("tanggal_bayar", { ascending: false });
        if (departemenId) q = q.eq("departemen_id", departemenId);

        const { data: pData } = await q;
        (pData || []).forEach((r: any) => {
          rows.push({
            id: r.id,
            tipe: "penerimaan",
            tanggal: r.tanggal_bayar,
            jenis: r.jenis_pembayaran?.nama || "-",
            siswa: r.siswa ? `${r.siswa.nama} (${r.siswa.nis || "-"})` : "-",
            lembaga: r.departemen?.kode || "-",
            jumlah: Number(r.jumlah || 0),
            keterangan: r.keterangan || "-",
            jurnal_nomor: r.jurnal?.nomor,
          });
        });
      }

      // Fetch pengeluaran
      if (tipeFilter === "semua" || tipeFilter === "pengeluaran") {
        let q = supabase
          .from("pengeluaran")
          .select("id, tanggal, jumlah, keterangan, jenis_pengeluaran:jenis_id(nama), departemen:departemen_id(nama, kode), jurnal:jurnal_id(nomor)")
          .gte("tanggal", tanggalDari)
          .lte("tanggal", tanggalSampai)
          .order("tanggal", { ascending: false });
        if (departemenId) q = q.eq("departemen_id", departemenId);

        const { data: eData } = await q;
        ((eData || []) as any[]).forEach((r: any) => {
          rows.push({
            id: r.id,
            tipe: "pengeluaran",
            tanggal: r.tanggal,
            jenis: r.jenis_pengeluaran?.nama || "-",
            lembaga: r.departemen?.kode || "-",
            jumlah: Number(r.jumlah || 0),
            keterangan: r.keterangan || "-",
            jurnal_nomor: r.jurnal?.nomor,
          });
        });
      }

      // Sort by tanggal desc
      rows.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
      return rows;
    },
  });

  const totalPenerimaan = (data || []).filter((r) => r.tipe === "penerimaan").reduce((s, r) => s + r.jumlah, 0);
  const totalPengeluaran = (data || []).filter((r) => r.tipe === "pengeluaran").reduce((s, r) => s + r.jumlah, 0);

  const columns: DataTableColumn<AuditRow>[] = [
    {
      key: "tanggal", label: "Tanggal", sortable: true,
      render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-",
    },
    {
      key: "tipe", label: "Tipe",
      render: (v) => (
        <Badge variant="outline" className={v === "penerimaan" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-red-500/10 text-red-700 border-red-500/30"}>
          {v === "penerimaan" ? "Masuk" : "Keluar"}
        </Badge>
      ),
    },
    { key: "jenis", label: "Jenis", sortable: true },
    { key: "siswa", label: "Siswa", render: (v) => (v as string) || "-" },
    { key: "lembaga", label: "Lembaga", sortable: true },
    { key: "jumlah", label: "Jumlah", sortable: true, render: (v) => formatRupiah(Number(v)) },
    { key: "keterangan", label: "Keterangan" },
    {
      key: "jurnal_nomor", label: "No. Jurnal",
      render: (v) => v ? (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{v as string}</Badge>
      ) : <span className="text-muted-foreground text-xs">-</span>,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Trail Transaksi</h1>
        <p className="text-sm text-muted-foreground">Riwayat seluruh transaksi keuangan</p>
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
          <Label>Tipe</Label>
          <Select value={tipeFilter} onValueChange={(v) => setTipeFilter(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua</SelectItem>
              <SelectItem value="penerimaan">Penerimaan</SelectItem>
              <SelectItem value="pengeluaran">Pengeluaran</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Dari Tanggal</Label>
          <Input type="date" className="w-40" value={tanggalDari} onChange={(e) => setTanggalDari(e.target.value)} />
        </div>
        <div>
          <Label>Sampai Tanggal</Label>
          <Input type="date" className="w-40" value={tanggalSampai} onChange={(e) => setTanggalSampai(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard title="Total Penerimaan" value={formatRupiah(totalPenerimaan)} icon={TrendingUp} color="success" />
        <StatsCard title="Total Pengeluaran" value={formatRupiah(totalPengeluaran)} icon={TrendingDown} color="destructive" />
        <StatsCard title="Total Transaksi" value={data?.length || 0} icon={ArrowRightLeft} color="info" />
      </div>

      <Card>
        <CardHeader><CardTitle>Log Transaksi</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={data || []}
            loading={isLoading}
            exportable
            exportFilename="audit_trail_keuangan"
            pageSize={25}
          />
        </CardContent>
      </Card>
    </div>
  );
}
