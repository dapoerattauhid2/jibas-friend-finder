import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useDepartemen, useKelas, useTahunAjaran, useSemester } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const nilaiHuruf = (n: number) => n >= 90 ? "A" : n >= 80 ? "B" : n >= 70 ? "C" : n >= 60 ? "D" : "E";
const nilaiPredikat = (n: number) => n >= 90 ? "Sangat Baik" : n >= 80 ? "Baik" : n >= 70 ? "Cukup" : n >= 60 ? "Kurang" : "Sangat Kurang";

export default function CetakRapor() {
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [siswaId, setSiswaId] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const { data: depts } = useDepartemen();
  const { data: kelasList } = useKelas();
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);
  const filteredKelas = deptId ? kelasList?.filter((k: any) => k.departemen?.id === deptId) : kelasList;

  const { data: siswaList } = useQuery({
    queryKey: ["rapor_siswa_list", kelasId],
    enabled: !!kelasId,
    queryFn: async () => {
      const { data } = await supabase.from("kelas_siswa").select("siswa:siswa_id(id, nis, nama, jenis_kelamin, tempat_lahir, tanggal_lahir, agama)").eq("kelas_id", kelasId).eq("aktif", true);
      return (data || []).map((ks: any) => ks.siswa).filter(Boolean).sort((a: any, b: any) => a.nama.localeCompare(b.nama));
    },
  });

  const { data: raporData, isLoading } = useQuery({
    queryKey: ["rapor_data", siswaId, kelasId, taId, semId],
    enabled: !!siswaId && !!kelasId && !!taId && !!semId,
    queryFn: async () => {
      const [{ data: mapels }, { data: nilaiData }, { data: presensiData }, { data: sekolahData }, { data: kelasData }] = await Promise.all([
        supabase.from("mata_pelajaran").select("id, nama, kode").eq("aktif", true).order("nama"),
        supabase.from("penilaian").select("mapel_id, jenis_ujian, nilai").eq("siswa_id", siswaId).eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId),
        supabase.from("presensi_siswa").select("status").eq("siswa_id", siswaId).eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId),
        supabase.from("sekolah").select("*").limit(1).single(),
        supabase.from("kelas").select("nama, wali_kelas_id, pegawai:wali_kelas_id(nama)").eq("id", kelasId).single(),
      ]);

      // Group nilai by mapel, average all jenis_ujian
      const nilaiByMapel = new Map<string, number[]>();
      (nilaiData || []).forEach((n: any) => {
        if (!nilaiByMapel.has(n.mapel_id)) nilaiByMapel.set(n.mapel_id, []);
        nilaiByMapel.get(n.mapel_id)!.push(Number(n.nilai));
      });

      const rows = (mapels || []).map((m: any) => {
        const vals = nilaiByMapel.get(m.id) || [];
        const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        return { mapel: m.nama, kode: m.kode, nilai: avg, huruf: avg ? nilaiHuruf(avg) : "-", predikat: avg ? nilaiPredikat(avg) : "-" };
      });

      // Presensi summary
      const presensi = { H: 0, I: 0, S: 0, A: 0 };
      (presensiData || []).forEach((p: any) => { if (p.status in presensi) presensi[p.status as keyof typeof presensi]++; });

      // Ranking
      const { data: allKsList } = await supabase.from("kelas_siswa").select("siswa_id").eq("kelas_id", kelasId).eq("aktif", true);
      const { data: allNilai } = await supabase.from("penilaian").select("siswa_id, nilai").eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId);
      const avgBySiswa = new Map<string, number[]>();
      (allNilai || []).forEach((n: any) => {
        if (!avgBySiswa.has(n.siswa_id)) avgBySiswa.set(n.siswa_id, []);
        avgBySiswa.get(n.siswa_id)!.push(Number(n.nilai));
      });
      const rankings = Array.from(avgBySiswa.entries()).map(([id, vals]) => ({
        id, avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      })).sort((a, b) => b.avg - a.avg);
      const rank = rankings.findIndex((r) => r.id === siswaId) + 1;
      const totalSiswa = (allKsList || []).length;

      const siswa = siswaList?.find((s: any) => s.id === siswaId);
      const ta = taList?.find((t: any) => t.id === taId);
      const sem = semList?.find((s: any) => s.id === semId);

      return { rows, presensi, rank, totalSiswa, sekolah: sekolahData, kelas: kelasData, siswa, ta, sem };
    },
  });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Rapor - ${raporData?.siswa?.nama}</title><style>
      body { font-family: 'Times New Roman', serif; margin: 20px 40px; font-size: 12pt; color: #000; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
      th { background: #f0f0f0; }
      .text-center { text-align: center; }
      .header { text-align: center; margin-bottom: 16px; border-bottom: 3px double #000; padding-bottom: 12px; }
      .header h2 { margin: 0; font-size: 16pt; }
      .header p { margin: 2px 0; font-size: 10pt; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 12px 0; font-size: 11pt; }
      .sign-area { display: flex; justify-content: space-between; margin-top: 40px; }
      .sign-box { text-align: center; width: 200px; }
      .sign-box .line { margin-top: 60px; border-top: 1px solid #000; }
      @media print { body { margin: 0; } }
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cetak Rapor</h1>
        <p className="text-sm text-muted-foreground">Cetak rapor siswa per semester</p>
      </div>

      <Card><CardContent className="pt-6">
        <div className="flex gap-3 items-end flex-wrap">
          <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Lembaga</Label><Select value={deptId} onValueChange={(v) => { setDeptId(v); setKelasId(""); setSiswaId(""); }}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.kode || d.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Kelas</Label><Select value={kelasId} onValueChange={(v) => { setKelasId(v); setSiswaId(""); }}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{filteredKelas?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Siswa</Label><Select value={siswaId} onValueChange={setSiswaId}><SelectTrigger className="w-56"><SelectValue placeholder="Pilih siswa" /></SelectTrigger><SelectContent>{siswaList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nis ? `${s.nis} - ` : ""}{s.nama}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </CardContent></Card>

      {siswaId && taId && semId && kelasId && (
        isLoading ? <Skeleton className="h-[600px]" /> : raporData && (
          <>
            <div className="flex gap-2 justify-end">
              <Button onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Cetak Rapor</Button>
            </div>

            {/* Print preview */}
            <Card>
              <CardContent className="pt-6">
                <div ref={printRef}>
                  <div className="header text-center border-b-2 border-foreground pb-3 mb-4">
                    <h2 className="text-xl font-bold">{raporData.sekolah?.nama || "Sekolah"}</h2>
                    <p className="text-sm text-muted-foreground">{raporData.sekolah?.alamat}</p>
                    <p className="text-sm text-muted-foreground">NPSN: {raporData.sekolah?.npsn} | Telp: {raporData.sekolah?.telepon}</p>
                    <Separator className="mt-3" />
                    <p className="font-bold mt-2 text-lg">LAPORAN HASIL BELAJAR SISWA</p>
                    <p className="text-sm">{raporData.sem?.nama} — {raporData.ta?.nama}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm mb-4">
                    <p><span className="text-muted-foreground">Nama Siswa:</span> <strong>{raporData.siswa?.nama}</strong></p>
                    <p><span className="text-muted-foreground">Kelas:</span> <strong>{raporData.kelas?.nama}</strong></p>
                    <p><span className="text-muted-foreground">NIS:</span> {raporData.siswa?.nis || "-"}</p>
                    <p><span className="text-muted-foreground">Wali Kelas:</span> {(raporData.kelas as any)?.pegawai?.nama || "-"}</p>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">No</TableHead>
                        <TableHead>Mata Pelajaran</TableHead>
                        <TableHead className="text-center w-20">Nilai</TableHead>
                        <TableHead className="text-center w-16">Huruf</TableHead>
                        <TableHead className="text-center">Predikat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {raporData.rows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{r.mapel}</TableCell>
                          <TableCell className={cn("text-center font-bold", r.nilai && r.nilai >= 70 ? "text-emerald-600" : r.nilai ? "text-red-600" : "")}>{r.nilai ?? "-"}</TableCell>
                          <TableCell className="text-center">{r.huruf}</TableCell>
                          <TableCell className="text-center text-sm">{r.predikat}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell colSpan={2}>Rata-rata</TableCell>
                        <TableCell className="text-center">{(() => { const vals = raporData.rows.filter(r => r.nilai).map(r => r.nilai!); return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "-"; })()}</TableCell>
                        <TableCell colSpan={2} className="text-center">Peringkat: {raporData.rank} dari {raporData.totalSiswa} siswa</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  <div className="mt-4 text-sm">
                    <p className="font-semibold mb-1">Rekap Kehadiran:</p>
                    <div className="flex gap-6">
                      <span>Hadir: <strong>{raporData.presensi.H}</strong></span>
                      <span>Izin: <strong>{raporData.presensi.I}</strong></span>
                      <span>Sakit: <strong>{raporData.presensi.S}</strong></span>
                      <span>Alpha: <strong>{raporData.presensi.A}</strong></span>
                    </div>
                  </div>

                  <div className="flex justify-between mt-12 text-sm">
                    <div className="text-center w-48">
                      <p>Wali Kelas</p>
                      <div className="mt-16 border-t border-foreground pt-1">
                        <p className="font-semibold">{(raporData.kelas as any)?.pegawai?.nama || "_______________"}</p>
                      </div>
                    </div>
                    <div className="text-center w-48">
                      <p>Kepala Sekolah</p>
                      <div className="mt-16 border-t border-foreground pt-1">
                        <p className="font-semibold">{raporData.sekolah?.kepala_sekolah || "_______________"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
