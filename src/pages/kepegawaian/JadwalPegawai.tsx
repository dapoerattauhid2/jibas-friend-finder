import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useLembaga } from "@/hooks/useKeuangan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, MapPin, User } from "lucide-react";

const HARI_ORDER = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_COLORS: Record<string, string> = {
  Senin: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
  Selasa: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
  Rabu: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  Kamis: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
  Jumat: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800",
  Sabtu: "bg-cyan-50 border-cyan-200 dark:bg-cyan-950/30 dark:border-cyan-800",
};

type JadwalRow = {
  id: string;
  hari: string | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  pegawai: { id: string; nama: string; jabatan: string | null } | null;
  kelas: { id: string; nama: string } | null;
  mapel: { id: string; nama: string } | null;
};

export default function JadwalPegawai() {
  const { role } = useAuth();
  const [filterLembaga, setFilterLembaga] = useState("all");
  const [filterPegawai, setFilterPegawai] = useState("all");

  const { data: lembagaList } = useLembaga();

  // Fetch pegawai for filter
  const { data: pegawaiList } = useQuery({
    queryKey: ["pegawai_for_jadwal", filterLembaga],
    queryFn: async () => {
      let q = supabase.from("pegawai").select("id, nama").eq("status", "aktif").order("nama");
      if (filterLembaga !== "all") q = q.eq("departemen_id", filterLembaga);
      const { data } = await q;
      return data || [];
    },
  });

  // Fetch jadwal
  const { data: jadwalList, isLoading } = useQuery({
    queryKey: ["jadwal_pegawai", filterLembaga, filterPegawai],
    queryFn: async () => {
      let q = supabase
        .from("jadwal")
        .select("id, hari, jam_mulai, jam_selesai, ruangan, pegawai:pegawai_id(id, nama, jabatan), kelas:kelas_id(id, nama), mapel:mapel_id(id, nama)")
        .order("jam_mulai");

      if (filterPegawai !== "all") {
        q = q.eq("pegawai_id", filterPegawai);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as JadwalRow[];
    },
  });

  // Group by pegawai
  const groupedByPegawai = (jadwalList || []).reduce<Record<string, { nama: string; jadwal: JadwalRow[] }>>((acc, j) => {
    const pegId = (j.pegawai as any)?.id || "unknown";
    const pegNama = (j.pegawai as any)?.nama || "Tidak Diketahui";
    if (!acc[pegId]) acc[pegId] = { nama: pegNama, jadwal: [] };
    acc[pegId].jadwal.push(j);
    return acc;
  }, {});

  // Sort jadwal per pegawai by hari then jam
  Object.values(groupedByPegawai).forEach(g => {
    g.jadwal.sort((a, b) => {
      const hA = HARI_ORDER.indexOf(a.hari || "");
      const hB = HARI_ORDER.indexOf(b.hari || "");
      if (hA !== hB) return hA - hB;
      return (a.jam_mulai || "").localeCompare(b.jam_mulai || "");
    });
  });

  const sortedPegawai = Object.entries(groupedByPegawai).sort((a, b) => a[1].nama.localeCompare(b[1].nama));

  // Stats
  const totalGuru = new Set((jadwalList || []).map(j => (j.pegawai as any)?.id).filter(Boolean)).size;
  const totalJam = (jadwalList || []).length;
  const hariAktif = new Set((jadwalList || []).map(j => j.hari).filter(Boolean)).size;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Jadwal Pegawai</h1>
        <p className="text-sm text-muted-foreground">Jadwal mengajar guru per hari</p>
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <Label>Lembaga</Label>
          <Select value={filterLembaga} onValueChange={(v) => { setFilterLembaga(v); setFilterPegawai("all"); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Lembaga</SelectItem>
              {lembagaList?.map((l: any) => (
                <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Guru</Label>
          <Select value={filterPegawai} onValueChange={setFilterPegawai}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Guru</SelectItem>
              {pegawaiList?.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><User className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold">{totalGuru}</p><p className="text-xs text-muted-foreground">Guru Mengajar</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><Clock className="h-5 w-5 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold">{totalJam}</p><p className="text-xs text-muted-foreground">Total Sesi</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><Calendar className="h-5 w-5 text-amber-600" /></div>
            <div><p className="text-2xl font-bold">{hariAktif}</p><p className="text-xs text-muted-foreground">Hari Aktif</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Cards */}
      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-48" />)}</div>
      ) : sortedPegawai.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Tidak ada data jadwal</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {sortedPegawai.map(([pegId, { nama, jadwal }]) => {
            // Group by hari
            const byHari = jadwal.reduce<Record<string, JadwalRow[]>>((acc, j) => {
              const h = j.hari || "Lainnya";
              if (!acc[h]) acc[h] = [];
              acc[h].push(j);
              return acc;
            }, {});

            return (
              <Card key={pegId}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {nama}
                    <Badge variant="outline" className="ml-auto">{jadwal.length} sesi/minggu</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {HARI_ORDER.filter(h => byHari[h]).map(hari => (
                      <div key={hari} className={`rounded-lg border p-3 space-y-2 ${HARI_COLORS[hari] || ""}`}>
                        <p className="font-semibold text-sm">{hari}</p>
                        {byHari[hari].map(j => (
                          <div key={j.id} className="bg-background/80 rounded-md p-2 text-sm space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{j.jam_mulai?.slice(0,5) || "?"} - {j.jam_selesai?.slice(0,5) || "?"}</span>
                            </div>
                            <p className="font-medium">{(j.mapel as any)?.nama || "-"}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>Kelas: {(j.kelas as any)?.nama || "-"}</span>
                              {j.ruangan && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{j.ruangan}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
