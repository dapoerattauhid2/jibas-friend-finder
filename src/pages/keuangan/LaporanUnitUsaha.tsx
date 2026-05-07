import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/shared/ExportButton";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/hooks/useKeuangan";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Store, Heart, Building2, Scale } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";

// ─── Tipe departemen dan labelnya ───────────────────────────────
const KATEGORI_LABEL: Record<string, string> = {
  unit_usaha:        "Unit Usaha (Laba Rugi Komersial)",
  unit_dana_terikat: "Unit Dana (Penerimaan & Pengeluaran)",
  unit_yayasan:      "Rekap Internal Yayasan",
};

const KATEGORI_ICON: Record<string, React.ReactNode> = {
  unit_usaha:        <Store className="h-4 w-4" />,
  unit_dana_terikat: <Heart className="h-4 w-4" />,
  unit_yayasan:      <Building2 className="h-4 w-4" />,
};

const EXCLUDED_KATEGORI = ["unit_pendidikan", "unit_yayasan"];

// Saldo awal akun neraca (hardcoded dari database)
const SALDO_AWAL_NERACA: Record<string, { nama: string; jenis: "aset" | "liabilitas" | "ekuitas"; saldo_normal: "D" | "K"; saldo_awal: number }> = {
  "1101": { nama: "KAS BENDAHARA YAYASAN",                  jenis: "aset",       saldo_normal: "D", saldo_awal: 11241900 },
  "1102": { nama: "KAS PEMBANTU BENDAHARA ICT",             jenis: "aset",       saldo_normal: "D", saldo_awal: 2962500 },
  "1110": { nama: "KAS KABID UMUM",                         jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1111": { nama: "KAS DAPOER ATTAUHID",                    jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1201": { nama: "BANK OPERASIONAL",                       jenis: "aset",       saldo_normal: "D", saldo_awal: 178140537 },
  "1205": { nama: "BANK LAUNDRY ICT",                       jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1206": { nama: "BANK BELANJE MART ICT",                  jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1207": { nama: "BANK DAPOER AT-TAUHID",                  jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1208": { nama: "BANK KANTIN AT-TAUHID",                  jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1209": { nama: "BANK KOPERASI AT-TAUHID",                jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1601": { nama: "UANG MUKA OPERASIONAL",                  jenis: "aset",       saldo_normal: "D", saldo_awal: 19113000 },
  "1602": { nama: "UANG MUKA PEMBANGUNAN",                  jenis: "aset",       saldo_normal: "D", saldo_awal: 500000 },
  "1803": { nama: "PEKERJAAN DALAM PELAKSANAAN MASJID ICT", jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "1902": { nama: "REKENING ANTAR BAGIAN",                  jenis: "aset",       saldo_normal: "D", saldo_awal: 0 },
  "2102": { nama: "HUTANG KEPADA LEMBAGA LAIN",             jenis: "liabilitas", saldo_normal: "K", saldo_awal: 36133102 },
  "2103": { nama: "TITIPAN TRANSFER (NO CLEAR)",            jenis: "liabilitas", saldo_normal: "K", saldo_awal: 1825000 },
  "2105": { nama: "HUTANG USAHA",                           jenis: "liabilitas", saldo_normal: "K", saldo_awal: 0 },
  "3101": { nama: "ASSET NETTO (MODAL)",                    jenis: "ekuitas",    saldo_normal: "K", saldo_awal: 9377623636 },
};

// ─── Fetch jurnal detail per departemen ─────────────────────────
async function fetchJurnalDetail(tahun: number, departemenId: string) {
  const allRows: any[] = [];
  const batchSize = 5000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("jurnal_detail")
      .select("debit, kredit, jurnal:jurnal_id!inner(tanggal, status, departemen_id), akun:akun_id(kode, nama, jenis)")
      .eq("jurnal.status", "posted")
      .eq("jurnal.departemen_id", departemenId)
      .gte("jurnal.tanggal", `${tahun}-01-01`)
      .lte("jurnal.tanggal", `${tahun}-12-31`)
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  return allRows;
}

// ─── Fetch semua jurnal konsolidasi (semua dept non-sekolah) ────
async function fetchJurnalKonsolidasi(tahun: number, deptIds: string[]) {
  const allRows: any[] = [];
  const batchSize = 5000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("jurnal_detail")
      .select("debit, kredit, jurnal:jurnal_id!inner(tanggal, status, departemen_id), akun:akun_id(kode, nama, jenis, saldo_normal)")
      .eq("jurnal.status", "posted")
      .in("jurnal.departemen_id", deptIds)
      .gte("jurnal.tanggal", `${tahun}-01-01`)
      .lte("jurnal.tanggal", `${tahun}-12-31`)
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < batchSize) break;
    offset += batchSize;
  }
  return allRows;
}

// ─── Hitung ringkasan laba rugi ───────────────────────────────────
function hitungRingkasan(rows: any[]) {
  const map = new Map<string, { kode: string; nama: string; jenis: string; saldo: number }>();
  rows.forEach((row: any) => {
    const akun = row.akun;
    if (!akun || !["pendapatan", "beban"].includes(akun.jenis)) return;
    const key = akun.kode;
    if (!map.has(key)) map.set(key, { kode: akun.kode, nama: akun.nama, jenis: akun.jenis, saldo: 0 });
    const entry = map.get(key)!;
    const debit  = Number(row.debit  || 0);
    const kredit = Number(row.kredit || 0);
    entry.saldo += akun.jenis === "pendapatan" ? kredit - debit : debit - kredit;
  });
  return Array.from(map.values())
    .filter(a => a.saldo !== 0)
    .sort((a, b) => a.kode.localeCompare(b.kode));
}

// ─── Hitung neraca dari mutasi jurnal ────────────────────────────
function hitungNeraca(rows: any[]) {
  // Mulai dari saldo awal
  const map = new Map<string, { kode: string; nama: string; jenis: "aset" | "liabilitas" | "ekuitas"; saldo_normal: "D" | "K"; saldo: number }>();

  // Inisialisasi dari SALDO_AWAL_NERACA
  Object.entries(SALDO_AWAL_NERACA).forEach(([kode, akun]) => {
    map.set(kode, { kode, ...akun, saldo: akun.saldo_awal });
  });

  // Tambahkan mutasi dari jurnal
  rows.forEach((row: any) => {
    const akun = row.akun;
    if (!akun || !["aset", "liabilitas", "ekuitas"].includes(akun.jenis)) return;
    const kode = akun.kode;

    if (!map.has(kode)) {
      // Akun baru yang tidak ada di saldo awal
      const saldo_normal = akun.saldo_normal || (akun.jenis === "aset" ? "D" : "K");
      map.set(kode, {
        kode,
        nama: akun.nama,
        jenis: akun.jenis as "aset" | "liabilitas" | "ekuitas",
        saldo_normal,
        saldo: 0,
      });
    }

    const entry = map.get(kode)!;
    const debit  = Number(row.debit  || 0);
    const kredit = Number(row.kredit || 0);

    // Saldo naik jika transaksi searah saldo normal
    if (entry.saldo_normal === "D") {
      entry.saldo += debit - kredit;
    } else {
      entry.saldo += kredit - debit;
    }
  });

  return Array.from(map.values()).sort((a, b) => a.kode.localeCompare(b.kode));
}

// ─── Komponen kartu ringkasan per departemen ──────────────────────
function KartuDepartemen({
  dept, tahun, kategori,
}: {
  dept: { id: string; nama: string; kode: string };
  tahun: number;
  kategori: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["laporan_unit_usaha", dept.id, tahun],
    queryFn: async () => {
      const rows = await fetchJurnalDetail(tahun, dept.id);
      return hitungRingkasan(rows);
    },
  });

  const pendapatan = data?.filter(a => a.jenis === "pendapatan") || [];
  const beban      = data?.filter(a => a.jenis === "beban")      || [];
  const totalP     = pendapatan.reduce((s, a) => s + a.saldo, 0);
  const totalB     = beban.reduce((s, a) => s + a.saldo, 0);
  const selisih    = totalP - totalB;

  const labelPendapatan = kategori === "unit_dana_terikat" ? "Penerimaan" : "Pendapatan";
  const labelBeban      = kategori === "unit_dana_terikat" ? "Pengeluaran" : "Beban";
  const labelSelisih    = kategori === "unit_usaha"        ? "Laba / Rugi" : "Saldo Dana";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="text-muted-foreground">{dept.kode}</span>
          <span>{dept.nama}</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {kategori === "unit_usaha" ? "Komersial" : kategori === "unit_dana_terikat" ? "Dana" : "Internal"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-success" /> {labelPendapatan}
              </span>
              <span className="font-medium text-success">{formatRupiah(totalP)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-destructive" /> {labelBeban}
              </span>
              <span className="font-medium text-destructive">{formatRupiah(totalB)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span className="flex items-center gap-1">
                <Minus className="h-3 w-3" /> {labelSelisih}
              </span>
              <span className={selisih >= 0 ? "text-success" : "text-destructive"}>
                {formatRupiah(selisih)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Detail laporan laba rugi satu departemen ────────────────────
function DetailLaporan({
  dept, tahun, kategori,
}: {
  dept: { id: string; nama: string; kode: string };
  tahun: number;
  kategori: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["laporan_unit_usaha", dept.id, tahun],
    queryFn: async () => {
      const rows = await fetchJurnalDetail(tahun, dept.id);
      return hitungRingkasan(rows);
    },
  });

  const pendapatan = data?.filter(a => a.jenis === "pendapatan") || [];
  const beban      = data?.filter(a => a.jenis === "beban")      || [];
  const totalP     = pendapatan.reduce((s, a) => s + a.saldo, 0);
  const totalB     = beban.reduce((s, a) => s + a.saldo, 0);
  const selisih    = totalP - totalB;

  const isUsaha = kategori === "unit_usaha";
  const isDana  = kategori === "unit_dana_terikat";

  const labelPendapatan = isDana  ? "PENERIMAAN DANA" : "PENDAPATAN";
  const labelBeban      = isDana  ? "PENGELUARAN DANA" : "BEBAN OPERASIONAL";
  const labelSelisih    = isUsaha ? "LABA / (RUGI) BERSIH" : "SALDO DANA";
  const judulLaporan    = isUsaha ? "LAPORAN LABA RUGI" : isDana ? "LAPORAN PENERIMAAN & PENGELUARAN DANA" : "REKAP INTERNAL";

  const exportData = [
    ...pendapatan.map(a => ({ kode: a.kode, nama: a.nama, kategori: labelPendapatan, jumlah: a.saldo })),
    { kode: "", nama: `TOTAL ${labelPendapatan}`, kategori: "", jumlah: totalP },
    ...beban.map(a => ({ kode: a.kode, nama: a.nama, kategori: labelBeban, jumlah: a.saldo })),
    { kode: "", nama: `TOTAL ${labelBeban}`, kategori: "", jumlah: totalB },
    { kode: "", nama: labelSelisih, kategori: "", jumlah: selisih },
  ];

  if (isLoading) return <Skeleton className="h-64 mt-4" />;

  return (
    <Card className="mt-4">
      <CardContent className="pt-6 space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold">{judulLaporan}</h2>
          <p className="text-sm font-medium">{dept.kode} — {dept.nama}</p>
          <p className="text-sm text-muted-foreground">Periode: Tahun {tahun}</p>
        </div>

        {/* Pendapatan / Penerimaan */}
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">{labelPendapatan}</h3>
          {pendapatan.length === 0 ? (
            <p className="text-sm text-muted-foreground pl-4">Tidak ada data</p>
          ) : (
            <Table>
              <TableBody>
                {pendapatan.map(a => (
                  <TableRow key={a.kode}>
                    <TableCell className="text-sm text-muted-foreground w-16">{a.kode}</TableCell>
                    <TableCell className="text-sm">{a.nama}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatRupiah(a.saldo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-bold">TOTAL {labelPendapatan}</TableCell>
                  <TableCell className="text-right font-bold text-success">{formatRupiah(totalP)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>

        {/* Beban / Pengeluaran */}
        <div>
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">{labelBeban}</h3>
          {beban.length === 0 ? (
            <p className="text-sm text-muted-foreground pl-4">Tidak ada data</p>
          ) : (
            <Table>
              <TableBody>
                {beban.map(a => (
                  <TableRow key={a.kode}>
                    <TableCell className="text-sm text-muted-foreground w-16">{a.kode}</TableCell>
                    <TableCell className="text-sm">{a.nama}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatRupiah(a.saldo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-bold">TOTAL {labelBeban}</TableCell>
                  <TableCell className="text-right font-bold text-destructive">{formatRupiah(totalB)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </div>

        {/* Selisih */}
        <div className="border-t-2 border-double pt-3 flex justify-between font-bold text-lg">
          <span>{labelSelisih}</span>
          <span className={selisih >= 0 ? "text-success" : "text-destructive"}>
            {formatRupiah(selisih)}
          </span>
        </div>

        <div className="flex justify-end pt-2">
          <ExportButton
            data={exportData as any}
            filename={`laporan-${dept.kode.toLowerCase()}-${tahun}`}
            columns={[
              { key: "kode",     label: "Kode" },
              { key: "nama",     label: "Nama Akun" },
              { key: "kategori", label: "Kategori" },
              { key: "jumlah",   label: "Jumlah" },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tab Neraca Konsolidasi ───────────────────────────────────────
function NeracaKonsolidasi({
  tahun,
  deptIds,
}: {
  tahun: number;
  deptIds: string[];
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["neraca_konsolidasi", tahun, deptIds.sort().join(",")],
    queryFn: async () => {
      if (deptIds.length === 0) return [];
      const rows = await fetchJurnalKonsolidasi(tahun, deptIds);
      return hitungNeraca(rows);
    },
    enabled: deptIds.length > 0,
  });

  const aset       = data?.filter(a => a.jenis === "aset")       || [];
  const liabilitas = data?.filter(a => a.jenis === "liabilitas") || [];
  const ekuitas    = data?.filter(a => a.jenis === "ekuitas")    || [];

  const totalAset       = aset.reduce((s, a) => s + a.saldo, 0);
  const totalLiabilitas = liabilitas.reduce((s, a) => s + a.saldo, 0);
  const totalEkuitas    = ekuitas.reduce((s, a) => s + a.saldo, 0);
  const totalPasiva     = totalLiabilitas + totalEkuitas;

  const selisih = totalAset - totalPasiva;

  const exportData = [
    { kode: "", nama: "=== ASET ===", jumlah: "" },
    ...aset.map(a => ({ kode: a.kode, nama: a.nama, jumlah: a.saldo })),
    { kode: "", nama: "TOTAL ASET", jumlah: totalAset },
    { kode: "", nama: "", jumlah: "" },
    { kode: "", nama: "=== LIABILITAS ===", jumlah: "" },
    ...liabilitas.map(a => ({ kode: a.kode, nama: a.nama, jumlah: a.saldo })),
    { kode: "", nama: "TOTAL LIABILITAS", jumlah: totalLiabilitas },
    { kode: "", nama: "", jumlah: "" },
    { kode: "", nama: "=== EKUITAS ===", jumlah: "" },
    ...ekuitas.map(a => ({ kode: a.kode, nama: a.nama, jumlah: a.saldo })),
    { kode: "", nama: "TOTAL EKUITAS", jumlah: totalEkuitas },
    { kode: "", nama: "TOTAL LIABILITAS + EKUITAS", jumlah: totalPasiva },
  ];

  if (isLoading) return (
    <div className="space-y-4 pt-4">
      {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
    </div>
  );

  if (error) return (
    <p className="text-destructive text-sm pt-4">Gagal memuat data neraca: {String(error)}</p>
  );

  if (deptIds.length === 0) return (
    <p className="text-muted-foreground text-sm pt-4">Tidak ada departemen yang bisa dikonsolidasi.</p>
  );

  return (
    <Card className="mt-4">
      <CardContent className="pt-6 space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-bold">NERACA KONSOLIDASI</h2>
          <p className="text-sm font-medium">Seluruh Unit Non-Sekolah</p>
          <p className="text-sm text-muted-foreground">Per 31 Desember {tahun}</p>
          {Math.abs(selisih) > 1 && (
            <Badge variant="destructive" className="mt-2">
              ⚠ Tidak Balance — Selisih: {formatRupiah(Math.abs(selisih))}
            </Badge>
          )}
          {Math.abs(selisih) <= 1 && data && data.length > 0 && (
            <Badge variant="outline" className="mt-2 text-success border-success">
              ✓ Balance
            </Badge>
          )}
        </div>

        {/* ASET */}
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wide bg-muted px-3 py-1.5 rounded mb-2">
            ASET
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Kode</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aset.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-sm text-center">Tidak ada data</TableCell>
                </TableRow>
              ) : (
                aset.map(a => (
                  <TableRow key={a.kode}>
                    <TableCell className="text-sm text-muted-foreground">{a.kode}</TableCell>
                    <TableCell className="text-sm">{a.nama}</TableCell>
                    <TableCell className="text-right text-sm">{formatRupiah(a.saldo)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-bold">TOTAL ASET</TableCell>
                <TableCell className="text-right font-bold text-success">{formatRupiah(totalAset)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* LIABILITAS */}
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wide bg-muted px-3 py-1.5 rounded mb-2">
            LIABILITAS
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Kode</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liabilitas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-sm text-center">Tidak ada data</TableCell>
                </TableRow>
              ) : (
                liabilitas.map(a => (
                  <TableRow key={a.kode}>
                    <TableCell className="text-sm text-muted-foreground">{a.kode}</TableCell>
                    <TableCell className="text-sm">{a.nama}</TableCell>
                    <TableCell className="text-right text-sm">{formatRupiah(a.saldo)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-bold">TOTAL LIABILITAS</TableCell>
                <TableCell className="text-right font-bold text-destructive">{formatRupiah(totalLiabilitas)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* EKUITAS */}
        <div>
          <h3 className="font-bold text-sm uppercase tracking-wide bg-muted px-3 py-1.5 rounded mb-2">
            EKUITAS
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Kode</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ekuitas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground text-sm text-center">Tidak ada data</TableCell>
                </TableRow>
              ) : (
                ekuitas.map(a => (
                  <TableRow key={a.kode}>
                    <TableCell className="text-sm text-muted-foreground">{a.kode}</TableCell>
                    <TableCell className="text-sm">{a.nama}</TableCell>
                    <TableCell className="text-right text-sm">{formatRupiah(a.saldo)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="font-bold">TOTAL EKUITAS</TableCell>
                <TableCell className="text-right font-bold">{formatRupiah(totalEkuitas)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* Ringkasan Balance */}
        <div className="border-t-2 border-double pt-4 space-y-1">
          <div className="flex justify-between font-bold text-base">
            <span>TOTAL ASET</span>
            <span className="text-success">{formatRupiah(totalAset)}</span>
          </div>
          <div className="flex justify-between font-bold text-base">
            <span>TOTAL LIABILITAS + EKUITAS</span>
            <span>{formatRupiah(totalPasiva)}</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <ExportButton
            data={exportData as any}
            filename={`neraca-konsolidasi-${tahun}`}
            columns={[
              { key: "kode",  label: "Kode" },
              { key: "nama",  label: "Nama Akun" },
              { key: "jumlah", label: "Saldo" },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Halaman Utama ────────────────────────────────────────────────
export default function LaporanUnitUsaha() {
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");

  // Ambil semua departemen non-pendidikan
  const { data: deptList, isLoading: loadDept } = useQuery({
    queryKey: ["departemen_non_pendidikan"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departemen")
        .select("id, nama, kode, kategori")
        .eq("aktif", true)
        .not("kategori", "in", `(${EXCLUDED_KATEGORI.map(k => `"${k}"`).join(",")})`)
        .order("kategori")
        .order("nama");
      if (error) throw error;
      return (data || []) as { id: string; nama: string; kode: string; kategori: string }[];
    },
  });

  // Kelompokkan per kategori
  const grouped = (deptList || []).reduce((acc, d) => {
    if (!acc[d.kategori]) acc[d.kategori] = [];
    acc[d.kategori].push(d);
    return acc;
  }, {} as Record<string, typeof deptList>);

  const selectedDept = selectedDeptId !== "all" ? deptList?.find(d => d.id === selectedDeptId) : undefined;
  const allDeptIds   = (deptList || []).map(d => d.id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Laporan Unit Usaha & Dana</h1>
        <p className="text-sm text-muted-foreground">
          Laporan keuangan departemen non-pendidikan — Mart, Kantin, Dapoer, Masjid, Dana Sosial
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label>Tahun</Label>
          <Input
            type="number"
            className="w-24"
            value={tahun}
            onChange={e => setTahun(Number(e.target.value))}
          />
        </div>
        <div>
          <Label>Lihat Detail Departemen</Label>
          <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Pilih departemen..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Ringkasan Semua —</SelectItem>
              {deptList?.map(d => (
                <SelectItem key={d.id} value={d.id}>
                  {d.kode} — {d.nama}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs: Laba Rugi & Neraca */}
      <Tabs defaultValue="labarugi">
        <TabsList>
          <TabsTrigger value="labarugi" className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" /> Laba Rugi
          </TabsTrigger>
          <TabsTrigger value="neraca" className="flex items-center gap-1">
            <Scale className="h-4 w-4" /> Neraca Konsolidasi
          </TabsTrigger>
        </TabsList>

        {/* Tab Laba Rugi */}
        <TabsContent value="labarugi">
          {/* Mode: ringkasan semua */}
          {selectedDeptId === "all" && (
            <>
              {loadDept ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                  {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-36" />)}
                </div>
              ) : (
                Object.entries(grouped).map(([kategori, depts]) => (
                  <div key={kategori} className="space-y-3 mt-4">
                    <div className="flex items-center gap-2">
                      {KATEGORI_ICON[kategori]}
                      <h2 className="font-semibold text-base">{KATEGORI_LABEL[kategori] || kategori}</h2>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {(depts || []).map(d => (
                        <div
                          key={d.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedDeptId(d.id)}
                        >
                          <KartuDepartemen dept={d} tahun={tahun} kategori={d.kategori} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

          {/* Mode: detail satu departemen */}
          {selectedDeptId !== "all" && selectedDept && (
            <>
              <button
                className="text-sm text-muted-foreground hover:text-foreground underline mt-4 block"
                onClick={() => setSelectedDeptId("all")}
              >
                ← Kembali ke ringkasan
              </button>
              <DetailLaporan dept={selectedDept} tahun={tahun} kategori={selectedDept.kategori} />
            </>
          )}
        </TabsContent>

        {/* Tab Neraca Konsolidasi */}
        <TabsContent value="neraca">
          {loadDept ? (
            <div className="space-y-4 pt-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : (
            <NeracaKonsolidasi tahun={tahun} deptIds={allDeptIds} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}