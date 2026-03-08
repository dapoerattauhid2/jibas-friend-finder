import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useDepartemen, useTingkat, useKelas } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ReferensiAkademik() {
  const { role } = useAuth();
  const canEdit = role === "admin" || role === "kepala_sekolah";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Referensi Akademik</h1>
        <p className="text-sm text-muted-foreground">Kelola data referensi akademik sekolah</p>
      </div>
      <Tabs defaultValue="mapel">
        <TabsList className="flex-wrap">
          <TabsTrigger value="mapel">Mata Pelajaran</TabsTrigger>
          <TabsTrigger value="kelas">Kelas</TabsTrigger>
          <TabsTrigger value="tingkat">Tingkat</TabsTrigger>
          <TabsTrigger value="angkatan">Angkatan</TabsTrigger>
          <TabsTrigger value="departemen">Departemen/Lembaga</TabsTrigger>
        </TabsList>
        <TabsContent value="mapel"><TabMapel canEdit={canEdit} /></TabsContent>
        <TabsContent value="kelas"><TabKelas canEdit={canEdit} /></TabsContent>
        <TabsContent value="tingkat"><TabTingkat canEdit={canEdit} /></TabsContent>
        <TabsContent value="angkatan"><TabAngkatan canEdit={canEdit} /></TabsContent>
        <TabsContent value="departemen"><TabDepartemen /></TabsContent>
      </Tabs>
    </div>
  );
}

