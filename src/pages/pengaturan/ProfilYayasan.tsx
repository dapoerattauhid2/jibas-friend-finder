import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from "@/components/shared/FileUpload";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { Save, Building2, Plus, Pencil } from "lucide-react";

type DeptRow = Record<string, unknown> & {
  id: string; kode: string | null; nama: string; keterangan: string | null; aktif: boolean | null;
  alamat: string | null; kota: string | null; telepon: string | null; email: string | null;
  kepala_sekolah: string | null; npsn: string | null; akreditasi: string | null; logo_url: string | null;
  kategori: string | null;
};

export default function ProfilYayasan() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profil & Lembaga</h1>
        <p className="text-sm text-muted-foreground">Kelola identitas yayasan dan data lembaga</p>
      </div>
      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil">Profil Yayasan</TabsTrigger>
          <TabsTrigger value="lembaga">Data Lembaga</TabsTrigger>
        </TabsList>
        <TabsContent value="profil"><TabProfil isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="lembaga"><TabLembaga isAdmin={isAdmin} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ TAB PROFIL YAYASAN ============ */
function TabProfil({ isAdmin }: { isAdmin: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string | null>>({});
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("sekolah").select("*").maybeSingle().then(({ data }) => {
      if (data) {
        setId(data.id);
        setForm({
          nama: data.nama, alamat: data.alamat, kota: data.kota,
          telepon: data.telepon, email: data.email,
          kepala_sekolah: data.kepala_sekolah, npsn: data.npsn,
          akreditasi: data.akreditasi, logo_url: data.logo_url,
        });
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    const payload = {
      nama: form.nama || null, alamat: form.alamat || null,
      kota: form.kota || null, telepon: form.telepon || null,
      email: form.email || null, kepala_sekolah: form.kepala_sekolah || null,
      npsn: form.npsn || null, akreditasi: form.akreditasi || null,
      logo_url: form.logo_url || null,
    };

    let error;
    if (id) {
      ({ error } = await supabase.from("sekolah").update(payload).eq("id", id));
    } else {
      ({ error } = await supabase.from("sekolah").insert(payload));
    }

    setSaving(false);
    if (error) toast.error("Gagal menyimpan: " + error.message);
    else toast.success("Profil yayasan berhasil disimpan");
  };

  const set = (key: string, val: string | null) => setForm((f) => ({ ...f, [key]: val }));

  if (loading) return <div className="py-8 text-center text-muted-foreground">Memuat...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Profil Yayasan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="shrink-0">
            <Label className="mb-2 block">Logo Yayasan</Label>
            <FileUpload bucket="logos-sekolah" value={form.logo_url || undefined} onChange={(url) => set("logo_url", url)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 flex-1">
            <Field label="Nama Yayasan" value={form.nama} onChange={(v) => set("nama", v)} />
            <Field label="Ketua Yayasan" value={form.kepala_sekolah} onChange={(v) => set("kepala_sekolah", v)} />
            <Field label="Alamat" value={form.alamat} onChange={(v) => set("alamat", v)} />
            <Field label="Kota" value={form.kota} onChange={(v) => set("kota", v)} />
            <Field label="Telepon" value={form.telepon} onChange={(v) => set("telepon", v)} />
            <Field label="Email" value={form.email} onChange={(v) => set("email", v)} />
            <Field label="NPSN" value={form.npsn} onChange={(v) => set("npsn", v)} />
            <Field label="Akreditasi" value={form.akreditasi} onChange={(v) => set("akreditasi", v)} />
          </div>
        </div>
        {isAdmin && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ============ TAB DATA LEMBAGA ============ */
function TabLembaga({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<DeptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeptRow | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data: d } = await supabase.from("departemen").select("*").order("kode");
    setData((d as DeptRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (row: DeptRow) => { setEditing(row); setDialogOpen(true); };

  const KATEGORI_BADGE: Record<string, { label: string; className: string }> = {
    unit_pendidikan: { label: "Pendidikan", className: "bg-info/15 text-info border-info/30" },
    unit_usaha: { label: "Usaha", className: "bg-success/15 text-success border-success/30" },
    unit_dana_terikat: { label: "Dana Terikat", className: "bg-warning/15 text-warning border-warning/30" },
    unit_yayasan: { label: "Yayasan", className: "bg-muted text-muted-foreground border-muted-foreground/30" },
  };

  const columns: DataTableColumn<DeptRow>[] = [
    { key: "kode", label: "Kode", sortable: true },
    { key: "nama", label: "Nama", sortable: true },
    {
      key: "kategori", label: "Kategori",
      render: (v) => {
        if (!v) return <span className="text-muted-foreground">—</span>;
        const cfg = KATEGORI_BADGE[v as string];
        return cfg ? <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge> : String(v);
      },
    },
    { key: "kepala_sekolah", label: "Kepala Sekolah" },
    { key: "npsn", label: "NPSN" },
    {
      key: "aktif", label: "Status",
      render: (_val: unknown, row: DeptRow) => (
        <Badge variant={row.aktif ? "default" : "secondary"}>{row.aktif ? "Aktif" : "Nonaktif"}</Badge>
      ),
    },
    ...(isAdmin ? [{
      key: "_aksi", label: "Aksi",
      render: (_val: unknown, row: DeptRow) => (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    } satisfies DataTableColumn<DeptRow>] : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        searchable
        actions={isAdmin ? (
          <Button size="sm" onClick={openAdd}><Plus className="mr-1 h-4 w-4" /> Tambah Lembaga</Button>
        ) : undefined}
      />
      {dialogOpen && (
        <DialogLembaga
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
          onSaved={fetchData}
        />
      )}
    </>
  );
}

function DialogLembaga({ open, onOpenChange, initial, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  initial: DeptRow | null; onSaved: () => void;
}) {
  const [kode, setKode] = useState(initial?.kode || "");
  const [nama, setNama] = useState(initial?.nama || "");
  const [keterangan, setKeterangan] = useState(initial?.keterangan || "");
  const [aktif, setAktif] = useState(initial?.aktif ?? true);
  const [alamat, setAlamat] = useState(initial?.alamat || "");
  const [kota, setKota] = useState(initial?.kota || "");
  const [telepon, setTelepon] = useState(initial?.telepon || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [kepalaSekolah, setKepalaSekolah] = useState(initial?.kepala_sekolah || "");
  const [npsn, setNpsn] = useState(initial?.npsn || "");
  const [akreditasi, setAkreditasi] = useState(initial?.akreditasi || "");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url || "");
  const [kategori, setKategori] = useState(initial?.kategori || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nama.trim()) { toast.error("Nama lembaga wajib diisi"); return; }
    setSaving(true);
    const payload: any = {
      kode: kode || null, nama, keterangan: keterangan || null, aktif,
      alamat: alamat || null, kota: kota || null, telepon: telepon || null,
      email: email || null, kepala_sekolah: kepalaSekolah || null,
      npsn: npsn || null, akreditasi: akreditasi || null, logo_url: logoUrl || null,
      kategori: kategori || null,
    };
    let error;
    if (initial) {
      ({ error } = await supabase.from("departemen").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await supabase.from("departemen").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error("Gagal menyimpan: " + error.message); return; }
    toast.success(initial ? "Lembaga diperbarui" : "Lembaga ditambahkan");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Lembaga" : "Tambah Lembaga"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Kode</Label><Input value={kode} onChange={(e) => setKode(e.target.value)} placeholder="SD" /></div>
            <div className="space-y-1.5"><Label>Nama *</Label><Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Sekolah Dasar" /></div>
          </div>
          <div className="space-y-1.5"><Label>Keterangan</Label><Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Kategori Unit</Label>
            <Select value={kategori || "__none__"} onValueChange={(v) => setKategori(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Pilih kategori..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Tidak dikategorikan —</SelectItem>
                <SelectItem value="unit_pendidikan">Unit Pendidikan (TK, SD, SMP, SMA, MTA)</SelectItem>
                <SelectItem value="unit_usaha">Unit Usaha (Mart, Dapoer, Kantin, Kepondokan)</SelectItem>
                <SelectItem value="unit_dana_terikat">Unit Dana Terikat (Masjid ICT — aset neto terikat)</SelectItem>
                <SelectItem value="unit_yayasan">Unit Yayasan (Umum, Kepegawaian)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Digunakan untuk pengelompokan laporan ISAK 35</p>
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-sm font-semibold text-muted-foreground mb-3">Identitas Lembaga (untuk kop surat & rapor)</p>
            <div className="space-y-3">
              <div className="shrink-0">
                <Label className="mb-2 block">Logo Lembaga</Label>
                <FileUpload bucket="logos-sekolah" value={logoUrl || undefined} onChange={(url) => setLogoUrl(url || "")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Kepala Sekolah</Label><Input value={kepalaSekolah} onChange={(e) => setKepalaSekolah(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>NPSN</Label><Input value={npsn} onChange={(e) => setNpsn(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Akreditasi</Label><Input value={akreditasi} onChange={(e) => setAkreditasi(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Telepon</Label><Input value={telepon} onChange={(e) => setTelepon(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Kota</Label><Input value={kota} onChange={(e) => setKota(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Alamat</Label><Input value={alamat} onChange={(e) => setAlamat(e.target.value)} /></div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={aktif} onCheckedChange={setAktif} />
            <Label>Aktif</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
