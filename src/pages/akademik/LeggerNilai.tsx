import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButton } from "@/components/shared/ExportButton";
import { useDepartemen, useKelas, useTahunAjaran, useSemester } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

const nilaiColor = (n: number) => n >= 80 ? "text-emerald-600" : n >= 70 ? "text-yellow-600" : "text-red-600";

export default function LeggerNilai() {
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [kelasId, setKelasId] = useState("");

  const { data: depts } = useDepartemen();
  const { data: kelasList } = useKelas();
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);
  const filteredKelas = deptId ? kelasList?.filter((k: any) => k.departemen?.id === deptId) : kelasList;

  const { data: leggerData, isLoading } = useQuery({
    queryKey: ["legger", kelasId, taId, semId],
    enabled: !!kelasId && !!taId && !!semId,
    queryFn: async () => {
      const [{ data: mapels }, { data: ksList }, { data: nilaiData }, { data: kelasData }] = await Promise.all([
        supabase.from("mata_pelajaran").select("id, nama, kode").eq("aktif", true).order("nama"),
        supabase.from("kelas_siswa").select("siswa:siswa_id(id, nis, nama, jenis_kelamin)").eq("kelas_id", kelasId).eq("aktif", true),
        supabase.from("penilaian").select("siswa_id, mapel_id, nilai").eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId),
        supabase.from("kelas").select("nama").eq("id", kelasId).single(),
      ]);

      const siswaList = (ksList || []).map((ks: any) => ks.siswa).filter(Boolean).sort((a: any, b: any) => a.nama.localeCompare(b.nama));

      // Group: siswa_id -> mapel_id -> values[]
      const nilaiGrouped = new Map<string, Map<string, number[]>>();
      (nilaiData || []).forEach((n: any) => {
        if (!nilaiGrouped.has(n.siswa_id)) nilaiGrouped.set(n.siswa_id, new Map());
        const sm = nilaiGrouped.get(n.siswa_id)!;
        if (!sm.has(n.mapel_id)) sm.set(n.mapel_id, []);
        sm.get(n.mapel_id)!.push(Number(n.nilai));
      });

      const rows = siswaList.map((s: any) => {
        const sm = nilaiGrouped.get(s.id) || new Map();
        const mapelAvgs: Record<string, number | null> = {};
        let total = 0, count = 0;
        (mapels || []).forEach((m: any) => {
          const vals = sm.get(m.id);
          if (vals?.length) {
            const avg = Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length);
            mapelAvgs[m.id] = avg;
            total += avg;
            count++;
          } else {
            mapelAvgs[m.id] = null;
          }
        });
        const rataRata = count ? Math.round((total / count) * 10) / 10 : 0;
        return { ...s, mapelAvgs, rataRata, jumlah: total };
      });

      // Ranking
      rows.sort((a, b) => b.rataRata - a.rataRata);
      rows.forEach((r, i) => { (r as any).peringkat = i + 1; });

      // Mapel averages
      const mapelAvgs: Record<string, number> = {};
      (mapels || []).forEach((m: any) => {
        const vals = rows.map(r => r.mapelAvgs[m.id]).filter((v): v is number => v !== null);
        mapelAvgs[m.id] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;
      });

      return { rows, mapels: mapels || [], kelas: kelasData, mapelAvgs };
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const exportData = leggerData?.rows.map((r: any, i: number) => {
    const row: Record<string, any> = { No: i + 1, NIS: r.nis, Nama: r.nama, "L/P": r.jenis_kelamin };
    leggerData.mapels.forEach((m: any) => { row[m.kode || m.nama] = r.mapelAvgs[m.id] ?? ""; });
    row["Jumlah"] = r.jumlah;
    row["Rata-rata"] = r.rataRata;
    row["Peringkat"] = r.peringkat;
    return row;
  }) || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Legger Nilai</h1>
        <p className="text-sm text-muted-foreground">Rekap nilai seluruh mata pelajaran per kelas</p>
      </div>

      <Card><CardContent className="pt-6">
        <div className="flex gap-3 items-end flex-wrap">
          <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Lembaga</Label><Select value={deptId} onValueChange={(v) => { setDeptId(v); setKelasId(""); }}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.kode || d.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Kelas</Label><Select value={kelasId} onValueChange={setKelasId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{filteredKelas?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </CardContent></Card>

      {kelasId && taId && semId && (
        isLoading ? <Skeleton className="h-[500px]" /> : leggerData && (
          <>
            <div className="flex gap-2 justify-end">
              <ExportButton data={exportData} filename={`legger-${leggerData.kelas?.nama}`} />
              <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Cetak</Button>
            </div>

            <Card>
              <CardContent className="pt-6 overflow-x-auto">
                <p className="text-center font-bold mb-4 text-lg">LEGGER NILAI — Kelas {leggerData.kelas?.nama}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">No</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>Nama Siswa</TableHead>
                      <TableHead className="w-10">L/P</TableHead>
                      {leggerData.mapels.map((m: any) => (
                        <TableHead key={m.id} className="text-center text-xs min-w-[50px] [writing-mode:vertical-lr] rotate-180 h-24">
                          {m.kode || m.nama}
                        </TableHead>
                      ))}
                      <TableHead className="text-center">Jml</TableHead>
                      <TableHead className="text-center">Rata²</TableHead>
                      <TableHead className="text-center">Rank</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leggerData.rows.map((r: any, i: number) => (
                      <TableRow key={r.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="text-xs">{r.nis || "-"}</TableCell>
                        <TableCell className="font-medium text-sm whitespace-nowrap">{r.nama}</TableCell>
                        <TableCell>{r.jenis_kelamin || "-"}</TableCell>
                        {leggerData.mapels.map((m: any) => (
                          <TableCell key={m.id} className={cn("text-center text-xs font-mono", r.mapelAvgs[m.id] != null && nilaiColor(r.mapelAvgs[m.id]))}>
                            {r.mapelAvgs[m.id] ?? "-"}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-bold text-xs">{r.jumlah || "-"}</TableCell>
                        <TableCell className={cn("text-center font-bold text-xs", r.rataRata > 0 && nilaiColor(r.rataRata))}>{r.rataRata || "-"}</TableCell>
                        <TableCell className="text-center font-bold">{r.peringkat}</TableCell>
                      </TableRow>
                    ))}
                    {/* Average row */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4} className="text-right">Rata-rata Kelas</TableCell>
                      {leggerData.mapels.map((m: any) => (
                        <TableCell key={m.id} className="text-center text-xs">{leggerData.mapelAvgs[m.id] || "-"}</TableCell>
                      ))}
                      <TableCell colSpan={3}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
