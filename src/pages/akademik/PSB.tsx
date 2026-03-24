import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NISPreview } from "@/components/shared/NISPreview";
import { useAngkatan, useDepartemen, useKelas } from "@/hooks/useAkademikData";
import { generateNISViaEdgeFunction } from "@/utils/nisGenerator";
import { UserPlus, Users, UserCheck, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// ─── helper: cek kelengkapan data siswa ───────────────────────────────────────
function diagnosaNIS(row: Record<string, unknown>): {
  bisa: boolean;
  alasan?: "no_dept_angkatan" | "no_kelas";
} {
  const departemenId = row.departemen_id as string | null;
  const angkatanId = row.angkatan_id as string | null;
  if (!departemenId || !angkatanId) return { bisa: false, alasan: "no_dept_angkatan" };
  return { bisa: true };
}

export default function PSB() {
  const qc = useQueryClient();
  const { data: angkatanList = [] } = useAngkatan();
  const { data: departemenList = [] } = useDepartemen();
  const { data: kelasList = [] } = useKelas();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nisLoadingId, setNisLoadingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nama: "", jenis_kelamin: "L", telepon: "", alamat: "",
    angkatan_id: "", departemen_id: "", kelas_id: "",
  });

  const filteredKelas = kelasList.filter(
    (k: any) => !formData.departemen_id || k.departemen_id === formData.departemen_id
  );
  const filteredAngkatan = angkatanList.filter(
    (a: any) => !formData.departemen_id || a.departemen_id === formData.departemen_id
  );

  const selectedDept = departemenList.find((d: any) => d.id === formData.departemen_id);
  const selectedKelas = kelasList.find((k: any) => k.id === formData.kelas_id);
  const selectedAngkatan = angkatanList.find((a: any) => a.id === formData.angkatan_id);

  const { data: calonList = [], isLoading } = useQuery({
    queryKey: ["siswa", "calon"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("siswa")
        .select("*, angkatan:angkatan_id(nama), departemen:departemen_id(nama)")
        .in("status", ["calon", "diterima"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const calonCount = calonList.filter((s: any) => s.status === "calon").length;
  const diterimaCount = calonList.filter((s: any) => s.status === "diterima").length;
  // siswa "diterima" tapi NIS masih kosong
  const nisKosongCount = calonList.filter(
    (s: any) => s.status === "diterima" && !s.nis
  ).length;

  // ─── daftarkan calon siswa ─────────────────────────────────────────────────
  const handleDaftar = async () => {
    if (!formData.nama) { toast.error("Nama wajib diisi"); return; }
    if (!formData.departemen_id) { toast.error("Lembaga wajib dipilih"); return; }
    if (!formData.angkatan_id) { toast.error("Angkatan wajib dipilih agar NIS bisa dibuat"); return; }
    if (!formData.kelas_id) { toast.error("Kelas wajib dipilih agar NIS bisa dibuat"); return; }

    const { data: siswa, error: insertErr } = await supabase
      .from("siswa")
      .insert({
        nama: formData.nama,
        jenis_kelamin: formData.jenis_kelamin,
        telepon: formData.telepon || null,
        alamat: formData.alamat || null,
        angkatan_id: formData.angkatan_id,
        departemen_id: formData.departemen_id,
        agama: "Islam",
        status: "calon",
      } as any)
      .select("id")
      .single();

    if (insertErr || !siswa) { toast.error(insertErr?.message || "Gagal mendaftarkan"); return; }

    await supabase.from("kelas_siswa").insert({
      siswa_id: siswa.id,
      kelas_id: formData.kelas_id,
      aktif: true,
    } as any);

    qc.invalidateQueries({ queryKey: ["siswa"] });
    toast.success("Calon siswa berhasil didaftarkan");
    setDialogOpen(false);
    setFormData({ nama: "", jenis_kelamin: "L", telepon: "", alamat: "", angkatan_id: "", departemen_id: "", kelas_id: "" });
  };

  // ─── generate NIS (bisa dipanggil dari tombol Terima maupun Buat NIS) ──────
  const generateNIS = async (
    siswaId: string,
    departemenId: string,
    angkatanId: string,
    namaSiswa: string,
  ): Promise<boolean> => {
    // cari kelas aktif siswa
    const { data: kelasSiswa } = await supabase
      .from("kelas_siswa")
      .select("kelas_id")
      .eq("siswa_id", siswaId)
      .eq("aktif", true)
      .maybeSingle();

    if (!kelasSiswa?.kelas_id) {
      toast.warning(`NIS belum dibuat untuk ${namaSiswa}`, {
        description: "Siswa belum dimasukkan ke kelas. Assign kelas terlebih dahulu melalui halaman Data Siswa.",
        duration: 8000,
      });
      return false;
    }

    try {
      const { nis } = await generateNISViaEdgeFunction(supabase, {
        siswa_id: siswaId,
        departemen_id: departemenId,
        angkatan_id: angkatanId,
        kelas_id: kelasSiswa.kelas_id,
      });
      toast.success(`NIS berhasil dibuat: ${nis}`, { description: namaSiswa });
      return true;
    } catch (e: any) {
      // Cek apakah error karena NPSN belum diisi
      const pesanError: string = e.message || "Terjadi kesalahan teknis";
      const isNpsnError = pesanError.toLowerCase().includes("npsn");

      toast.error(`NIS gagal dibuat untuk ${namaSiswa}`, {
        description: isNpsnError
          ? "NPSN belum diisi pada data lembaga. Hubungi admin untuk melengkapinya."
          : pesanError,
        duration: 10000,
      });
      return false;
    }
  };

  // ─── terima siswa ──────────────────────────────────────────────────────────
  const handleTerima = async (row: Record<string, unknown>) => {
    const id = row.id as string;
    const departemenId = row.departemen_id as string | null;
    const angkatanId = row.angkatan_id as string | null;
    const namaSiswa = row.nama as string;

    setNisLoadingId(id);
    try {
      // Kondisi 1: departemen/angkatan belum diisi
      if (!departemenId || !angkatanId) {
        await supabase.from("siswa").update({ status: "diterima" } as any).eq("id", id);
        qc.invalidateQueries({ queryKey: ["siswa"] });
        toast.warning(`${namaSiswa} diterima`, {
          description: "NIS belum dibuat — lembaga atau angkatan belum diisi. Edit data siswa untuk melengkapinya.",
          duration: 8000,
        });
        return;
      }

      // Update status dulu
      await supabase.from("siswa").update({ status: "diterima" } as any).eq("id", id);

      // Kondisi 2 & 3 ditangani di dalam generateNIS
      const berhasil = await generateNIS(id, departemenId, angkatanId, namaSiswa);
      if (!berhasil) {
        // status sudah "diterima", tapi NIS belum — invalidate tetap perlu
        qc.invalidateQueries({ queryKey: ["siswa"] });
      } else {
        qc.invalidateQueries({ queryKey: ["siswa"] });
      }
    } catch {
      toast.error("Gagal menerima siswa");
    } finally {
      setNisLoadingId(null);
    }
  };

  // ─── buat NIS manual (untuk siswa "diterima" yang NIS-nya masih kosong) ───
  const handleBuatNIS = async (row: Record<string, unknown>) => {
    const id = row.id as string;
    const departemenId = row.departemen_id as string | null;
    const angkatanId = row.angkatan_id as string | null;
    const namaSiswa = row.nama as string;

    if (!departemenId || !angkatanId) {
      toast.error("Tidak bisa membuat NIS", {
        description: "Lembaga dan angkatan siswa belum diisi. Edit data siswa terlebih dahulu.",
      });
      return;
    }

    setNisLoadingId(id);
    try {
      const berhasil = await generateNIS(id, departemenId, angkatanId, namaSiswa);
      if (berhasil) qc.invalidateQueries({ queryKey: ["siswa"] });
    } finally {
      setNisLoadingId(null);
    }
  };

  const handleAktifkan = async (id: string) => {
    await supabase.from("siswa").update({ status: "aktif" } as any).eq("id", id);
    qc.invalidateQueries({ queryKey: ["siswa"] });
    toast.success("Siswa diaktifkan");
  };

  // ─── columns ───────────────────────────────────────────────────────────────
  const columns: DataTableColumn<Record<string, unknown>>[] = [
    { key: "nama", label: "Nama", sortable: true },
    {
      key: "nis", label: "NIS",
      render: (v, row) => {
        if (v) return <span className="font-mono text-xs">{v as string}</span>;
        if (row.status === "diterima") {
          const { alasan } = diagnosaNIS(row);
          return (
            <span
              className="inline-flex items-center gap-1 text-xs text-warning"
              title={
                alasan === "no_dept_angkatan"
                  ? "Lembaga/angkatan belum diisi"
                  : "Kelas belum diatur"
              }
            >
              <AlertTriangle className="h-3 w-3" />
              Belum ada
            </span>
          );
        }
        return <span className="text-muted-foreground text-xs">-</span>;
      },
    },
    { key: "jenis_kelamin", label: "JK", render: (v) => v === "L" ? "L" : "P" },
    { key: "telepon", label: "Telepon" },
    { key: "departemen", label: "Lembaga", render: (v: any) => v?.nama || "-" },
    { key: "angkatan", label: "Angkatan", render: (v: any) => v?.nama || "-" },
    {
      key: "status", label: "Status",
      render: (v) => {
        const s = v as string;
        const colors: Record<string, string> = {
          calon: "bg-warning/15 text-warning border-warning/30",
          diterima: "bg-info/15 text-info border-info/30",
        };
        return <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[s] || ""}`}>{s}</span>;
      },
    },
    {
      key: "id", label: "Aksi", className: "w-48",
      render: (_, row) => {
        const status = row.status as string;
        const isLoading = nisLoadingId === (row.id as string);
        return (
          <div className="flex gap-1 flex-wrap">
            {status === "calon" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading}
                onClick={(e) => { e.stopPropagation(); handleTerima(row); }}
              >
                {isLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Terima"}
              </Button>
            )}

            {status === "diterima" && !row.nis && (
              <Button
                size="sm"
                variant="outline"
                className="border-warning/50 text-warning hover:bg-warning/10"
                disabled={isLoading}
                onClick={(e) => { e.stopPropagation(); handleBuatNIS(row); }}
              >
                {isLoading
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <><RefreshCw className="h-3 w-3 mr-1" />Buat NIS</>
                }
              </Button>
            )}

            {status === "diterima" && (
              <Button
                size="sm"
                disabled={isLoading}
                onClick={(e) => { e.stopPropagation(); handleAktifkan(row.id as string); }}
              >
                Aktifkan
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Penerimaan Siswa Baru (PSB)</h1>
          <p className="text-sm text-muted-foreground">Kelola pendaftaran dan penerimaan siswa baru</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" />Daftarkan Calon Siswa</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Formulir Pendaftaran</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nama Lengkap *</Label>
                <Input value={formData.nama} onChange={(e) => setFormData({ ...formData, nama: e.target.value })} />
              </div>
              <div>
                <Label>Jenis Kelamin</Label>
                <Select value={formData.jenis_kelamin} onValueChange={(v) => setFormData({ ...formData, jenis_kelamin: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L">Laki-laki</SelectItem>
                    <SelectItem value="P">Perempuan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lembaga/Sekolah *</Label>
                <Select
                  value={formData.departemen_id}
                  onValueChange={(v) => setFormData({ ...formData, departemen_id: v, kelas_id: "", angkatan_id: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih lembaga" /></SelectTrigger>
                  <SelectContent>
                    {departemenList.map((d) => <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kelas *</Label>
                <Select
                  value={formData.kelas_id}
                  onValueChange={(v) => setFormData({ ...formData, kelas_id: v })}
                  disabled={!formData.departemen_id}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                  <SelectContent>
                    {filteredKelas.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Angkatan *</Label>
                <Select
                  value={formData.angkatan_id}
                  onValueChange={(v) => setFormData({ ...formData, angkatan_id: v })}
                  disabled={!formData.departemen_id}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih angkatan" /></SelectTrigger>
                  <SelectContent>
                    {filteredAngkatan.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* NIS Preview — tampil hanya jika semua data sudah dipilih */}
              {selectedDept?.npsn && selectedKelas && selectedAngkatan && (
                <NISPreview
                  npsn={selectedDept.npsn}
                  namaKelas={selectedKelas.nama}
                  namaAngkatan={selectedAngkatan.nama}
                  estimasiUrut={1}
                />
              )}

              {/* Info jika NPSN belum diisi di lembaga yang dipilih */}
              {selectedDept && !selectedDept.npsn && (
                <p className="text-xs text-warning flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Lembaga ini belum memiliki NPSN. NIS tidak bisa di-generate otomatis.
                  Hubungi admin untuk melengkapi data lembaga.
                </p>
              )}

              <div>
                <Label>Telepon</Label>
                <Input value={formData.telepon} onChange={(e) => setFormData({ ...formData, telepon: e.target.value })} />
              </div>
              <div>
                <Label>Alamat</Label>
                <Textarea value={formData.alamat} onChange={(e) => setFormData({ ...formData, alamat: e.target.value })} />
              </div>
              <Button className="w-full" onClick={handleDaftar}>Daftarkan</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats — tambah kartu NIS kosong jika ada */}
      <div className={`grid gap-4 ${nisKosongCount > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <StatsCard title="Total Pendaftar" value={calonList.length} icon={Users} color="primary" />
        <StatsCard title="Menunggu" value={calonCount} icon={Clock} color="warning" />
        <StatsCard title="Diterima" value={diterimaCount} icon={UserCheck} color="success" />
        {nisKosongCount > 0 && (
          <StatsCard title="NIS Belum Dibuat" value={nisKosongCount} icon={AlertTriangle} color="destructive" />
        )}
      </div>

      <DataTable
        columns={columns}
        data={calonList as Record<string, unknown>[]}
        searchPlaceholder="Cari nama calon siswa..."
        loading={isLoading}
        pageSize={20}
      />
    </div>
  );
}
