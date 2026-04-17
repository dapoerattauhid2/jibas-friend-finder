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
                {data.asetLancarItems.filter(a => a.saldo !== 0).map(a => (
                  <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                ))}
                <Divider />
                <Row label="Total Aset Lancar" value={data.totalAL} bold />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">Aset Tidak Lancar:</p>
                {data.asetTidakLancarItems.filter(a => a.saldo !== 0).map(a => (
                  <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                ))}
                <Divider />
                <Row label="Total Aset Tidak Lancar" value={data.totalATL} bold />
              </div>
              <DoubleDivider />
              <Row label="TOTAL ASET" value={data.totalAset} bold />

              {/* LIABILITAS */}
              <h3 className="font-bold text-sm uppercase tracking-wider mt-6">LIABILITAS</h3>
              <div className="space-y-1">
                <p className="font-medium text-sm">Liabilitas Jangka Pendek:</p>
                {data.liabJPItems.filter(a => a.saldo !== 0).map(a => (
                  <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                ))}
                <Divider />
                <Row label="Total Liabilitas Jangka Pendek" value={data.totalLJP} bold />
              </div>
              {data.liabJGItems.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-sm">Liabilitas Jangka Panjang:</p>
                  {data.liabJGItems.filter(a => a.saldo !== 0).map(a => (
                    <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
                  ))}
                  <Divider />
                  <Row label="Total Liabilitas Jangka Panjang" value={data.totalLJG} bold />
                </div>
              )}
              <DoubleDivider />
              <Row label="TOTAL LIABILITAS" value={data.totalLiabilitas} bold />

              {/* ASET NETO (ISAK 35: saldo akun ekuitas + surplus periode berjalan) */}
              <h3 className="font-bold text-sm uppercase tracking-wider mt-6">ASET NETO</h3>
              {data.asetNetoItems.filter(a => a.saldo !== 0).map(a => (
                <Row key={a.akun_id} label={a.nama} value={a.saldo} indent />
              ))}
              {data.asetNetoItems.filter(a => a.saldo !== 0).length === 0 && (
                <p className="text-xs text-muted-foreground pl-4 italic">Belum ada saldo akun aset neto — lakukan tutup buku untuk memindahkan surplus ke ekuitas.</p>
              )}
              <Divider />
              <Row label="Saldo Aset Neto (dari Akun Ekuitas)" value={data.totalAsetNetoSaldo} indent />
              {data.surplusBerjalan !== 0 && (
                <Row label="Surplus (Defisit) Periode Berjalan — Tidak Terikat" value={data.surplusBerjalan} indent />
              )}
              {data.surplusTerbatasBerjalan !== 0 && (
                <Row label="Surplus (Defisit) Periode Berjalan — Terikat" value={data.surplusTerbatasBerjalan} indent />
              )}
              <DoubleDivider />
              <Row label="TOTAL ASET NETO" value={data.totalAsetNeto} bold />
              <Row label="TOTAL LIABILITAS & ASET NETO" value={data.totalLiabilitas + data.totalAsetNeto} bold />

              {Math.abs(data.selisih) > 1 && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Perhatian: neraca tidak seimbang (selisih: {formatRupiah(Math.round(Math.abs(data.selisih)))}).
                    Periksa pemetaan <code>pos_isak35</code> pada akun rekening atau lakukan koreksi jurnal.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
