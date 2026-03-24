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
import { UserPlus, Users, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";

export default function PSB() {
  const qc = useQueryClient();
  const { data: angkatanList = [] } = useAngkatan();
  const { data: departemenList = [] } = useDepartemen();
  const { data: kelasList = [] } = useKelas();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    nama: "", jenis_kelamin: "L", telepon: "", alamat: "",
    angkatan_id: "", departemen_id: "", kelas_id: "",
  });

  // Filtered kelas by selected departemen
  const filteredKelas = kelasList.filter(
    (k: any) => !formData.departemen_id || k.departemen_id === formData.departemen_id
  );
  const filteredAngkatan = angkatanList.filter(
    (a: any) => !formData.departemen_id || a.departemen_id === formData.departemen_id
  );

  // NIS preview data
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

  const handleDaftar = async () => {
    if (!formData.nama) { toast.error("Nama wajib diisi"); return; }
    if (!formData.departemen_id) { toast.error("Lembaga wajib dipilih"); return; }

    // 1. Insert siswa (nis NULL)
    const { data: siswa, error: insertErr } = await supabase.from("siswa").insert({
      nama: formData.nama,
      jenis_kelamin: formData.jenis_kelamin,
      telepon: formData.telepon || null,
      alamat: formData.alamat || null,
      angkatan_id: formData.angkatan_id || null,
      departemen_id: formData.departemen_id || null,
      agama: "Islam",
      status: "calon",
    } as any).select("id").single();

    if (insertErr || !siswa) { toast.error(insertErr?.message || "Gagal mendaftarkan"); return; }

    // 2. Insert kelas_siswa if kelas selected
    if (formData.kelas_id) {
      await supabase.from("kelas_siswa").insert({
        siswa_id: siswa.id,
        kelas_id: formData.kelas_id,
        aktif: true,
      } as any);
    }

    qc.invalidateQueries({ queryKey: ["siswa"] });
    toast.success("Calon siswa berhasil didaftarkan");
    setDialogOpen(false);
    setFormData({ nama: "", jenis_kelamin: "L", telepon: "", alamat: "", angkatan_id: "", departemen_id: "", kelas_id: "" });
  };

  const handleTerima = async (row: Record<string, unknown>) => {
    const id = row.id as string;
    const departemenId = row.departemen_id as string | null;
    const angkatanId = row.angkatan_id as string | null;

    try {
      // Update status first
      await supabase.from("siswa").update({ status: "diterima" } as any).eq("id", id);

      // Try to generate NIS if all required fields exist
      if (departemenId && angkatanId) {
        // Find kelas from kelas_siswa
        const { data: kelasSiswa } = await supabase
          .from("kelas_siswa")
          .select("kelas_id")
          .eq("siswa_id", id)
          .eq("aktif", true)
          .single();

        if (kelasSiswa?.kelas_id) {
          try {
            const { nis } = await generateNISViaEdgeFunction(supabase, {
              siswa_id: id,
              departemen_id: departemenId,
              angkatan_id: angkatanId,
              kelas_id: kelasSiswa.kelas_id,
            });
            qc.invalidateQueries({ queryKey: ["siswa"] });
            toast.success(`Siswa diterima dengan NIS: ${nis}`);
            return;
          } catch (e: any) {
            toast.warning(`Siswa diterima, tapi NIS gagal: ${e.message}`);
          }
        } else {
          toast.warning("Siswa diterima, tapi kelas belum diatur sehingga NIS belum bisa dibuat");
        }
      } else {
        toast.success("Siswa diterima (NIS belum dibuat — lengkapi departemen, angkatan & kelas)");
      }
      qc.invalidateQueries({ queryKey: ["siswa"] });
    } catch {
      toast.error("Gagal menerima siswa");
    }
  };

  const handleAktifkan = async (id: string) => {
    await supabase.from("siswa").update({ status: "aktif" } as any).eq("id", id);
    qc.invalidateQueries({ queryKey: ["siswa"] });
    toast.success("Siswa diaktifkan");
  };

  const columns: DataTableColumn<Record<string, unknown>>[] = [
    { key: "nama", label: "Nama", sortable: true },
    { key: "nis", label: "NIS", render: (v) => (v as string) || "-" },
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
      key: "id", label: "Aksi", className: "w-40",
      render: (_, row) => {
        const status = row.status as string;
        return (
          <div className="flex gap-1">
            {status === "calon" && (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleTerima(row); }}>
                Terima
              </Button>
            )}
            {status === "diterima" && (
              <Button size="sm" onClick={(e) => { e.stopPropagation(); handleAktifkan(row.id as string); }}>
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
                <Select value={formData.departemen_id} onValueChange={(v) => setFormData({ ...formData, departemen_id: v, kelas_id: "", angkatan_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Pilih lembaga" /></SelectTrigger>
                  <SelectContent>
                    {departemenList.map((d) => <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kelas</Label>
                <Select value={formData.kelas_id} onValueChange={(v) => setFormData({ ...formData, kelas_id: v })} disabled={!formData.departemen_id}>
                  <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                  <SelectContent>
                    {filteredKelas.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Angkatan</Label>
                <Select value={formData.angkatan_id} onValueChange={(v) => setFormData({ ...formData, angkatan_id: v })} disabled={!formData.departemen_id}>
                  <SelectTrigger><SelectValue placeholder="Pilih angkatan" /></SelectTrigger>
                  <SelectContent>
                    {filteredAngkatan.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedDept?.npsn && selectedKelas && selectedAngkatan && (
                <NISPreview
                  npsn={selectedDept.npsn}
                  namaKelas={selectedKelas.nama}
                  namaAngkatan={selectedAngkatan.nama}
                  estimasiUrut={1}
                />
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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard title="Total Pendaftar" value={calonList.length} icon={Users} color="primary" />
        <StatsCard title="Menunggu" value={calonCount} icon={Clock} color="warning" />
        <StatsCard title="Diterima" value={diterimaCount} icon={UserCheck} color="success" />
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
