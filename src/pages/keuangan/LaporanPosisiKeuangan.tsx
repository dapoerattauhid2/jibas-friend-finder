import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLaporanPosisiKeuangan } from "@/hooks/useISAK35";
import { formatRupiah, useTahunAjaran } from "@/hooks/useKeuangan";
import { Printer, AlertTriangle } from "lucide-react";

function Row({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) {
  const neg = value < 0;
  const display = neg ? `(${formatRupiah(Math.abs(Math.round(value)))})` : formatRupiah(Math.round(value));
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold" : ""} ${indent ? "pl-4" : ""} ${neg ? "text-destructive" : ""}`}>
      <span>{label}</span><span>{display}</span>
    </div>
  );
}

function Divider() { return <div className="border-t my-1" />; }
function DoubleDivider() { return <div className="border-t-2 border-foreground my-2" />; }

export default function LaporanPosisiKeuangan() {
  const currentYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(currentYear);
  const { data: taList = [] } = useTahunAjaran();
  const { data, isLoading } = useLaporanPosisiKeuangan(tahun);

  const years = Array.from(new Set([currentYear, currentYear - 1, ...taList.map((t: any) => {
    const m = t.nama?.match(/(\d{4})/); return m ? parseInt(m[1]) : null;
  }).filter(Boolean)])).sort((a: any, b: any) => b - a);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-foreground">Laporan Posisi Keuangan</h1>
        <div className="flex items-center gap-3">
          <Select value={String(tahun)} onValueChange={v => setTahun(Number(v))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Cetak</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-lg">LAPORAN POSISI KEUANGAN</CardTitle>
          <p className="text-sm text-muted-foreground">Per 31 Desember {tahun}</p>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? <p className="text-muted-foreground">Memuat...</p> : (
            <div className="space-y-4 max-w-2xl mx-auto">
              {/* ASET */}
              <h3 className="font-bold text-sm uppercase tracking-wider">ASET</h3>
              <div className="space-y-1">
                <p className="font-medium text-sm">Aset Lancar:</p>
                <Row label="Kas dan Setara Kas" value={data.asetLancar.kas} indent />
                <Row label="Piutang" value={data.asetLancar.piutang} indent />
                <Row label="Investasi Jangka Pendek" value={data.asetLancar.invJP} indent />
                <Row label="Persediaan" value={data.asetLancar.persediaan} indent />
                <Row label="Aset Lancar Lain" value={data.asetLancar.lainnya} indent />
                <Divider />
                <Row label="Total Aset Lancar" value={data.totalAL} bold />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">Aset Tidak Lancar:</p>
                <Row label="Properti Investasi" value={data.asetTL.properti} indent />
                <Row label="Investasi Jangka Panjang" value={data.asetTL.invJG} indent />
                <Row label="Aset Tetap" value={data.asetTL.asetTetap} indent />
                <Row label="Akm. Penyusutan Aset Tetap" value={data.asetTL.akmPenyusutan} indent />
                <Divider />
                <Row label="Total Aset Tidak Lancar" value={data.totalATL} bold />
              </div>
              <DoubleDivider />
              <Row label="TOTAL ASET" value={data.totalAset} bold />

              {/* LIABILITAS */}
              <h3 className="font-bold text-sm uppercase tracking-wider mt-6">LIABILITAS</h3>
              <div className="space-y-1">
                <p className="font-medium text-sm">Liabilitas Jangka Pendek:</p>
                <Row label="Pendapatan Diterima Dimuka" value={data.liabJP.pdd} indent />
                <Row label="Utang Jangka Pendek" value={data.liabJP.utangJP} indent />
                <Divider />
                <Row label="Total Liabilitas Jangka Pendek" value={data.totalLJP} bold />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">Liabilitas Jangka Panjang:</p>
                <Row label="Utang Jangka Panjang" value={data.liabJG.utangJG} indent />
                <Row label="Liabilitas Imbalan Kerja" value={data.liabJG.lik} indent />
                <Divider />
                <Row label="Total Liabilitas Jangka Panjang" value={data.totalLJG} bold />
              </div>
              <DoubleDivider />
              <Row label="TOTAL LIABILITAS" value={data.totalLiabilitas} bold />

              {/* ASET NETO */}
              <h3 className="font-bold text-sm uppercase tracking-wider mt-6">ASET NETO</h3>
              <Row label="Tanpa Pembatasan" value={data.totalAsetNeto} indent />
              <DoubleDivider />
              <Row label="TOTAL LIABILITAS & ASET NETO" value={data.totalLiabilitas + data.totalAsetNeto} bold />

              {data.selisih !== 0 && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>Perhatian: laporan tidak balance (selisih: {formatRupiah(Math.round(Math.abs(data.selisih)))})</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
