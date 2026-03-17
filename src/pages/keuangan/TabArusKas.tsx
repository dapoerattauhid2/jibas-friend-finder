import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/shared/ExportButton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, namaBulan } from "@/hooks/useKeuangan";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ArusItem {
  kode: string;
  nama: string;
  masuk: number;
  keluar: number;
}

async function fetchJurnalDetailBatch(startDate: string, endDate: string, departemenId?: string) {
  const allRows: any[] = [];
  const batchSize = 5000;
  let offset = 0;
  while (true) {
    let q = supabase
      .from("jurnal_detail")
      .select("debit, kredit, jurnal:jurnal_id!inner(tanggal, status, departemen_id), akun:akun_id(kode, nama, jenis)")
      .eq("jurnal.status", "posted")
      .gte("jurnal.tanggal", startDate)
      .lt("jurnal.tanggal", endDate);
    if (departemenId) q = q.eq("jurnal.departemen_id", departemenId);
    const { data, error } = await q.range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  return allRows;
}

export default function TabArusKas({ departemenId }: { departemenId?: string }) {
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());

  const startDate = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const endM = bulan === 12 ? 1 : bulan + 1;
  const endY = bulan === 12 ? tahun + 1 : tahun;
  const endDate = `${endY}-${String(endM).padStart(2, "0")}-01`;

  const { data, isLoading } = useQuery({
    queryKey: ["arus_kas_jurnal", bulan, tahun, departemenId],
    queryFn: async () => {
      const rows = await fetchJurnalDetailBatch(startDate, endDate, departemenId);

      // Filter only kas/bank accounts (jenis = "aset" with kode starting with 1-1 or nama containing Kas/Bank)
      // We track debit (kas masuk) and kredit (kas keluar) on kas/bank accounts
      const kasMap = new Map<string, ArusItem>();

      rows.forEach((row: any) => {
        const akun = row.akun;
        if (!akun) return;
        // Only include kas/bank accounts: typically aset accounts with kode starting with "1-1" or "11"
        const isKas = akun.jenis === "aset" && (
          akun.kode.startsWith("1-1") || 
          akun.kode.startsWith("11") || 
          akun.nama.toLowerCase().includes("kas") || 
          akun.nama.toLowerCase().includes("bank")
        );
        if (!isKas) return;

        const key = `${akun.kode}-${akun.nama}`;
        if (!kasMap.has(key)) {
          kasMap.set(key, { kode: akun.kode, nama: akun.nama, masuk: 0, keluar: 0 });
        }
        const entry = kasMap.get(key)!;
        entry.masuk += Number(row.debit || 0);
        entry.keluar += Number(row.kredit || 0);
      });

      return Array.from(kasMap.values()).sort((a, b) => a.kode.localeCompare(b.kode));
    },
  });

  const totalMasuk = data?.reduce((s, a) => s + a.masuk, 0) || 0;
  const totalKeluar = data?.reduce((s, a) => s + a.keluar, 0) || 0;
  const arusBersih = totalMasuk - totalKeluar;

  const chartData = [
    { name: "Kas Masuk", value: totalMasuk, fill: "hsl(var(--success))" },
    { name: "Kas Keluar", value: totalKeluar, fill: "hsl(var(--destructive))" },
  ];

  const exportData = [
    ...(data || []).map((a) => ({ kode: a.kode, nama: a.nama, kas_masuk: a.masuk, kas_keluar: a.keluar, neto: a.masuk - a.keluar })),
    { kode: "", nama: "TOTAL", kas_masuk: totalMasuk, kas_keluar: totalKeluar, neto: arusBersih },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end justify-between flex-wrap">
        <div className="flex gap-3 items-end">
          <div>
            <Label>Bulan</Label>
            <Select value={String(bulan)} onValueChange={(v) => setBulan(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{namaBulan(i + 1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tahun</Label>
            <Input type="number" className="w-24" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
          </div>
        </div>
        <ExportButton
          data={exportData as any}
          filename={`arus-kas-${namaBulan(bulan)}-${tahun}`}
          columns={[
            { key: "kode", label: "Kode" },
            { key: "nama", label: "Nama Akun" },
            { key: "kas_masuk", label: "Kas Masuk" },
            { key: "kas_keluar", label: "Kas Keluar" },
            { key: "neto", label: "Neto" },
          ]}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-lg font-bold">LAPORAN ARUS KAS</h2>
                <p className="text-sm text-muted-foreground">Periode: {namaBulan(bulan)} {tahun}</p>
                <p className="text-xs text-muted-foreground">Berbasis jurnal (accrual basis)</p>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-2">KAS MASUK (Debit Akun Kas/Bank)</h3>
                {data?.map((a) => (
                  <div key={a.kode} className="flex justify-between py-1 pl-4 text-sm">
                    <span>{a.kode} &nbsp; {a.nama}</span>
                    <span className="font-medium">{formatRupiah(a.masuk)}</span>
                  </div>
                ))}
                {(!data || data.length === 0) && <p className="text-sm text-muted-foreground pl-4">Tidak ada data</p>}
                <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                  <span>Total Kas Masuk</span>
                  <span className="text-success">{formatRupiah(totalMasuk)}</span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-base mb-2">KAS KELUAR (Kredit Akun Kas/Bank)</h3>
                {data?.map((a) => (
                  <div key={`out-${a.kode}`} className="flex justify-between py-1 pl-4 text-sm">
                    <span>{a.kode} &nbsp; {a.nama}</span>
                    <span className="font-medium">{formatRupiah(a.keluar)}</span>
                  </div>
                ))}
                {(!data || data.length === 0) && <p className="text-sm text-muted-foreground pl-4">Tidak ada data</p>}
                <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                  <span>Total Kas Keluar</span>
                  <span className="text-destructive">{formatRupiah(totalKeluar)}</span>
                </div>
              </div>

              <div className="border-t-2 border-double pt-3 flex justify-between font-bold text-lg">
                <span>ARUS KAS BERSIH</span>
                <span className={arusBersih >= 0 ? "text-success" : "text-destructive"}>
                  {formatRupiah(arusBersih)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}jt`} />
                  <Tooltip formatter={(v: number) => formatRupiah(v)} />
                  <Bar dataKey="value" name="Jumlah" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
