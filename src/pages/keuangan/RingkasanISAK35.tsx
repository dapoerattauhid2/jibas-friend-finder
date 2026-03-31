import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLaporanKomprehensif, useLaporanPosisiKeuangan } from "@/hooks/useISAK35";
import { formatRupiah, useTahunAjaran } from "@/hooks/useKeuangan";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, DollarSign, Building } from "lucide-react";

export default function RingkasanISAK35() {
  const currentYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(currentYear);
  const { data: taList = [] } = useTahunAjaran();
  const { data: komprehensif } = useLaporanKomprehensif(tahun);
  const { data: posisi } = useLaporanPosisiKeuangan(tahun);
  const navigate = useNavigate();

  const years = Array.from(new Set([currentYear, currentYear - 1, ...taList.map((t: any) => {
    const m = t.nama?.match(/(\d{4})/); return m ? parseInt(m[1]) : null;
  }).filter(Boolean)])).sort((a: any, b: any) => b - a);

  const cards = [
    { title: "Total Pendapatan", value: komprehensif?.totalPendapatan ?? 0, icon: TrendingUp, color: "text-emerald-600" },
    { title: "Total Beban", value: komprehensif?.totalBeban ?? 0, icon: TrendingDown, color: "text-orange-600" },
    { title: "Surplus / Defisit", value: komprehensif?.surplusDefisit ?? 0, icon: DollarSign, color: (komprehensif?.surplusDefisit ?? 0) >= 0 ? "text-emerald-600" : "text-destructive" },
    { title: "Total Aset", value: posisi?.totalAset ?? 0, icon: Building, color: "text-blue-600" },
  ];

  const links = [
    { label: "Penghasilan Komprehensif", url: "/keuangan/isak35/komprehensif" },
    { label: "Posisi Keuangan", url: "/keuangan/isak35/posisi-keuangan" },
    { label: "Perubahan Aset Neto", url: "/keuangan/isak35/perubahan-aset-neto" },
    { label: "Arus Kas", url: "/keuangan/isak35/arus-kas" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Ringkasan Laporan ISAK 35</h1>
        <Select value={String(tahun)} onValueChange={v => setTahun(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y: any) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <p className={`text-xl font-bold ${c.color}`}>{formatRupiah(Math.round(c.value))}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Laporan Lengkap</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {links.map(l => (
              <Button key={l.url} variant="outline" className="justify-start h-auto py-3" onClick={() => navigate(l.url)}>
                {l.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
