import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { useLembaga, useJenisPembayaran, formatRupiah, namaBulan } from "@/hooks/useKeuangan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";

export default function LaporanBayarKelas() {
  const [departemenId, setDepartemenId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [jenisId, setJenisId] = useState("");

  const { data: lembagaList } = useLembaga();
  const { data: jenisList } = useJenisPembayaran(departemenId || undefined);

  const { data: kelasList } = useQuery({
    queryKey: ["kelas_by_dept", departemenId],
    enabled: !!departemenId,
    queryFn: async () => {
      const { data } = await supabase.from("kelas").select("id, nama").eq("departemen_id", departemenId).eq("aktif", true).order("nama");
      return data || [];
    },
  });

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["laporan_bayar_kelas", kelasId, jenisId],
    enabled: !!kelasId && !!jenisId,
    queryFn: async () => {
      // Get students in class
      const { data: kelasSiswa } = await supabase
        .from("kelas_siswa")
        .select("siswa:siswa_id(id, nama, nis)")
        .eq("kelas_id", kelasId)
        .eq("aktif", true);

      if (!kelasSiswa?.length) return [];

      const siswaIds = kelasSiswa.map((ks: any) => ks.siswa?.id).filter(Boolean);

      // Get payments for these students and this jenis
      const { data: payments } = await supabase
        .from("pembayaran")
        .select("siswa_id, bulan, jumlah")
        .eq("jenis_id", jenisId)
        .in("siswa_id", siswaIds);

      // Build report
      return kelasSiswa.map((ks: any) => {
        const siswa = ks.siswa;
        const siswaPayments = (payments || []).filter((p: any) => p.siswa_id === siswa.id);
        const bulanBayar: Record<number, number> = {};
        siswaPayments.forEach((p: any) => { bulanBayar[p.bulan] = (bulanBayar[p.bulan] || 0) + Number(p.jumlah || 0); });
        const totalBayar = Object.values(bulanBayar).reduce((s, v) => s + v, 0);
        const bulanLunas = Object.keys(bulanBayar).length;

        return {
          id: siswa.id,
          nama: siswa.nama,
          nis: siswa.nis || "-",
          ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`b${i + 1}`, bulanBayar[i + 1] || 0])),
          totalBayar,
          bulanLunas,
        };
      }).sort((a: any, b: any) => a.nama.localeCompare(b.nama));
    },
  });

  const columns: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama Siswa" },
    { key: "nis", label: "NIS" },
    ...Array.from({ length: 12 }, (_, i) => ({
      key: `b${i + 1}`,
      label: namaBulan(i + 1).slice(0, 3),
      render: (v: any) => v > 0
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
        : <XCircle className="h-4 w-4 text-destructive/40 mx-auto" />,
    })),
    { key: "bulanLunas", label: "Lunas" },
    { key: "totalBayar", label: "Total", render: (v: any) => formatRupiah(Number(v)) },
  ];

  const kelasNama = kelasList?.find((k: any) => k.id === kelasId)?.nama || "";
  const jenisNama = jenisList?.find((j: any) => j.id === jenisId)?.nama || "";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Laporan Pembayaran Per Kelas</h1>
        <p className="text-sm text-muted-foreground">Status pembayaran seluruh siswa dalam satu kelas</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <Label>Lembaga</Label>
              <Select value={departemenId} onValueChange={(v) => { setDepartemenId(v); setKelasId(""); setJenisId(""); }}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Pilih lembaga" /></SelectTrigger>
                <SelectContent>
                  {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kelas</Label>
              <Select value={kelasId} onValueChange={setKelasId} disabled={!departemenId}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                <SelectContent>
                  {kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Jenis Pembayaran</Label>
              <Select value={jenisId} onValueChange={setJenisId} disabled={!departemenId}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                <SelectContent>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {kelasId && jenisId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {kelasNama} — {jenisNama}
              {reportData && <span className="text-sm font-normal text-muted-foreground ml-2">({reportData.length} siswa)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-40" /> : (
              <DataTable
                columns={columns}
                data={reportData || []}
                exportable
                exportFilename={`laporan-kelas-${kelasNama}-${jenisNama}`}
                pageSize={50}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