function TabMapel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterDept, setFilterDept] = useState("");
  const { data: depts } = useDepartemen();
  const { data: tingkatList } = useTingkat(filterDept || undefined);

  const [form, setForm] = useState({ kode: "", nama: "", departemen_id: "", tingkat_id: "", keterangan: "", aktif: true });

  const { data, isLoading } = useQuery({
    queryKey: ["mata_pelajaran_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mata_pelajaran")
        .select("*, departemen:departemen_id(nama, kode), tingkat:tingkat_id(nama)")
        .order("kode");
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (values: any) => {
      const payload = { ...values, departemen_id: values.departemen_id || null, tingkat_id: values.tingkat_id || null };
      if (editItem) {
        const { error } = await supabase.from("mata_pelajaran").update(payload).eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("mata_pelajaran").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mata_pelajaran_all"] }); toast.success("Berhasil disimpan"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("mata_pelajaran").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mata_pelajaran_all"] }); toast.success("Berhasil dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => { setEditItem(null); setForm({ kode: "", nama: "", departemen_id: "", tingkat_id: "", keterangan: "", aktif: true }); setDialogOpen(true); };
  const openEdit = (r: any) => { setEditItem(r); setForm({ kode: r.kode || "", nama: r.nama, departemen_id: r.departemen_id || "", tingkat_id: r.tingkat_id || "", keterangan: r.keterangan || "", aktif: r.aktif !== false }); setDialogOpen(true); };

  const filtered = filterDept ? (data || []).filter((r: any) => r.departemen_id === filterDept) : data || [];

  const columns: DataTableColumn<any>[] = [
    { key: "kode", label: "Kode", sortable: true },
    { key: "nama", label: "Nama", sortable: true },
    { key: "dept", label: "Lembaga", render: (_, r) => r.departemen?.kode || "-" },
    { key: "tingkat", label: "Tingkat", render: (_, r) => r.tingkat?.nama || "-" },
    { key: "aktif", label: "Status", render: (v) => <Badge variant={v ? "default" : "secondary"}>{v ? "Aktif" : "Nonaktif"}</Badge> },
    ...(canEdit ? [{
      key: "_aksi", label: "Aksi",
      render: (_: unknown, r: any) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <Select value={filterDept || "__all__"} onValueChange={(v) => setFilterDept(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Semua Lembaga" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Semua Lembaga</SelectItem>
            {depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.kode || d.nama}</SelectItem>)}
          </SelectContent>
        </Select>
        {canEdit && <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Mata Pelajaran</Button>}
      </div>
      <Card><CardContent className="pt-6"><DataTable columns={columns} data={filtered} loading={isLoading} exportable exportFilename="mata-pelajaran" /></CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Mata Pelajaran</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Kode *</Label><Input value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} /></div>
              <div><Label>Nama *</Label><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Lembaga</Label>
                <Select value={form.departemen_id} onValueChange={(v) => setForm({ ...form, departemen_id: v, tingkat_id: "" })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tingkat</Label>
                <Select value={form.tingkat_id} onValueChange={(v) => setForm({ ...form, tingkat_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>{tingkatList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Keterangan</Label><Textarea value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.aktif} onCheckedChange={(v) => setForm({ ...form, aktif: v })} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={() => { if (!form.kode || !form.nama) { toast.error("Kode dan nama wajib diisi"); return; } saveMut.mutate(form); }} disabled={saveMut.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Mata Pelajaran" description="Data yang dihapus tidak dapat dikembalikan." onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </div>
  );
}

function TabKelas({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data: depts } = useDepartemen();
  const [form, setForm] = useState({ nama: "", departemen_id: "", tingkat_id: "", wali_kelas_id: "", kapasitas: "36", aktif: true });
  const { data: tingkatList } = useTingkat(form.departemen_id || undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["kelas_all_ref"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kelas").select("*, tingkat:tingkat_id(nama), departemen:departemen_id(nama, kode), wali:wali_kelas_id(nama)").order("nama");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pegawaiList } = useQuery({
    queryKey: ["pegawai_guru_list"],
    queryFn: async () => { const { data } = await supabase.from("pegawai").select("id, nama").eq("status", "aktif").order("nama"); return data || []; },
  });

  const saveMut = useMutation({
    mutationFn: async (values: any) => {
      const payload = { nama: values.nama, departemen_id: values.departemen_id || null, tingkat_id: values.tingkat_id || null, wali_kelas_id: values.wali_kelas_id || null, kapasitas: Number(values.kapasitas) || 36, aktif: values.aktif };
      if (editItem) { const { error } = await supabase.from("kelas").update(payload).eq("id", editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from("kelas").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kelas_all_ref"] }); toast.success("Berhasil"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("kelas").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kelas_all_ref"] }); toast.success("Dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => { setEditItem(null); setForm({ nama: "", departemen_id: "", tingkat_id: "", wali_kelas_id: "", kapasitas: "36", aktif: true }); setDialogOpen(true); };
  const openEdit = (r: any) => { setEditItem(r); setForm({ nama: r.nama, departemen_id: r.departemen_id || "", tingkat_id: r.tingkat_id || "", wali_kelas_id: r.wali_kelas_id || "", kapasitas: String(r.kapasitas || 36), aktif: r.aktif !== false }); setDialogOpen(true); };

  const columns: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama Kelas", sortable: true },
    { key: "tingkat", label: "Tingkat", render: (_, r) => r.tingkat?.nama || "-" },
    { key: "dept", label: "Lembaga", render: (_, r) => r.departemen?.kode || "-" },
    { key: "wali", label: "Wali Kelas", render: (_, r) => r.wali?.nama || "-" },
    { key: "kapasitas", label: "Kapasitas" },
    { key: "aktif", label: "Status", render: (v) => <Badge variant={v ? "default" : "secondary"}>{v ? "Aktif" : "Nonaktif"}</Badge> },
    ...(canEdit ? [{ key: "_aksi", label: "Aksi", render: (_: unknown, r: any) => (
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ) }] : []),
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">{canEdit && <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Kelas</Button>}</div>
      <Card><CardContent className="pt-6"><DataTable columns={columns} data={data || []} loading={isLoading} exportable exportFilename="kelas" /></CardContent></Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Kelas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama Kelas *</Label><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="VII-A" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Lembaga</Label><Select value={form.departemen_id} onValueChange={(v) => setForm({ ...form, departemen_id: v, tingkat_id: "" })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Tingkat</Label><Select value={form.tingkat_id} onValueChange={(v) => setForm({ ...form, tingkat_id: v })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{tingkatList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>Wali Kelas</Label><Select value={form.wali_kelas_id} onValueChange={(v) => setForm({ ...form, wali_kelas_id: v })}><SelectTrigger><SelectValue placeholder="Pilih guru" /></SelectTrigger><SelectContent>{pegawaiList?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Kapasitas</Label><Input type="number" value={form.kapasitas} onChange={(e) => setForm({ ...form, kapasitas: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.aktif} onCheckedChange={(v) => setForm({ ...form, aktif: v })} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button onClick={() => { if (!form.nama) { toast.error("Nama wajib diisi"); return; } saveMut.mutate(form); }} disabled={saveMut.isPending}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Kelas" description="Yakin hapus kelas ini?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </div>
  );
}

function TabTingkat({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data: depts } = useDepartemen();
  const [form, setForm] = useState({ nama: "", urutan: "1", departemen_id: "", aktif: true });

  const { data, isLoading } = useQuery({
    queryKey: ["tingkat_all_ref"],
    queryFn: async () => { const { data, error } = await supabase.from("tingkat").select("*, departemen:departemen_id(nama, kode)").order("urutan"); if (error) throw error; return data as any[]; },
  });

  const saveMut = useMutation({
    mutationFn: async (values: any) => {
      const payload = { nama: values.nama, urutan: Number(values.urutan) || 1, departemen_id: values.departemen_id || null, aktif: values.aktif };
      if (editItem) { const { error } = await supabase.from("tingkat").update(payload).eq("id", editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from("tingkat").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tingkat_all_ref"] }); toast.success("Berhasil"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tingkat").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tingkat_all_ref"] }); toast.success("Dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => { setEditItem(null); setForm({ nama: "", urutan: "1", departemen_id: "", aktif: true }); setDialogOpen(true); };
  const openEdit = (r: any) => { setEditItem(r); setForm({ nama: r.nama, urutan: String(r.urutan || 1), departemen_id: r.departemen_id || "", aktif: r.aktif !== false }); setDialogOpen(true); };

  const columns: DataTableColumn<any>[] = [
    { key: "urutan", label: "Urutan", sortable: true },
    { key: "nama", label: "Nama Tingkat", sortable: true },
    { key: "dept", label: "Lembaga", render: (_, r) => r.departemen?.kode || "-" },
    { key: "aktif", label: "Status", render: (v) => <Badge variant={v ? "default" : "secondary"}>{v ? "Aktif" : "Nonaktif"}</Badge> },
    ...(canEdit ? [{ key: "_aksi", label: "Aksi", render: (_: unknown, r: any) => (
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ) }] : []),
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">{canEdit && <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Tingkat</Button>}</div>
      <Card><CardContent className="pt-6"><DataTable columns={columns} data={data || []} loading={isLoading} exportable exportFilename="tingkat" /></CardContent></Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Tingkat</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama *</Label><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="Kelas VII" /></div>
            <div><Label>Urutan</Label><Input type="number" value={form.urutan} onChange={(e) => setForm({ ...form, urutan: e.target.value })} /></div>
            <div><Label>Lembaga</Label><Select value={form.departemen_id} onValueChange={(v) => setForm({ ...form, departemen_id: v })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-center gap-2"><Switch checked={form.aktif} onCheckedChange={(v) => setForm({ ...form, aktif: v })} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button onClick={() => { if (!form.nama) { toast.error("Nama wajib diisi"); return; } saveMut.mutate(form); }} disabled={saveMut.isPending}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Tingkat" description="Yakin hapus tingkat ini?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </div>
  );
}

function TabAngkatan({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data: depts } = useDepartemen();
  const [form, setForm] = useState({ nama: "", departemen_id: "", keterangan: "", aktif: true });

  const { data, isLoading } = useQuery({
    queryKey: ["angkatan_all_ref"],
    queryFn: async () => {
      const { data, error } = await supabase.from("angkatan").select("*, departemen:departemen_id(nama, kode)").order("nama", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (values: any) => {
      const payload = { nama: values.nama, departemen_id: values.departemen_id || null, keterangan: values.keterangan || null, aktif: values.aktif };
      if (editItem) { const { error } = await supabase.from("angkatan").update(payload).eq("id", editItem.id); if (error) throw error; }
      else { const { error } = await supabase.from("angkatan").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["angkatan"] }); qc.invalidateQueries({ queryKey: ["angkatan_all_ref"] }); toast.success("Berhasil"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("angkatan").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["angkatan"] }); qc.invalidateQueries({ queryKey: ["angkatan_all_ref"] }); toast.success("Dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => { setEditItem(null); setForm({ nama: "", departemen_id: "", keterangan: "", aktif: true }); setDialogOpen(true); };
  const openEdit = (r: any) => { setEditItem(r); setForm({ nama: r.nama, departemen_id: r.departemen_id || "", keterangan: r.keterangan || "", aktif: r.aktif !== false }); setDialogOpen(true); };

  const columns: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama Angkatan", sortable: true },
    { key: "dept", label: "Lembaga", render: (_, r) => r.departemen?.kode || "-" },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    { key: "aktif", label: "Status", render: (v) => <Badge variant={v ? "default" : "secondary"}>{v ? "Aktif" : "Nonaktif"}</Badge> },
    ...(canEdit ? [{ key: "_aksi", label: "Aksi", render: (_: unknown, r: any) => (
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ) }] : []),
  ];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">{canEdit && <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Angkatan</Button>}</div>
      <Card><CardContent className="pt-6"><DataTable columns={columns} data={data || []} loading={isLoading} exportable exportFilename="angkatan" /></CardContent></Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Angkatan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama Angkatan *</Label><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="2025/2026" /></div>
            <div><Label>Lembaga</Label><Select value={form.departemen_id} onValueChange={(v) => setForm({ ...form, departemen_id: v })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Keterangan</Label><Textarea value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.aktif} onCheckedChange={(v) => setForm({ ...form, aktif: v })} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button><Button onClick={() => { if (!form.nama) { toast.error("Nama wajib diisi"); return; } saveMut.mutate(form); }} disabled={saveMut.isPending}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Angkatan" description="Yakin hapus angkatan ini?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </div>
  );
}

function TabDepartemen() {
  const { data, isLoading } = useQuery({
    queryKey: ["departemen_all_ref"],
    queryFn: async () => { const { data, error } = await supabase.from("departemen").select("*").order("nama"); if (error) throw error; return data as any[]; },
  });

  const columns: DataTableColumn<any>[] = [
    { key: "kode", label: "Kode" },
    { key: "nama", label: "Nama", sortable: true },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    { key: "aktif", label: "Status", render: (v) => <Badge variant={v ? "default" : "secondary"}>{v ? "Aktif" : "Nonaktif"}</Badge> },
  ];

  return (
    <div className="space-y-4 pt-4">
      <Alert><AlertDescription>Untuk mengubah data lembaga, buka menu <strong>Pengaturan → Profil Yayasan</strong></AlertDescription></Alert>
      <Card><CardContent className="pt-6"><DataTable columns={columns} data={data || []} loading={isLoading} /></CardContent></Card>
    </div>
  );
}
