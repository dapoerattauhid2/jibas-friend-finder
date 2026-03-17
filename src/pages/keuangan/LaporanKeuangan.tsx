import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useKelas } from "@/hooks/useAkademikData";
import { useJenisPembayaran, useRekapKeuanganPerLembaga, useLembaga, formatRupiah, namaBulan, BULAN_NAMES, BULAN_ORDER_AKADEMIK } from "@/hooks/useKeuangan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Building2, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSearchParams } from "react-router-dom";
import TabLabaRugi from "./TabLabaRugi";
import TabNeracaAkuntansi from "./TabNeracaAkuntansi";
import TabArusKas from "./TabArusKas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";

const now = new Date();

export default function LaporanKeuangan() {
  const [tab, setTab] = useState("penerimaan");
  const [searchParams] = useSearchParams();
  const [filterLembagaId, setFilterLembagaId] = useState(searchParams.get("lembaga") || "");
  const { data: lembagaList } = useLembaga();
  const deptId = filterLembagaId && filterLembagaId !== "all" ? filterLembagaId : undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Laporan Keuangan</h1>
        <p className="text-sm text-muted-foreground">Laporan penerimaan, pengeluaran, dan rekap SPP</p>
      </div>

      {/* Filter Lembaga Global */}
      <div className="flex items-center gap-3 flex-wrap">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm">Filter Lembaga:</Label>
        <Select value={filterLembagaId} onValueChange={setFilterLembagaId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Semua Lembaga" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Lembaga (Konsolidasi)</SelectItem>
            {lembagaList?.map((l: any) => (
              <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filterLembagaId && filterLembagaId !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilterLembagaId("")}>Reset Filter</Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Operasional</span>
            <TabsList>
              <TabsTrigger value="penerimaan">Penerimaan</TabsTrigger>
              <TabsTrigger value="pengeluaran">Pengeluaran</TabsTrigger>
              <TabsTrigger value="rekap-spp">Rekap SPP</TabsTrigger>
              <TabsTrigger value="ringkasan-kas">Ringkasan Kas</TabsTrigger>
              <TabsTrigger value="konsolidasi">Konsolidasi</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Akuntansi</span>
            <TabsList>
              <TabsTrigger value="laba-rugi">Laba Rugi</TabsTrigger>
              <TabsTrigger value="neraca-akuntansi">Neraca</TabsTrigger>
              <TabsTrigger value="arus-kas">Arus Kas</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="penerimaan"><TabPenerimaan departemenId={deptId} /></TabsContent>
        <TabsContent value="pengeluaran"><TabPengeluaran departemenId={deptId} /></TabsContent>
        <TabsContent value="rekap-spp"><TabRekapSPP departemenId={deptId} /></TabsContent>
        <TabsContent value="ringkasan-kas"><TabNeraca departemenId={deptId} /></TabsContent>
        <TabsContent value="laba-rugi"><TabLabaRugi departemenId={deptId} /></TabsContent>
        <TabsContent value="neraca-akuntansi"><TabNeracaAkuntansi departemenId={deptId} /></TabsContent>
        <TabsContent value="arus-kas"><TabArusKas departemenId={deptId} /></TabsContent>
        <TabsContent value="konsolidasi"><TabKonsolidasi /></TabsContent>
      </Tabs>
    </div>
  );
}

function TabPenerimaan({ departemenId }: { departemenId?: string }) {
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [filterTA, setFilterTA] = useState("all");

  // Fetch tahun ajaran list
  const { data: tahunAjaranList } = useQuery({
    queryKey: ["tahun_ajaran_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tahun_ajaran").select("id, nama").order("nama", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["laporan_penerimaan", bulan, tahun, departemenId, filterTA],
    queryFn: async () => {
      const start = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
      const endM = bulan === 12 ? 1 : bulan + 1;
      const endY = bulan === 12 ? tahun + 1 : tahun;
      const end = `${endY}-${String(endM).padStart(2, "0")}-01`;
      let q = supabase
        .from("pembayaran")
        .select("*, siswa:siswa_id(nama, nis), jenis_pembayaran:jenis_id(nama, akun_pendapatan_id), departemen:departemen_id(nama, kode), jurnal:jurnal_id(id, nomor), tahun_ajaran:tahun_ajaran_id(id, nama)")
        .gte("tanggal_bayar", start)
        .lt("tanggal_bayar", end)
        .order("tanggal_bayar", { ascending: false });
      if (departemenId) q = q.eq("departemen_id", departemenId);
      if (filterTA && filterTA !== "all") q = q.eq("tahun_ajaran_id", filterTA);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch pendapatan_dimuka to cross-reference
  const pembayaranIds = data?.map((r: any) => r.id).filter(Boolean) || [];
  const { data: dimukaList } = useQuery({
    queryKey: ["dimuka_by_pembayaran", pembayaranIds],
    enabled: pembayaranIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendapatan_dimuka")
        .select("pembayaran_id, status")
        .in("pembayaran_id", pembayaranIds);
      if (error) throw error;
      return data || [];
    },
  });

  const dimukaSet = new Set(dimukaList?.map((d: any) => d.pembayaran_id) || []);

  const isDimuka = (row: any) => {
    if (dimukaSet.has(row.id)) return true;
    if (row.keterangan && (row.keterangan as string).includes("[DIMUKA]")) return true;
    return false;
  };

  const regulerItems = data?.filter((r: any) => !isDimuka(r)) || [];
  const dimukaItems = data?.filter((r: any) => isDimuka(r)) || [];
  const totalReguler = regulerItems.reduce((s, r) => s + Number(r.jumlah || 0), 0);
  const totalDimuka = dimukaItems.reduce((s, r) => s + Number(r.jumlah || 0), 0);
  const total = totalReguler + totalDimuka;

  const columns: DataTableColumn<any>[] = [
    { key: "tanggal_bayar", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "siswa_nama", label: "Siswa", render: (_, r) => (r as any).siswa?.nama || "-" },
    { key: "jenis", label: "Jenis Bayar", render: (_, r) => (r as any).jenis_pembayaran?.nama || "-" },
    { key: "tahun_ajaran", label: "TA", render: (_, r) => (r as any).tahun_ajaran?.nama || "-" },
    { key: "lembaga", label: "Lembaga", render: (_, r) => (r as any).departemen?.kode || "-" },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    {
      key: "status_dimuka", label: "Status",
      render: (_, r) => isDimuka(r as any)
        ? <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Di Muka</Badge>
        : <Badge variant="outline" className="bg-success/15 text-success border-success/30">Reguler</Badge>,
    },
    {
      key: "jurnal", label: "Jurnal",
      render: (_, r) => {
        const j = (r as any).jurnal;
        if (j?.nomor) {
          return (
            <Badge
              className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 cursor-pointer hover:bg-emerald-500/20"
              variant="outline"
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              {j.nomor}
            </Badge>
          );
        }
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Manual</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label>Bulan</Label>
          <Select value={String(bulan)} onValueChange={(v) => setBulan(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{BULAN_ORDER_AKADEMIK.map((m) => <SelectItem key={m} value={String(m)}>{namaBulan(m)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-24" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
        </div>
        <div>
          <Label>Tahun Ajaran</Label>
          <Select value={filterTA} onValueChange={setFilterTA}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Semua TA" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tahun Ajaran</SelectItem>
              {tahunAjaranList?.map((ta: any) => (
                <SelectItem key={ta.id} value={ta.id}>{ta.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable columns={columns} data={data || []} loading={isLoading} exportable exportFilename="laporan-penerimaan" pageSize={20} />
          {!isLoading && (
            <div className="mt-4 space-y-1 text-right text-sm">
              <p>Penerimaan Reguler: <span className="font-semibold text-success">{formatRupiah(totalReguler)}</span></p>
              <p>Pembayaran Di Muka (Belum Diakui): <span className="font-semibold text-warning">{formatRupiah(totalDimuka)}</span></p>
              <p className="text-base font-bold border-t pt-2">Total: {formatRupiah(total)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TabPengeluaran({ departemenId }: { departemenId?: string }) {
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["laporan_pengeluaran_detail", bulan, tahun, departemenId],
    queryFn: async () => {
      const start = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
      const endM = bulan === 12 ? 1 : bulan + 1;
      const endY = bulan === 12 ? tahun + 1 : tahun;
      const end = `${endY}-${String(endM).padStart(2, "0")}-01`;
      let q = supabase
        .from("pengeluaran" as any)
        .select("*, jenis_pengeluaran:jenis_id(nama), departemen:departemen_id(nama, kode)")
        .gte("tanggal", start)
        .lt("tanggal", end)
        .order("tanggal", { ascending: false });
      if (departemenId) q = (q as any).eq("departemen_id", departemenId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const total = data?.reduce((s, r) => s + Number(r.jumlah || 0), 0) || 0;

  const columns: DataTableColumn<any>[] = [
    { key: "tanggal", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "jenis", label: "Jenis", render: (_, r) => r.jenis_pengeluaran?.nama || "-" },
    { key: "lembaga", label: "Lembaga", render: (_, r) => r.departemen?.kode || "-" },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end">
        <div>
          <Label>Bulan</Label>
          <Select value={String(bulan)} onValueChange={(v) => setBulan(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{BULAN_ORDER_AKADEMIK.map((m) => <SelectItem key={m} value={String(m)}>{namaBulan(m)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-24" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <DataTable columns={columns} data={data || []} loading={isLoading} exportable exportFilename="laporan-pengeluaran" pageSize={20} />
          {!isLoading && <p className="text-right font-bold mt-4">Total: {formatRupiah(total)}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function TabRekapSPP({ departemenId }: { departemenId?: string }) {
  const [kelasId, setKelasId] = useState("");
  const [filterTA, setFilterTA] = useState("");
  const [filterJenis, setFilterJenis] = useState("");
  const { data: kelasList } = useKelas();
  const { data: jenisList } = useJenisPembayaran();
  const { data: tahunAjaranList } = useQuery({
    queryKey: ["tahun_ajaran_list_spp"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tahun_ajaran").select("id, nama").order("nama", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Filter kelas by departemen
  const filteredKelas = departemenId
    ? kelasList?.filter((k: any) => k.departemen_id === departemenId)
    : kelasList;

  // Filter jenis pembayaran: only bulanan (SPP-type), and by departemen
  const filteredJenis = jenisList?.filter((j: any) => {
    if (j.tipe !== "bulanan") return false;
    if (departemenId && j.departemen_id && j.departemen_id !== departemenId) return false;
    return true;
  });

  // Auto-select first jenis if not set
  const jenisId = filterJenis || filteredJenis?.[0]?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["rekap_spp_kelas", kelasId, jenisId, filterTA, departemenId],
    enabled: !!kelasId && !!jenisId,
    queryFn: async () => {
      let kelasQuery = supabase
        .from("kelas_siswa")
        .select("siswa_id, siswa:siswa_id(nama, nis)")
        .eq("kelas_id", kelasId)
        .eq("aktif", true);
      if (filterTA) kelasQuery = kelasQuery.eq("tahun_ajaran_id", filterTA);

      const { data: siswaList } = await kelasQuery;
      if (!siswaList?.length) return [];

      const siswaIds = siswaList.map((s: any) => s.siswa_id);
      let payQuery = supabase
        .from("pembayaran")
        .select("siswa_id, bulan")
        .eq("jenis_id", jenisId)
        .in("siswa_id", siswaIds);
      if (filterTA) payQuery = payQuery.eq("tahun_ajaran_id", filterTA);
      if (departemenId) payQuery = payQuery.eq("departemen_id", departemenId);

      const { data: payments } = await payQuery;

      const paidMap = new Map<string, Set<number>>();
      payments?.forEach((p) => {
        if (!paidMap.has(p.siswa_id!)) paidMap.set(p.siswa_id!, new Set());
        paidMap.get(p.siswa_id!)!.add(p.bulan!);
      });

      return siswaList.map((ks: any) => {
        const paid = paidMap.get(ks.siswa_id) || new Set();
        const row: any = { nama: ks.siswa?.nama, nis: ks.siswa?.nis };
        for (let b = 1; b <= 12; b++) row[`b${b}`] = paid.has(b) ? "✓" : "✗";
        return row;
      });
    },
  });

  const sppColumns: DataTableColumn<any>[] = [
    { key: "nis", label: "NIS" },
    { key: "nama", label: "Nama" },
    ...BULAN_ORDER_AKADEMIK.map((m) => ({
      key: `b${m}`,
      label: BULAN_NAMES[m - 1].substring(0, 3),
      render: (v: unknown) => (
        <span className={v === "✓" ? "text-success font-bold" : "text-destructive font-bold"}>
          {v as string}
        </span>
      ),
    })),
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label>Tahun Ajaran</Label>
          <Select value={filterTA} onValueChange={(v) => { setFilterTA(v); setKelasId(""); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Pilih TA" /></SelectTrigger>
            <SelectContent>
              {tahunAjaranList?.map((ta: any) => (
                <SelectItem key={ta.id} value={ta.id}>{ta.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Jenis Pembayaran</Label>
          <Select value={jenisId} onValueChange={setFilterJenis}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
            <SelectContent>
              {filteredJenis?.map((j: any) => (
                <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Kelas</Label>
          <Select value={kelasId} onValueChange={setKelasId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
            <SelectContent>
              {filteredKelas?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {kelasId && jenisId ? (
        <Card>
          <CardContent className="pt-6">
            <DataTable columns={sppColumns} data={data || []} loading={isLoading} exportable exportFilename="rekap-spp" pageSize={50} searchable={false} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">Pilih tahun ajaran, jenis pembayaran, dan kelas untuk melihat rekap SPP</p>
      )}
    </div>
  );
}

function TabNeraca({ departemenId }: { departemenId?: string }) {
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());

  const start = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
  const endM = bulan === 12 ? 1 : bulan + 1;
  const endY = bulan === 12 ? tahun + 1 : tahun;
  const end = `${endY}-${String(endM).padStart(2, "0")}-01`;

  const { data: rawPenerimaan, isLoading: lP } = useQuery({
    queryKey: ["neraca_penerimaan_v2", bulan, tahun, departemenId],
    queryFn: async () => {
      let q = supabase
        .from("pembayaran")
        .select("id, jumlah, jenis_pembayaran:jenis_id(nama), keterangan")
        .gte("tanggal_bayar", start)
        .lt("tanggal_bayar", end);
      if (departemenId) q = q.eq("departemen_id", departemenId);
      const { data } = await q;
      return data || [];
    },
  });

  // Cross-reference dimuka
  const pembIds = rawPenerimaan?.map((r: any) => r.id).filter(Boolean) || [];
  const { data: dimukaRefs } = useQuery({
    queryKey: ["neraca_dimuka_refs", pembIds],
    enabled: pembIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("pendapatan_dimuka").select("pembayaran_id").in("pembayaran_id", pembIds);
      return new Set((data || []).map((d: any) => d.pembayaran_id));
    },
  });

  const dimukaSetN = dimukaRefs || new Set<string>();
  const isDimukaN = (r: any) => dimukaSetN.has(r.id) || (r.keterangan && (r.keterangan as string).includes("[DIMUKA]"));

  const penerimaan = (() => {
    const grouped = new Map<string, number>();
    let totalDimuka = 0;
    rawPenerimaan?.forEach((r: any) => {
      if (isDimukaN(r)) {
        totalDimuka += Number(r.jumlah);
      } else {
        const key = r.jenis_pembayaran?.nama || "Lainnya";
        grouped.set(key, (grouped.get(key) || 0) + Number(r.jumlah));
      }
    });
    const items = Array.from(grouped, ([nama, total]) => ({ nama, total }));
    return { items, totalDimuka };
  })();

  const { data: pengeluaran, isLoading: lE } = useQuery({
    queryKey: ["neraca_pengeluaran", bulan, tahun, departemenId],
    queryFn: async () => {
      let q = supabase
        .from("pengeluaran" as any)
        .select("jumlah, jenis_pengeluaran:jenis_id(nama)")
        .gte("tanggal", start)
        .lt("tanggal", end);
      if (departemenId) q = (q as any).eq("departemen_id", departemenId);
      const { data } = await q;
      const grouped = new Map<string, number>();
      (data as any[])?.forEach((r: any) => {
        const key = r.jenis_pengeluaran?.nama || "Lainnya";
        grouped.set(key, (grouped.get(key) || 0) + Number(r.jumlah));
      });
      return Array.from(grouped, ([nama, total]) => ({ nama, total }));
    },
  });

  const totalP = penerimaan.items.reduce((s, r) => s + r.total, 0);
  const totalDimuka = penerimaan.totalDimuka;
  const totalE = pengeluaran?.reduce((s, r) => s + r.total, 0) || 0;
  const saldo = totalP - totalE;
  const loading = lP || lE;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end">
        <div>
          <Label>Bulan</Label>
          <Select value={String(bulan)} onValueChange={(v) => setBulan(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{BULAN_ORDER_AKADEMIK.map((m) => <SelectItem key={m} value={String(m)}>{namaBulan(m)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-24" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
        </div>
      </div>

      {loading ? <Skeleton className="h-48" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-success">Penerimaan (Reguler)</CardTitle></CardHeader>
            <CardContent>
              {penerimaan.items.map((r) => (
                <div key={r.nama} className="flex justify-between py-1.5 border-b last:border-0">
                  <span>{r.nama}</span><span className="font-medium">{formatRupiah(r.total)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 font-bold border-t mt-2">
                <span>Total Penerimaan Reguler</span><span className="text-success">{formatRupiah(totalP)}</span>
              </div>
              {totalDimuka > 0 && (
                <div className="flex justify-between pt-2 text-sm text-warning">
                  <span>Pembayaran Di Muka (Kewajiban)</span><span className="font-semibold">{formatRupiah(totalDimuka)}</span>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-destructive">Pengeluaran</CardTitle></CardHeader>
            <CardContent>
              {pengeluaran?.map((r) => (
                <div key={r.nama} className="flex justify-between py-1.5 border-b last:border-0">
                  <span>{r.nama}</span><span className="font-medium">{formatRupiah(r.total)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 font-bold border-t mt-2">
                <span>Total Pengeluaran</span><span className="text-destructive">{formatRupiah(totalE)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center text-lg">
            <span className="font-bold">Saldo Akhir (Reguler)</span>
            <span className={`font-bold text-xl ${saldo >= 0 ? "text-success" : "text-destructive"}`}>
              {formatRupiah(saldo)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TabKonsolidasi() {
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const { data: rekapLembaga, isLoading } = useRekapKeuanganPerLembaga(tahun);

  const totalPemasukan = rekapLembaga?.reduce((s, r) => s + r.totalPemasukan, 0) || 0;
  const totalPengeluaran = rekapLembaga?.reduce((s, r) => s + r.totalPengeluaran, 0) || 0;
  const totalSaldo = totalPemasukan - totalPengeluaran;

  const chartData = rekapLembaga?.map((r) => ({
    name: r.kode || r.lembaga,
    Pemasukan: r.totalPemasukan,
    Pengeluaran: r.totalPengeluaran,
  })) || [];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end">
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-24" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} />
        </div>
        <ExportButton data={rekapLembaga || []} filename={`konsolidasi-yayasan-${tahun}`} />
      </div>

      {isLoading ? <Skeleton className="h-64" /> : (
        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-bold">LAPORAN KONSOLIDASI KEUANGAN YAYASAN</h2>
              <p className="text-sm text-muted-foreground">Periode: Tahun {tahun}</p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lembaga</TableHead>
                  <TableHead className="text-right">Total Pemasukan</TableHead>
                  <TableHead className="text-right">Total Pengeluaran</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rekapLembaga?.map((r) => (
                  <TableRow key={r.departemen_id}>
                    <TableCell>
                      <span className="font-medium text-primary">{r.kode}</span>{" "}
                      {r.lembaga}
                    </TableCell>
                    <TableCell className="text-right">{formatRupiah(r.totalPemasukan)}</TableCell>
                    <TableCell className="text-right">{formatRupiah(r.totalPengeluaran)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.saldo >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatRupiah(r.saldo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-bold">
                  <TableCell>TOTAL YAYASAN</TableCell>
                  <TableCell className="text-right">{formatRupiah(totalPemasukan)}</TableCell>
                  <TableCell className="text-right">{formatRupiah(totalPengeluaran)}</TableCell>
                  <TableCell className={`text-right ${totalSaldo >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatRupiah(totalSaldo)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>

            {/* Bar chart per lembaga */}
            <div className="pt-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}jt`} />
                  <Tooltip formatter={(v: number) => formatRupiah(v)} />
                  <Legend />
                  <Bar dataKey="Pemasukan" fill="hsl(var(--success))" radius={[4,4,0,0]} />
                  <Bar dataKey="Pengeluaran" fill="hsl(var(--destructive))" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
