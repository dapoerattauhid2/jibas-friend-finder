import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  H: { label: "Hadir", icon: CheckCircle, color: "text-emerald-600" },
  I: { label: "Izin", icon: Clock, color: "text-blue-600" },
  S: { label: "Sakit", icon: AlertTriangle, color: "text-amber-600" },
  A: { label: "Alpha", icon: XCircle, color: "text-destructive" },
};

export default function PortalPresensi() {
  const { user } = useAuth();
  const [selectedSiswa, setSelectedSiswa] = useState("");

  const { data: anakList = [] } = useQuery({
    queryKey: ["portal-anak-presensi", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select("siswa_id, siswa:siswa_id (id, nama, nis)")
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  // Auto-select first child
  const effectiveSiswa = selectedSiswa || anakList[0]?.siswa_id || "";

  const { data: presensi = [], isLoading } = useQuery({
    queryKey: ["portal-presensi", effectiveSiswa],
    queryFn: async () => {
      const { data } = await supabase
        .from("presensi_siswa")
        .select("*, kelas:kelas_id(nama)")
        .eq("siswa_id", effectiveSiswa)
        .order("tanggal", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: !!effectiveSiswa,
  });

  // Summary stats
  const summary = useMemo(() => {
    const counts = { H: 0, I: 0, S: 0, A: 0 };
    presensi.forEach((p: any) => {
      if (p.status && counts[p.status as keyof typeof counts] !== undefined) {
        counts[p.status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [presensi]);

  const selectedAnak = anakList.find((a: any) => a.siswa_id === effectiveSiswa);
  const siswaInfo = selectedAnak?.siswa;
  const activeKelas = siswaInfo?.kelas_siswa?.find((ks: any) => ks.aktif);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Presensi Anak</h1>
        <p className="text-sm text-muted-foreground">Lihat rekap kehadiran anak di sekolah</p>
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

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card key={key}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <div>
                  <p className="text-xl font-bold">{summary[key as keyof typeof summary]}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5" /> Riwayat Presensi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : presensi.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Belum ada data presensi</p>
          ) : (
            <div className="divide-y">
              {presensi.map((p: any) => {
                const cfg = statusConfig[p.status] || statusConfig.H;
                const Icon = cfg.icon;
                return (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                      <div>
                        <p className="text-sm font-medium">
                          {p.tanggal && format(new Date(p.tanggal), "EEEE, dd MMMM yyyy", { locale: idLocale })}
                        </p>
                        {p.keterangan && (
                          <p className="text-xs text-muted-foreground">{p.keterangan}</p>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        p.status === "H" ? "bg-emerald-100 text-emerald-700" :
                        p.status === "A" ? "bg-red-100 text-red-700" :
                        p.status === "S" ? "bg-amber-100 text-amber-700" :
                        "bg-blue-100 text-blue-700"
                      }
                    >
                      {cfg.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
