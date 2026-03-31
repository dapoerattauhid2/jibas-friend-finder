import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLaporanArusKas } from "@/hooks/useISAK35";
import { formatRupiah, useTahunAjaran } from "@/hooks/useKeuangan";
import { Printer } from "lucide-react";

function Row({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) {
  const neg = value < 0;
  const display = neg ? `(${formatRupiah(Math.abs(Math.round(value)))})` : formatRupiah(Math.round(value));
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold text-base" : ""} ${indent ? "pl-4" : ""} ${neg ? "text-destructive" : ""}`}>
      <span>{label}</span><span>{display}</span>
    </div>
  );
}

export default function LaporanArusKasISAK35() {
  const currentYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(currentYear);
  const { data: taList = [] } = useTahunAjaran();
  const { data, isLoading } = useLaporanArusKas(tahun);

  const years = Array.from(new Set([currentYear, currentYear - 1, ...taList.map((t: any) => {
    const m = t.nama?.match(/(\d{4})/); return m ? parseInt(m[1]) : null;
  }).filter(Boolean)])).sort((a: any, b: any) => b - a);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-foreground">Laporan Arus Kas (ISAK 35)</h1>
        <div className="flex items-center gap-3">
          <Select value={String(tahun)} onValueChange={v => setTahun(Number(v))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Cetak</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-lg">LAPORAN ARUS KAS</CardTitle>
          <p className="text-sm text-muted-foreground">Untuk Tahun yang Berakhir pada 31 Desember {tahun}</p>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? <p className="text-muted-foreground">Memuat...</p> : (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">Aktivitas Operasi</h3>
                <Row label="Penerimaan dari Sumbangan & Jasa" value={data.penerimaanOperasi} indent />
                <Row label="Pengeluaran Operasional" value={-data.pengeluaranOperasi} indent />
                <div className="border-t my-1" />
                <Row label="Arus Kas Bersih dari Operasi" value={data.arusOperasi} bold />
              </div>
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">Aktivitas Investasi</h3>
                <Row label="Pembelian Aset Tetap" value={data.arusInvestasi} indent />
                <div className="border-t my-1" />
                <Row label="Arus Kas Bersih dari Investasi" value={data.arusInvestasi} bold />
              </div>
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">Aktivitas Pendanaan</h3>
                <Row label="Penerimaan/Pembayaran Utang" value={data.arusPendanaan} indent />
                <div className="border-t my-1" />
                <Row label="Arus Kas Bersih dari Pendanaan" value={data.arusPendanaan} bold />
              </div>
              <div className="border-t-2 border-foreground pt-3 space-y-2">
                <Row label="Kenaikan (Penurunan) Kas" value={data.kenaikanKas} />
                <Row label="Kas dan Setara Kas Awal Periode" value={data.kasAwal} />
                <div className="border-t-2 border-foreground my-2" />
                <Row label="KAS DAN SETARA KAS AKHIR PERIODE" value={data.kasAkhir} bold />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
