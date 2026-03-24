import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Switch } from "@/components/ui/switch";
import { NISPreview } from "@/components/shared/NISPreview";
import { useAngkatan, useDepartemen, useKelas } from "@/hooks/useAkademikData";
import { generateNISViaEdgeFunction } from "@/utils/nisGenerator";
import { UserPlus, Users, UserCheck, Clock, AlertTriangle, RefreshCw, Pencil, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function diagnosaNIS(row: Record<string, unknown>): { alasan?: "no_dept_angkatan" | "no_kelas" } {
  const departemenId = row.departemen_id as string | null;
  const angkatanId = row.angkatan_id as string | null;
  if (!departemenId || !angkatanId) return { alasan: "no_dept_angkatan" };
  return {};
}

export default function PSB() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: angkatanList = [] } = useAngkatan();
  const { data: departemenList = [] } = useDepartemen();
  const { data: kelasList = [] } = useKelas();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nisLoadingId, setNisLoadingId] = useState<string | null>(null);


  const [modePendaftaran, setModePendaftaran] = useState<"lengkap" | "cepat">("lengkap");

  const [formData, setFormData] = useState({
    nama: "", jenis_kelamin: "L", telepon: "", alamat: "",
    angkatan_id: "", departemen_id: "", kelas_id: "",
  });

  const resetForm = () =>
    setFormData({ nama: "", jenis_kelamin: "L", telepon: "", alamat: "", angkatan_id: "", departemen_id: "", kelas_id: "" });

  const filteredKelas = kelasList.filter(
    (k: any) => !formData.departemen_id || k.departemen_id === formData.departemen_id
  );
  const filteredAngkatan = angkatanList.filter(
    (a: any) => !formData.departemen_id || a.departemen_id === formData.departemen_id
  );

  const selectedDept = departemenList.find((d: any) => d.id === formData.departemen_id);
  const selectedKelas = kelasList.find((k: any) => k.id === formData.kelas_id);
  const selectedAngkatan = angkatanList.find((a: any) => a.id === formData.angkatan_id);

  const canPreviewNIS =
    modePendaftaran === "lengkap" &&
    selectedDept?.npsn &&
    selectedKelas &&
    selectedAngkatan;

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
  const nisKosongCount = calonList.filter((s: any) => s.status === "diterima" && !s.nis).length;

  // ─── daftar ────────────────────────────────────────────────────────────────
  const handleDaftar = async () => {
    if (!formData.nama) { toast.error("Nama wajib diisi"); return; }
    if (!formData.departemen_id) { toast.error("Lembaga wajib dipilih"); return; }
    if (modePendaftaran === "lengkap") {
      if (!formData.angkatan_id) { toast.error("Angkatan wajib diisi (mode lengkap)"); return; }
      if (!formData.kelas_id) { toast.error("Kelas wajib diisi (mode lengkap)"); return; }
    }

    const { data: siswa, error: insertErr } = await supabase
      .from("siswa")
      .insert({
        nama: formData.nama,
        jenis_kelamin: formData.jenis_kelamin,
        telepon: formData.telepon || null,
        alamat: formData.alamat || null,
        angkatan_id: formData.angkatan_id || null,
        departemen_id: formData.departemen_id,
        agama: "Islam",
        status: "calon",
      } as any)
      .select("id")
      .single();

    if (insertErr || !siswa) { toast.error(insertErr?.message || "Gagal mendaftarkan"); return; }

    if (formData.kelas_id) {
      await supabase.from("kelas_siswa").insert({
        siswa_id: siswa.id,
        kelas_id: formData.kelas_id,
        aktif: true,
      } as any);
    }

    qc.invalidateQueries({ queryKey: ["siswa"] });
    toast.success("Calon siswa berhasil didaftarkan", {
      description: modePendaftaran === "cepat"
        ? "Lengkapi kelas & angkatan sebelum menerima agar NIS bisa dibuat."
        : undefined,
    });
    setDialogOpen(false);
    resetForm();
  };

  // ─── generate NIS (reusable) ───────────────────────────────────────────────
  const generateNIS = async (
    siswaId: string,
    departemenId: string,
    angkatanId: string,
    namaSiswa: string,
  ): Promise<boolean> => {
    const { data: kelasSiswa } = await supabase
      .from("kelas_siswa")
      .select("kelas_id")
      .eq("siswa_id", siswaId)
      .eq("aktif", true)
      .maybeSingle();

    if (!kelasSiswa?.kelas_id) {
      toast.warning(`NIS belum dibuat untuk ${namaSiswa}`, {
        description: "Siswa belum dimasukkan ke kelas. Assign kelas melalui halaman Data Siswa, lalu klik Buat NIS.",
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
      const pesan: string = e.message || "Terjadi kesalahan teknis";
      toast.error(`NIS gagal dibuat untuk ${namaSiswa}`, {
        description: pesan.toLowerCase().includes("npsn")
          ? "NPSN belum diisi pada data lembaga. Hubungi admin."
          : pesan,
        duration: 10000,
      });
      return false;
    }
  };

  // ─── terima ────────────────────────────────────────────────────────────────
  const handleTerima = async (row: Record<string, unknown>) => {
    const id = row.id as string;
    const departemenId = row.departemen_id as string | null;
    const angkatanId = row.angkatan_id as string | null;
    const namaSiswa = row.nama as string;

    setNisLoadingId(id);
    try {
      await supabase.from("siswa").update({ status: "diterima" } as any).eq("id", id);

      if (!departemenId || !angkatanId) {
        qc.invalidateQueries({ queryKey: ["siswa"] });
        toast.warning(`${namaSiswa} diterima`, {
          description: "NIS belum dibuat — lembaga atau angkatan belum diisi. Lengkapi data siswa, lalu klik Buat NIS.",
          duration: 8000,
        });
        return;
      }

      await generateNIS(id, departemenId, angkatanId, namaSiswa);
      qc.invalidateQueries({ queryKey: ["siswa"] });
    } catch {
      toast.error("Gagal menerima siswa");
    } finally {
      setNisLoadingId(null);
    }
  };

  // ─── buat NIS manual ───────────────────────────────────────────────────────
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


  // ─── verifikasi ────────────────────────────────────────────────────────────
  const handleVerifikasi = async (row: Record<string, unknown>) => {
    const id = row.id as string;
    const { error } = await supabase
      .from("siswa")
      .update({ terverifikasi: true } as any)
      .eq("id", id);
    if (error) {
      toast.error("Gagal memverifikasi: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["siswa"] });
    toast.success(`${row.nama} berhasil diverifikasi`);
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
              className="inline-flex items-center gap-1 text-xs text-warning cursor-help"
              title={alasan === "no_dept_angkatan" ? "Lembaga/angkatan belum diisi" : "Kelas belum diatur"}
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
      render: (v, row) => {
        const s = v as string;
        const colors: Record<string, string> = {
          calon: "bg-warning/15 text-warning border-warning/30",
          diterima: "bg-info/15 text-info border-info/30",
        };
        const verified = row.terverifikasi as boolean;
        return (
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[s] || ""}`}>{s}</span>
            {verified && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border bg-success/15 text-success border-success/30" title="Sudah diverifikasi">
                <CheckCircle2 className="h-3 w-3" />
                Verified
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "id", label: "Aksi", className: "w-60",
      render: (_, row) => {
        const status = row.status as string;
        const loading = nisLoadingId === (row.id as string);
        const verified = row.terverifikasi as boolean;
        return (
          <div className="flex gap-1 flex-wrap">
            {/* Edit */}
            {/* Edit — navigasi ke halaman edit siswa */}
            <Button size="sm" variant="outline"
              onClick={(e) => { e.stopPropagation(); navigate(`/akademik/siswa/${row.id}/edit`); }}
              title="Edit data"
            >
              <Pencil className="h-3 w-3" />
            </Button>

            {/* Verifikasi */}
            {!verified && (
              <Button size="sm" variant="outline"
                className="border-success/50 text-success hover:bg-success/10"
                onClick={(e) => { e.stopPropagation(); handleVerifikasi(row); }}
                title="Verifikasi data"
              >
                <ShieldCheck className="h-3 w-3 mr-1" />Verifikasi
              </Button>
            )}

            {status === "calon" && (
              <Button size="sm" variant="outline" disabled={loading}
                onClick={(e) => { e.stopPropagation(); handleTerima(row); }}
              >
                {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Terima"}
              </Button>
            )}
            {status === "diterima" && !row.nis && (
              <Button size="sm" variant="outline"
                className="border-warning/50 text-warning hover:bg-warning/10"
                disabled={loading}
                onClick={(e) => { e.stopPropagation(); handleBuatNIS(row); }}
              >
                {loading
                  ? <RefreshCw className="h-3 w-3 animate-spin" />
                  : <><RefreshCw className="h-3 w-3 mr-1" />Buat NIS</>
                }
              </Button>
            )}
            {status === "diterima" && (
              <Button size="sm" disabled={loading}
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

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Penerimaan Siswa Baru (PSB)</h1>
          <p className="text-sm text-muted-foreground">Kelola pendaftaran dan penerimaan siswa baru</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" />Daftarkan Calon Siswa</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Formulir Pendaftaran</DialogTitle></DialogHeader>

            {/* ── Toggle mode ── */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div className="space-y-0.5">
                <p className="text-sm font-medium leading-none">
                  {modePendaftaran === "lengkap" ? "Mode lengkap" : "Mode cepat"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {modePendaftaran === "lengkap"
                    ? "Kelas & angkatan wajib — NIS langsung dibuat saat diterima"
                    : "Kelas & angkatan opsional — NIS dibuat belakangan"}
                </p>
              </div>
              <Switch
                checked={modePendaftaran === "lengkap"}
                onCheckedChange={(v) => {
                  setModePendaftaran(v ? "lengkap" : "cepat");
                  setFormData((f) => ({ ...f, kelas_id: "", angkatan_id: "" }));
                }}
              />
            </div>

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
                <Select value={formData.departemen_id} onValueChange={(v) => setFormData({ ...formData, departemen_id: v, kelas_id: "", angkatan_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Pilih lembaga" /></SelectTrigger>
                  <SelectContent>
                    {departemenList.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedDept && !selectedDept.npsn && (
                  <p className="text-xs text-warning flex items-center gap-1.5 mt-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Lembaga ini belum memiliki NPSN — NIS tidak bisa dibuat otomatis.
                  </p>
                )}
              </div>
              <div>
                <Label className="flex items-center gap-1.5">
                  Kelas
                  {modePendaftaran === "lengkap"
                    ? <span className="text-destructive">*</span>
                    : <span className="text-xs font-normal text-muted-foreground">(opsional)</span>}
                </Label>
                <Select value={formData.kelas_id} onValueChange={(v) => setFormData({ ...formData, kelas_id: v })} disabled={!formData.departemen_id}>
                  <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                  <SelectContent>
                    {filteredKelas.map((k: any) => (
                      <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="flex items-center gap-1.5">
                  Angkatan
                  {modePendaftaran === "lengkap"
                    ? <span className="text-destructive">*</span>
                    : <span className="text-xs font-normal text-muted-foreground">(opsional)</span>}
                </Label>
                <Select value={formData.angkatan_id} onValueChange={(v) => setFormData({ ...formData, angkatan_id: v })} disabled={!formData.departemen_id}>
                  <SelectTrigger><SelectValue placeholder="Pilih angkatan" /></SelectTrigger>
                  <SelectContent>
                    {filteredAngkatan.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.nama}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {canPreviewNIS && (
                <NISPreview
                  npsn={selectedDept!.npsn}
                  namaKelas={selectedKelas!.nama}
                  namaAngkatan={selectedAngkatan!.nama}
                  estimasiUrut={1}
                />
              )}

              {modePendaftaran === "cepat" && (
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 leading-relaxed">
                  NIS akan dibuat setelah kelas dan angkatan dilengkapi di halaman Data Siswa,
                  kemudian klik tombol <strong>Buat NIS</strong> di tabel PSB.
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

      {/* Stats */}
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
