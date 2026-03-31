import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLaporanKomprehensif, useLaporanPosisiKeuangan } from "@/hooks/useISAK35";
import { formatRupiah, useTahunAjaran } from "@/hooks/useKeuangan";
import { Printer } from "lucide-react";

function Rp({ value }: { value: number }) {
  return <span className={value < 0 ? "text-destructive" : ""}>{formatRupiah(Math.round(value))}</span>;
}

export default function LaporanPerubahanAsetNeto() {
  const currentYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(currentYear);
  const { data: taList = [] } = useTahunAjaran();
  const { data: komprehensif, isLoading: l1 } = useLaporanKomprehensif(tahun);
  const { data: posisi, isLoading: l2 } = useLaporanPosisiKeuangan(tahun);

  const years = Array.from(new Set([currentYear, currentYear - 1, ...taList.map((t: any) => {
    const m = t.nama?.match(/(\d{4})/); return m ? parseInt(m[1]) : null;
  }).filter(Boolean)])).sort((a: any, b: any) => b - a);

  const isLoading = l1 || l2;
  const saldoAwalTP = posisi?.surplusAkumulasian ?? 0;
  const surplusTP = komprehensif?.surplusDefisit ?? 0;
  const surplusTB = komprehensif?.surplusTerbatas ?? 0;
  const pkl = komprehensif?.pkl ?? 0;
  const saldoAkhirTP = saldoAwalTP + surplusTP + pkl;
  const saldoAkhirTB = surplusTB;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold text-foreground">Laporan Perubahan Aset Neto</h1>
        <div className="flex items-center gap-3">
          <Select value={String(tahun)} onValueChange={v => setTahun(Number(v))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Cetak</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-lg">LAPORAN PERUBAHAN ASET NETO</CardTitle>
          <p className="text-sm text-muted-foreground">Untuk Tahun yang Berakhir pada 31 Desember {tahun}</p>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Memuat...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Tanpa Pembatasan</TableHead>
                  <TableHead className="text-right">Dengan Pembatasan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Saldo Awal</TableCell>
                  <TableCell className="text-right"><Rp value={saldoAwalTP} /></TableCell>
                  <TableCell className="text-right"><Rp value={0} /></TableCell>
                  <TableCell className="text-right"><Rp value={saldoAwalTP} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Surplus / Defisit</TableCell>
                  <TableCell className="text-right"><Rp value={surplusTP} /></TableCell>
                  <TableCell className="text-right"><Rp value={surplusTB} /></TableCell>
                  <TableCell className="text-right"><Rp value={surplusTP + surplusTB} /></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Penghasilan Komprehensif Lain</TableCell>
                  <TableCell className="text-right"><Rp value={pkl} /></TableCell>
                  <TableCell className="text-right"><Rp value={0} /></TableCell>
                  <TableCell className="text-right"><Rp value={pkl} /></TableCell>
                </TableRow>
                <TableRow className="font-bold border-t-2">
                  <TableCell>Saldo Akhir</TableCell>
                  <TableCell className="text-right"><Rp value={saldoAkhirTP} /></TableCell>
                  <TableCell className="text-right"><Rp value={saldoAkhirTB} /></TableCell>
                  <TableCell className="text-right"><Rp value={saldoAkhirTP + saldoAkhirTB} /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
