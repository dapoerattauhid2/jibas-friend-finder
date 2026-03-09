import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCard } from "@/components/shared/StatsCard";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { useLembaga, formatRupiah } from "@/hooks/useKeuangan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function RekapHarian() {
  const [tanggal, setTanggal] = useState(format(new Date(), "yyyy-MM-dd"));
  const [departemenId, setDepartemenId] = useState("all");

  const { data: lembagaList } = useLembaga();

  const { data, isLoading } = useQuery({
    queryKey: ["rekap_harian", tanggal, departemenId],
    queryFn: async () => {
      // Fetch pembayaran
      let qP = supabase
        .from("pembayaran")
        .select("id, jumlah, tanggal_bayar, keterangan, bulan, jenis_pembayaran:jenis_id(nama), siswa:siswa_id(nama, nis)")
        .eq("tanggal_bayar", tanggal);
      if (departemenId !== "all") qP = qP.eq("departemen_id", departemenId);
      const { data: penerimaan } = await qP;

      // Fetch pengeluaran
      let qE = supabase
        .from("pengeluaran")
        .select("id, jumlah, tanggal, keterangan, jenis_pengeluaran:jenis_id(nama)")
        .eq("tanggal", tanggal);
      if (departemenId !== "all") qE = qE.eq("departemen_id", departemenId);
      const { data: pengeluaran } = await qE;

      const totalMasuk = (penerimaan || []).reduce((s, r) => s + Number(r.jumlah || 0), 0);
      const totalKeluar = ((pengeluaran || []) as any[]).reduce((s: number, r: any) => s + Number(r.jumlah || 0), 0);

      return {
        penerimaan: (penerimaan || []) as any[],
        pengeluaran: (pengeluaran || []) as any[],
        totalMasuk,
        totalKeluar,
        saldo: totalMasuk - totalKeluar,
      };
    },
  });

  const colPenerimaan: DataTableColumn<any>[] = [
    { key: "siswa", label: "Siswa", render: (_, r) => `${r.siswa?.nama || "-"} (${r.siswa?.nis || "-"})` },
    { key: "jenis", label: "Jenis", render: (_, r) => r.jenis_pembayaran?.nama || "-" },
    { key: "bulan", label: "Bulan", render: (v) => {
      const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
      return BULAN[(v as number) - 1] || "-";
    }},
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
  ];

  const colPengeluaran: DataTableColumn<any>[] = [
    { key: "jenis", label: "Jenis", render: (_, r) => r.jenis_pengeluaran?.nama || "-" },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
  ];

  const tanggalFormatted = format(new Date(tanggal), "EEEE, dd MMMM yyyy", { locale: idLocale });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Rekap Keuangan Harian</h1>
        <p className="text-sm text-muted-foreground">Ringkasan seluruh transaksi per hari</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <Label>Tanggal</Label>
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="w-44" />
            </div>
            <div>
              <Label>Lembaga</Label>
              <Select value={departemenId} onValueChange={setDepartemenId}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Lembaga</SelectItem>
                  {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm font-medium text-muted-foreground">{tanggalFormatted}</p>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatsCard title="Total Penerimaan" value={formatRupiah(data?.totalMasuk || 0)} icon={TrendingUp} color="success" />
          <StatsCard title="Total Pengeluaran" value={formatRupiah(data?.totalKeluar || 0)} icon={TrendingDown} color="destructive" />
          <StatsCard title="Saldo Hari Ini" value={formatRupiah(data?.saldo || 0)} icon={Wallet} color="primary" />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Penerimaan ({data?.penerimaan.length || 0} transaksi)</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={colPenerimaan} data={data?.penerimaan || []} loading={isLoading} exportable exportFilename={`rekap-masuk-${tanggal}`} pageSize={20} searchable={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pengeluaran ({data?.pengeluaran.length || 0} transaksi)</CardTitle></CardHeader>
        <CardContent>
          <DataTable columns={colPengeluaran} data={data?.pengeluaran || []} loading={isLoading} exportable exportFilename={`rekap-keluar-${tanggal}`} pageSize={20} searchable={false} />
        </CardContent>
      </Card>
    </div>
  );
}
