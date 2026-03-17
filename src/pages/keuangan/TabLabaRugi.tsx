import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/shared/ExportButton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/hooks/useKeuangan";

interface AkunSaldo {
  kode: string;
  nama: string;
  jenis: string;
  saldo: number;
}

async function fetchAllJurnalDetail(tahun: number, departemenId?: string) {
  const allRows: any[] = [];
  const batchSize = 5000;
  let offset = 0;
  while (true) {
    let q = supabase
      .from("jurnal_detail")
      .select("debit, kredit, jurnal:jurnal_id!inner(tanggal, status, departemen_id), akun:akun_id(kode, nama, jenis, saldo_normal)")
      .eq("jurnal.status", "posted")
      .gte("jurnal.tanggal", `${tahun}-01-01`)
      .lte("jurnal.tanggal", `${tahun}-12-31`);
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

export default function TabLabaRugi({ departemenId }: { departemenId?: string }) {
  const [tahun, setTahun] = useState(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["laporan_laba_rugi", tahun, departemenId],
    queryFn: async () => {
      const rows = await fetchAllJurnalDetail(tahun, departemenId);

      const map = new Map<string, AkunSaldo>();
      rows.forEach((row: any) => {
        const akun = row.akun;
        if (!akun || (akun.jenis !== "pendapatan" && akun.jenis !== "beban")) return;
        const key = `${akun.kode}-${akun.nama}`;
        if (!map.has(key)) {
          map.set(key, { kode: akun.kode, nama: akun.nama, jenis: akun.jenis, saldo: 0 });
        }
        const entry = map.get(key)!;
        const debit = Number(row.debit || 0);
        const kredit = Number(row.kredit || 0);
        if (akun.jenis === "pendapatan") {
          entry.saldo += kredit - debit;
        } else {
          entry.saldo += debit - kredit;
        }
      });

      return Array.from(map.values()).sort((a, b) => a.kode.localeCompare(b.kode));
    },
  });

  const pendapatan = data?.filter((a) => a.jenis === "pendapatan") || [];
  const beban = data?.filter((a) => a.jenis === "beban") || [];
  const totalPendapatan = pendapatan.reduce((s, a) => s + a.saldo, 0);
  const totalBeban = beban.reduce((s, a) => s + a.saldo, 0);
  const labaRugi = totalPendapatan - totalBeban;

  const exportData = [
    ...pendapatan.map((a) => ({ kode: a.kode, nama: a.nama, kategori: "Pendapatan", jumlah: a.saldo })),
    { kode: "", nama: "TOTAL PENDAPATAN", kategori: "", jumlah: totalPendapatan },
    ...beban.map((a) => ({ kode: a.kode, nama: a.nama, kategori: "Beban", jumlah: a.saldo })),
    { kode: "", nama: "TOTAL BEBAN", kategori: "", jumlah: totalBeban },
    { kode: "", nama: "LABA / (RUGI) BERSIH", kategori: "", jumlah: labaRugi },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end justify-between">
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-24" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
        </div>
        <ExportButton
          data={exportData as any}
          filename={`laba-rugi-${tahun}`}
          columns={[
            { key: "kode", label: "Kode" },
            { key: "nama", label: "Nama Akun" },
            { key: "kategori", label: "Kategori" },
            { key: "jumlah", label: "Jumlah" },
          ]}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold">LAPORAN LABA RUGI</h2>
              <p className="text-sm text-muted-foreground">Periode: Tahun {tahun}</p>
            </div>

            {/* Pendapatan */}
            <div>
              <h3 className="font-semibold text-base mb-2">PENDAPATAN</h3>
              {pendapatan.map((a) => (
                <div key={a.kode} className="flex justify-between py-1 pl-4">
                  <span className="text-sm">{a.kode} &nbsp; {a.nama}</span>
                  <span className="text-sm font-medium">{formatRupiah(a.saldo)}</span>
                </div>
              ))}
              {pendapatan.length === 0 && <p className="text-sm text-muted-foreground pl-4">Tidak ada data</p>}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>TOTAL PENDAPATAN</span>
                <span>{formatRupiah(totalPendapatan)}</span>
              </div>
            </div>

            {/* Beban */}
            <div>
              <h3 className="font-semibold text-base mb-2">BEBAN</h3>
              {beban.map((a) => (
                <div key={a.kode} className="flex justify-between py-1 pl-4">
                  <span className="text-sm">{a.kode} &nbsp; {a.nama}</span>
                  <span className="text-sm font-medium">{formatRupiah(a.saldo)}</span>
                </div>
              ))}
              {beban.length === 0 && <p className="text-sm text-muted-foreground pl-4">Tidak ada data</p>}
              <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                <span>TOTAL BEBAN</span>
                <span>{formatRupiah(totalBeban)}</span>
              </div>
            </div>

            {/* Laba Rugi */}
            <div className="border-t-2 border-double pt-3 flex justify-between font-bold text-lg">
              <span>LABA / (RUGI) BERSIH</span>
              <span className={labaRugi >= 0 ? "text-success" : "text-destructive"}>
                {formatRupiah(labaRugi)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
