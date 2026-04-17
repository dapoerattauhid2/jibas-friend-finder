import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLaporanArusKas } from "@/hooks/useISAK35";
import { formatRupiah, useTahunAjaran } from "@/hooks/useKeuangan";
import { Printer, Info } from "lucide-react";

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

  const rincianMasuk = data ? Object.entries(data.rincianPenerimaanOperasi || {}).filter(([, v]) => v !== 0) : [];
  const rincianKeluar = data ? Object.entries(data.rincianPengeluaranOperasi || {}).filter(([, v]) => v !== 0) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-foreground">Laporan Arus Kas (ISAK 35)</h1>
        <div className="flex items-center gap-3">
          <Select value={String(tahun)} onValueChange={v => setTahun(Number(v))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Cetak</Button>
        </div>
      </div>

      <Card className="border-info/30 bg-info/5 print:hidden">
        <CardContent className="pt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Disajikan dengan <strong>Metode Langsung</strong> sesuai ISAK 35 — penerimaan & pengeluaran kas dirinci dari mutasi akun kas/bank pada jurnal posted.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-lg">LAPORAN ARUS KAS</CardTitle>
          <p className="text-sm text-muted-foreground">Untuk Tahun yang Berakhir pada 31 Desember {tahun}</p>
          <p className="text-xs text-muted-foreground">(Metode Langsung)</p>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? <p className="text-muted-foreground">Memuat...</p> : (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">Arus Kas dari Aktivitas Operasi</h3>
                <p className="text-xs italic text-muted-foreground mb-1 pl-1">Penerimaan Kas:</p>
                {rincianMasuk.length === 0 && <p className="text-xs text-muted-foreground pl-4">— tidak ada —</p>}
                {rincianMasuk.map(([k, v]) => <Row key={k} label={k} value={v as number} indent />)}
                <p className="text-xs italic text-muted-foreground mt-2 mb-1 pl-1">Pengeluaran Kas:</p>
                {rincianKeluar.length === 0 && <p className="text-xs text-muted-foreground pl-4">— tidak ada —</p>}
                {rincianKeluar.map(([k, v]) => <Row key={k} label={k} value={-(v as number)} indent />)}
                <div className="border-t my-1" />
                <Row label="Arus Kas Bersih dari Aktivitas Operasi" value={data.arusOperasi} bold />
              </div>

              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">Arus Kas dari Aktivitas Investasi</h3>
                <Row label="Penerimaan dari Pelepasan Aset Tetap" value={data.investasiPenerimaan} indent />
                <Row label="Pembayaran untuk Pembelian Aset Tetap" value={-data.investasiPengeluaran} indent />
                <div className="border-t my-1" />
                <Row label="Arus Kas Bersih dari Aktivitas Investasi" value={data.arusInvestasi} bold />
              </div>

              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-2">Arus Kas dari Aktivitas Pendanaan</h3>
                <Row label="Penerimaan dari Utang/Setoran Modal" value={data.pendanaanPenerimaan} indent />
                <Row label="Pembayaran Utang" value={-data.pendanaanPengeluaran} indent />
                <div className="border-t my-1" />
                <Row label="Arus Kas Bersih dari Aktivitas Pendanaan" value={data.arusPendanaan} bold />
              </div>

              <div className="border-t-2 border-foreground pt-3 space-y-2">
                <Row label="Kenaikan (Penurunan) Bersih Kas dan Setara Kas" value={data.kenaikanKas} />
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
