import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExportButton } from "@/components/shared/ExportButton";
import { StatsCard } from "@/components/shared/StatsCard";
import { useAuth } from "@/contexts/AuthContext";
import { useDepartemen, useKelas, useTahunAjaran, useSemester } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Calculator, TrendingUp, TrendingDown, Users } from "lucide-react";

const JENIS_UJIAN = ["Ulangan Harian", "UTS", "UAS", "Tugas", "Praktik"];
const nilaiHuruf = (n: number) => n >= 90 ? "A" : n >= 80 ? "B" : n >= 70 ? "C" : n >= 60 ? "D" : "E";
const nilaiColor = (n: number) => n >= 80 ? "text-emerald-600" : n >= 70 ? "text-yellow-600" : "text-red-600";

export default function Penilaian() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Penilaian</h1>
        <p className="text-sm text-muted-foreground">Input nilai dan lihat rekap penilaian siswa</p>
      </div>
      <Tabs defaultValue="input">
        <TabsList><TabsTrigger value="input">Input Nilai</TabsTrigger><TabsTrigger value="rekap">Rekap Nilai</TabsTrigger><TabsTrigger value="statistik">Statistik</TabsTrigger></TabsList>
        <TabsContent value="input"><InputNilai /></TabsContent>
        <TabsContent value="rekap"><RekapNilai /></TabsContent>
        <TabsContent value="statistik"><StatistikNilai /></TabsContent>
      </Tabs>
    </div>
  );
}

