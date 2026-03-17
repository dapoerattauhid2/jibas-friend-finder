import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { FilterToolbar, ActiveFilter } from "@/components/shared/FilterToolbar";
import { useLembaga, useJenisPembayaran, useTahunAjaran, useTahunAjaranAktif, formatRupiah, namaBulan, BULAN_ORDER_AKADEMIK } from "@/hooks/useKeuangan";
import { getTarifBatch } from "@/hooks/useTarifTagihan";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Users } from "lucide-react";

export default function LaporanBayarKelas() {
  const [departemenId, setDepartemenId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [jenisId, setJenisId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");

  const { data: lembagaList } = useLembaga();
  const { data: tahunAjaranList } = useTahunAjaran();
  const { data: tahunAjaranAktif } = useTahunAjaranAktif();

  useEffect(() => {
    if (tahunAjaranAktif?.id && !tahunAjaranId) {
      setTahunAjaranId(tahunAjaranAktif.id);
    }
  }, [tahunAjaranAktif]);
  const { data: jenisList } = useJenisPembayaran(departemenId || undefined);

  const { data: kelasList } = useQuery({
    queryKey: ["kelas_by_dept", departemenId],
    enabled: !!departemenId,
    queryFn: async () => {
      const { data } = await supabase.from("kelas").select("id, nama").eq("departemen_id", departemenId).eq("aktif", true).order("nama");
      return data || [];
    },
  });

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);
  const isSekali = (selectedJenis as any)?.tipe === "sekali";

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["laporan_bayar_kelas", kelasId, jenisId, tahunAjaranId],
    enabled: !!kelasId && !!jenisId && !!tahunAjaranId,
    queryFn: async () => {
      const { data: kelasSiswa } = await supabase
        .from("kelas_siswa")
        .select("siswa:siswa_id(id, nama, nis)")
        .eq("kelas_id", kelasId)
        .eq("tahun_ajaran_id", tahunAjaranId)
        .eq("aktif", true);

      if (!kelasSiswa?.length) return [];

      const siswaIds = kelasSiswa.map((ks: any) => ks.siswa?.id).filter(Boolean);
      const tarifMap = await getTarifBatch(jenisId, siswaIds, kelasId, tahunAjaranId);

      const { data: payments } = await supabase
        .from("pembayaran")
        .select("siswa_id, bulan, jumlah")
        .eq("jenis_id", jenisId)
        .eq("tahun_ajaran_id", tahunAjaranId)
        .in("siswa_id", siswaIds);

      const jenis = jenisList?.find((j: any) => j.id === jenisId);
      const tipe = (jenis as any)?.tipe || "bulanan";

      return kelasSiswa.map((ks: any) => {
        const siswa = ks.siswa;
        const siswaPayments = (payments || []).filter((p: any) => p.siswa_id === siswa.id);
        const totalBayar = siswaPayments.reduce((s: number, p: any) => s + Number(p.jumlah || 0), 0);
        const nominal = tarifMap.get(siswa.id) || 0;
        if (nominal === 0) return null;

        if (tipe === "sekali") {
          return {
            id: siswa.id, nama: siswa.nama, nis: siswa.nis || "-", nominal, totalBayar,
            lunas: totalBayar >= nominal, sisa: Math.max(nominal - totalBayar, 0),
          };
        } else {
          const bulanBayar: Record<number, number> = {};
          siswaPayments.forEach((p: any) => { bulanBayar[p.bulan] = (bulanBayar[p.bulan] || 0) + Number(p.jumlah || 0); });
          const bulanLunas = Object.keys(bulanBayar).length;
          return {
            id: siswa.id, nama: siswa.nama, nis: siswa.nis || "-", nominal,
            ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`b${i + 1}`, bulanBayar[i + 1] || 0])),
            totalBayar, bulanLunas,
          };
        }
      }).filter(Boolean).sort((a: any, b: any) => a.nama.localeCompare(b.nama));
    },
  });

  const columnsBulanan: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama Siswa" },
    { key: "nis", label: "NIS" },
    { key: "nominal", label: "Tarif", render: (v: any) => formatRupiah(Number(v)) },
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

  const columnsSekali: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama Siswa" },
    { key: "nis", label: "NIS" },
    { key: "nominal", label: "Tarif", render: (v: any) => formatRupiah(Number(v)) },
    { key: "lunas", label: "Status", render: (v: any) => v
      ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Lunas</span>
      : <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" /> Belum</span>
    },
    { key: "totalBayar", label: "Dibayar", render: (v: any) => formatRupiah(Number(v)) },
    { key: "sisa", label: "Sisa", render: (v: any) => v > 0 ? <span className="text-destructive font-medium">{formatRupiah(Number(v))}</span> : "-" },
  ];

  const columns = isSekali ? columnsSekali : columnsBulanan;
  const kelasNamaStr = kelasList?.find((k: any) => k.id === kelasId)?.nama || "";
  const jenisNamaStr = jenisList?.find((j: any) => j.id === jenisId)?.nama || "";
  const lembagaNama = lembagaList?.find((l: any) => l.id === departemenId);
  const tahunAjaranNama = tahunAjaranList?.find((t: any) => t.id === tahunAjaranId);

  const activeFilters: ActiveFilter[] = [
    ...(tahunAjaranId ? [{
      key: "tahun", label: "Tahun Ajaran", value: tahunAjaranNama?.nama || tahunAjaranId,
      onClear: () => setTahunAjaranId(""),
    }] : []),
    ...(departemenId ? [{
      key: "lembaga", label: "Lembaga", value: lembagaNama?.kode || lembagaNama?.nama || "",
      onClear: () => { setDepartemenId(""); setKelasId(""); setJenisId(""); },
    }] : []),
    ...(kelasId ? [{
      key: "kelas", label: "Kelas", value: kelasNamaStr,
      onClear: () => setKelasId(""),
    }] : []),
    ...(jenisId ? [{
      key: "jenis", label: "Jenis", value: jenisNamaStr,
      onClear: () => setJenisId(""),
    }] : []),
  ];

  return (
    <div className="space-y-0 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Laporan Pembayaran Per Kelas</h1>
          <p className="text-xs text-muted-foreground">Status pembayaran seluruh siswa dalam satu kelas</p>
        </div>
        {kelasId && jenisId && reportData && (
          <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs font-medium">
            <Users className="h-3 w-3" />
            {reportData.length} siswa
          </Badge>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="border-b border-border pb-3 mb-4">
        <FilterToolbar activeFilters={activeFilters}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Lembaga</Label>
              <Select value={departemenId} onValueChange={(v) => { setDepartemenId(v); setKelasId(""); setJenisId(""); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih lembaga" /></SelectTrigger>
                <SelectContent>
                  {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kelas</Label>
              <Select value={kelasId} onValueChange={setKelasId} disabled={!departemenId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                <SelectContent>
                  {kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Jenis Pembayaran</Label>
              <Select value={jenisId} onValueChange={setJenisId} disabled={!departemenId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                <SelectContent>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tahun Ajaran</Label>
              <Select value={tahunAjaranId} onValueChange={setTahunAjaranId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
                <SelectContent>
                  {tahunAjaranList?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.nama}{t.aktif ? " (Aktif)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </FilterToolbar>
      </div>

      {/* Table */}
      {kelasId && jenisId ? (
        isLoading ? <Skeleton className="h-40" /> : (
          <DataTable
            columns={columns}
            data={reportData || []}
            exportable
            exportFilename={`laporan-kelas-${kelasNamaStr}-${jenisNamaStr}`}
            pageSize={50}
          />
        )
      ) : (
        <p className="text-sm text-muted-foreground text-center py-12">Gunakan tombol Filter untuk memilih lembaga, kelas, dan jenis</p>
      )}
    </div>
  );
}
