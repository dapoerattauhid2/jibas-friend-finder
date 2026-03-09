import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap } from "lucide-react";

export default function PortalNilai() {
  const { user } = useAuth();
  const [selectedSiswa, setSelectedSiswa] = useState("");

  const { data: anakList = [] } = useQuery({
    queryKey: ["portal-anak-nilai", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select("siswa_id, siswa:siswa_id (id, nama, nis)")
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const effectiveSiswa = selectedSiswa || anakList[0]?.siswa_id || "";

  const { data: nilai = [], isLoading } = useQuery({
    queryKey: ["portal-nilai", effectiveSiswa],
    queryFn: async () => {
      const { data } = await supabase
        .from("penilaian")
        .select(`
          *,
          mapel:mapel_id (nama, kode),
          kelas:kelas_id (nama),
          semester:semester_id (nama),
          tahun_ajaran:tahun_ajaran_id (nama)
        `)
        .eq("siswa_id", effectiveSiswa)
        .order("tahun_ajaran_id", { ascending: false });
      return data || [];
    },
    enabled: !!effectiveSiswa,
  });

  // Group by tahun_ajaran + semester
  const grouped = nilai.reduce((acc: any, n: any) => {
    const key = `${n.tahun_ajaran?.nama || "-"} — ${n.semester?.nama || "-"}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {} as Record<string, any[]>);

  const selectedAnak = anakList.find((a: any) => a.siswa_id === effectiveSiswa);
  const siswaInfo = selectedAnak?.siswa;
  const activeKelas = siswaInfo?.kelas_siswa?.find((ks: any) => ks.aktif);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nilai Anak</h1>
        <p className="text-sm text-muted-foreground">Lihat nilai akademik anak per semester</p>
      </div>

      {anakList.length > 1 && (
        <div>
          <Label>Pilih Anak</Label>
          <Select value={effectiveSiswa} onValueChange={setSelectedSiswa}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Pilih anak" />
            </SelectTrigger>
            <SelectContent>
              {anakList.map((a: any) => (
                <SelectItem key={a.siswa_id} value={a.siswa_id}>
                  {a.siswa?.nama}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {siswaInfo && (
        <Card>
          <CardContent className="p-4">
            <p className="font-semibold">{siswaInfo.nama}</p>
            <p className="text-sm text-muted-foreground">
              NIS: {siswaInfo.nis || "-"} • {activeKelas?.kelas?.departemen?.nama || "-"} — {activeKelas?.kelas?.nama || "-"}
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Belum ada data nilai
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([period, items]: [string, any]) => {
          const avg = items.reduce((s: number, n: any) => s + (n.nilai || 0), 0) / items.length;
          return (
            <Card key={period}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4" />
                    {period}
                  </span>
                  <Badge variant="secondary">
                    Rata-rata: {avg.toFixed(1)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mata Pelajaran</TableHead>
                      <TableHead>Jenis Ujian</TableHead>
                      <TableHead className="text-center">Nilai</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((n: any) => (
                      <TableRow key={n.id}>
                        <TableCell className="font-medium">{n.mapel?.nama || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {n.jenis_ujian || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${(n.nilai || 0) >= 70 ? "text-emerald-600" : "text-destructive"}`}>
                            {n.nilai ?? "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {n.keterangan || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