function InputNilai() {
  const qc = useQueryClient();
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [mapelId, setMapelId] = useState("");
  const [jenisUjian, setJenisUjian] = useState("");
  const [showTable, setShowTable] = useState(false);
  const [nilaiMap, setNilaiMap] = useState<Record<string, { nilai: string; keterangan: string }>>({});

  const { data: depts } = useDepartemen();
  const { data: kelasList } = useKelas();
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);
  const filteredKelas = deptId ? kelasList?.filter((k: any) => k.departemen?.id === deptId) : kelasList;

  const { data: mapelList } = useQuery({
    queryKey: ["mapel_penilaian", deptId],
    enabled: !!deptId,
    queryFn: async () => { const { data } = await supabase.from("mata_pelajaran").select("id, nama, kode").eq("aktif", true).order("nama"); return data || []; },
  });

  const { data: siswaData, isLoading, refetch } = useQuery({
    queryKey: ["penilaian_input", kelasId, mapelId, taId, semId, jenisUjian],
    enabled: showTable && !!kelasId && !!mapelId && !!taId && !!semId && !!jenisUjian,
    queryFn: async () => {
      const { data: ksList } = await supabase.from("kelas_siswa").select("siswa:siswa_id(id, nis, nama)").eq("kelas_id", kelasId).eq("aktif", true);
      const { data: existing } = await supabase.from("penilaian").select("siswa_id, nilai, keterangan").eq("mapel_id", mapelId).eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId).eq("jenis_ujian", jenisUjian);
      const existMap = new Map((existing || []).map((e) => [e.siswa_id, e]));
      const siswaList = (ksList || []).map((ks: any) => ks.siswa).filter(Boolean).sort((a: any, b: any) => a.nama.localeCompare(b.nama));
      const map: Record<string, { nilai: string; keterangan: string }> = {};
      siswaList.forEach((s: any) => { const ex = existMap.get(s.id); map[s.id] = { nilai: ex?.nilai != null ? String(ex.nilai) : "", keterangan: ex?.keterangan || "" }; });
      setNilaiMap(map);
      return siswaList;
    },
  });

  const summary = useMemo(() => {
    const vals = Object.values(nilaiMap).map((v) => Number(v.nilai)).filter((n) => !isNaN(n) && v => true);
    const numbers = Object.values(nilaiMap).map((v) => Number(v.nilai)).filter((n) => !isNaN(n) && n > 0);
    const avg = numbers.length ? numbers.reduce((s, n) => s + n, 0) / numbers.length : 0;
    const max = numbers.length ? Math.max(...numbers) : 0;
    const min = numbers.length ? Math.min(...numbers) : 0;
    const belum = Object.values(nilaiMap).filter((v) => !v.nilai).length;
    return { avg, max, min, belum };
  }, [nilaiMap]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(nilaiMap).filter(([_, v]) => v.nilai).map(([siswa_id, v]) => ({
        siswa_id, mapel_id: mapelId, kelas_id: kelasId, tahun_ajaran_id: taId, semester_id: semId,
        jenis_ujian: jenisUjian, nilai: Number(v.nilai), keterangan: v.keterangan || null,
      }));
      const { error } = await supabase.from("penilaian").upsert(rows, { onConflict: "siswa_id,mapel_id,kelas_id,tahun_ajaran_id,semester_id,jenis_ujian" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["penilaian"] }); toast.success("Nilai berhasil disimpan"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 pt-4">
      <Card><CardContent className="pt-6">
        <div className="flex gap-3 items-end flex-wrap">
          <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Lembaga</Label><Select value={deptId} onValueChange={(v) => { setDeptId(v); setKelasId(""); }}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.kode || d.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Kelas</Label><Select value={kelasId} onValueChange={setKelasId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{filteredKelas?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Mata Pelajaran</Label><Select value={mapelId} onValueChange={setMapelId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{mapelList?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Jenis Ujian</Label><Select value={jenisUjian} onValueChange={setJenisUjian}><SelectTrigger className="w-40"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{JENIS_UJIAN.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={() => setShowTable(true)} disabled={!kelasId || !mapelId || !taId || !semId || !jenisUjian}>Tampilkan</Button>
        </div>
      </CardContent></Card>

      {showTable && siswaData && (
        <>
          <div className="flex justify-end"><Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>{saveMut.isPending ? "Menyimpan..." : "Simpan Semua Nilai"}</Button></div>
          {isLoading ? <Skeleton className="h-96" /> : (
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead className="w-10">No</TableHead><TableHead>NIS</TableHead><TableHead>Nama</TableHead><TableHead className="w-24">Nilai</TableHead><TableHead>Keterangan</TableHead><TableHead className="w-16">Huruf</TableHead></TableRow></TableHeader>
                <TableBody>
                  {siswaData.map((s: any, i: number) => {
                    const n = Number(nilaiMap[s.id]?.nilai);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="text-xs">{s.nis || "-"}</TableCell>
                        <TableCell className="font-medium text-sm">{s.nama}</TableCell>
                        <TableCell><Input type="number" min={0} max={100} className={cn("h-8 w-20 text-center font-bold", !isNaN(n) && n > 0 && nilaiColor(n))} value={nilaiMap[s.id]?.nilai || ""} onChange={(e) => setNilaiMap((prev) => ({ ...prev, [s.id]: { ...prev[s.id], nilai: e.target.value } }))} /></TableCell>
                        <TableCell><Input className="h-8 text-xs" value={nilaiMap[s.id]?.keterangan || ""} onChange={(e) => setNilaiMap((prev) => ({ ...prev, [s.id]: { ...prev[s.id], keterangan: e.target.value } }))} /></TableCell>
                        <TableCell className={cn("font-bold", !isNaN(n) && n > 0 && nilaiColor(n))}>{!isNaN(n) && n > 0 ? nilaiHuruf(n) : "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
          <div className="flex gap-4 text-sm">
            <span>Rata-rata: <strong>{summary.avg.toFixed(1)}</strong></span>
            <span>Tertinggi: <strong>{summary.max}</strong></span>
            <span>Terendah: <strong>{summary.min}</strong></span>
            <span>Belum dinilai: <strong>{summary.belum}</strong></span>
          </div>
        </>
      )}
    </div>
  );
}

function RekapNilai() {
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);
  const { data: kelasList } = useKelas();

  const { data: rekapData, isLoading } = useQuery({
    queryKey: ["rekap_nilai", kelasId, taId, semId],
    enabled: !!kelasId && !!taId && !!semId,
    queryFn: async () => {
      const { data: mapels } = await supabase.from("mata_pelajaran").select("id, nama, kode").eq("aktif", true).order("nama");
      const { data: ksList } = await supabase.from("kelas_siswa").select("siswa:siswa_id(id, nis, nama)").eq("kelas_id", kelasId).eq("aktif", true);
      const { data: nilaiData } = await supabase.from("penilaian").select("siswa_id, mapel_id, nilai").eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId);

      const siswaList = (ksList || []).map((ks: any) => ks.siswa).filter(Boolean).sort((a: any, b: any) => a.nama.localeCompare(b.nama));
      const nilaiGrouped = new Map<string, Map<string, number[]>>();
      (nilaiData || []).forEach((n: any) => {
        if (!nilaiGrouped.has(n.siswa_id)) nilaiGrouped.set(n.siswa_id, new Map());
        const sm = nilaiGrouped.get(n.siswa_id)!;
        if (!sm.has(n.mapel_id)) sm.set(n.mapel_id, []);
        sm.get(n.mapel_id)!.push(Number(n.nilai));
      });

      const rows = siswaList.map((s: any) => {
        const sm = nilaiGrouped.get(s.id) || new Map();
        const mapelAvgs: Record<string, number> = {};
        let totalAvg = 0, count = 0;
        (mapels || []).forEach((m: any) => {
          const vals = sm.get(m.id);
          if (vals?.length) { const avg = vals.reduce((a, b) => a + b, 0) / vals.length; mapelAvgs[m.id] = Math.round(avg * 10) / 10; totalAvg += avg; count++; }
        });
        return { ...s, mapelAvgs, rataRata: count ? Math.round((totalAvg / count) * 10) / 10 : 0 };
      }).sort((a, b) => b.rataRata - a.rataRata);

      rows.forEach((r, i) => { r.peringkat = i + 1; });
      return { rows, mapels: mapels || [] };
    },
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Kelas</Label><Select value={kelasId} onValueChange={setKelasId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
        {rekapData && <ExportButton data={rekapData.rows.map((r: any) => ({ NIS: r.nis, Nama: r.nama, "Rata-rata": r.rataRata, Peringkat: r.peringkat }))} filename="rekap-nilai" />}
      </div>
      {kelasId && taId && semId && (isLoading ? <Skeleton className="h-96" /> : (
        <Card><CardContent className="pt-6 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>No</TableHead><TableHead>Nama</TableHead>
              {rekapData?.mapels.map((m: any) => <TableHead key={m.id} className="text-xs text-center">{m.kode || m.nama.slice(0, 8)}</TableHead>)}
              <TableHead className="text-center">Rata-rata</TableHead><TableHead className="text-center">Peringkat</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rekapData?.rows.map((r: any, i: number) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium text-sm">{r.nama}</TableCell>
                  {rekapData.mapels.map((m: any) => <TableCell key={m.id} className={cn("text-center text-xs", r.mapelAvgs[m.id] != null && nilaiColor(r.mapelAvgs[m.id]))}>{r.mapelAvgs[m.id] ?? "-"}</TableCell>)}
                  <TableCell className="text-center font-bold">{r.rataRata || "-"}</TableCell>
                  <TableCell className="text-center font-bold">{r.peringkat}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      ))}
    </div>
  );
}

function StatistikNilai() {
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [mapelId, setMapelId] = useState("");
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);
  const { data: kelasList } = useKelas();
  const { data: mapelList } = useQuery({
    queryKey: ["mapel_stat"],
    queryFn: async () => { const { data } = await supabase.from("mata_pelajaran").select("id, nama").eq("aktif", true).order("nama"); return data || []; },
  });

  const { data: stats, isLoading } = useQuery({
    queryKey: ["statistik_nilai", kelasId, mapelId, taId, semId],
    enabled: !!kelasId && !!mapelId && !!taId && !!semId,
    queryFn: async () => {
      const { data } = await supabase.from("penilaian").select("nilai").eq("kelas_id", kelasId).eq("mapel_id", mapelId).eq("tahun_ajaran_id", taId).eq("semester_id", semId);
      const vals = (data || []).map((r) => Number(r.nilai)).filter((n) => !isNaN(n));
      const dist = [{ range: "0-59", count: 0, fill: "hsl(0, 72%, 51%)" }, { range: "60-69", count: 0, fill: "hsl(25, 95%, 53%)" }, { range: "70-79", count: 0, fill: "hsl(38, 92%, 50%)" }, { range: "80-89", count: 0, fill: "hsl(199, 89%, 48%)" }, { range: "90-100", count: 0, fill: "hsl(142, 71%, 45%)" }];
      vals.forEach((v) => { if (v < 60) dist[0].count++; else if (v < 70) dist[1].count++; else if (v < 80) dist[2].count++; else if (v < 90) dist[3].count++; else dist[4].count++; });
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { dist, avg: Math.round(avg * 10) / 10, max: vals.length ? Math.max(...vals) : 0, min: vals.length ? Math.min(...vals) : 0, lulus: vals.filter((v) => v >= 70).length, total: vals.length };
    },
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="flex gap-3 items-end flex-wrap">
        <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Kelas</Label><Select value={kelasId} onValueChange={setKelasId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Mata Pelajaran</Label><Select value={mapelId} onValueChange={setMapelId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{mapelList?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nama}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {stats && !isLoading && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatsCard title="Rata-rata" value={stats.avg} icon={Calculator} color="primary" />
            <StatsCard title="Tertinggi" value={stats.max} icon={TrendingUp} color="success" />
            <StatsCard title="Terendah" value={stats.min} icon={TrendingDown} color="destructive" />
            <StatsCard title="Lulus (≥70)" value={`${stats.lulus}/${stats.total}`} icon={Users} color="info" />
          </div>
          <Card><CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.dist}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" name="Jumlah Siswa">
                  {stats.dist.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

// Need Cell import for BarChart
import { Cell } from "recharts";
