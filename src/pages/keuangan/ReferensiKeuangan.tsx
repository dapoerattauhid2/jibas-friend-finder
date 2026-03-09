import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  useAllJenisPembayaran, useCreateJenisPembayaran, useUpdateJenisPembayaran, useDeleteJenisPembayaran,
  useAllJenisPengeluaran, useCreateJenisPengeluaran, useUpdateJenisPengeluaran, useDeleteJenisPengeluaran,
  useTahunAjaran, useCreateTahunAjaran, useUpdateTahunAjaran, useDeleteTahunAjaran, useAktifkanTahunAjaran,
  useLembaga, formatRupiah,
} from "@/hooks/useKeuangan";
import { useAllAkunRekening, useCreateAkunRekening, useUpdateAkunRekening, useDeleteAkunRekening, useAkunByJenis, usePengaturanAkun, useUpdatePengaturanAkun } from "@/hooks/useJurnal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, AlertTriangle, Save, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";

export default function ReferensiKeuangan() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Referensi Keuangan</h1>
        <p className="text-sm text-muted-foreground">Kelola jenis penerimaan dan pengeluaran</p>
      </div>
      <Tabs defaultValue="penerimaan">
        <TabsList>
          <TabsTrigger value="penerimaan">Jenis Penerimaan</TabsTrigger>
          <TabsTrigger value="pengeluaran">Jenis Pengeluaran</TabsTrigger>
          <TabsTrigger value="akun">Akun Rekening</TabsTrigger>
          <TabsTrigger value="pengaturan-akun">Pengaturan Akun</TabsTrigger>
          <TabsTrigger value="tahun-buku">Tahun Buku</TabsTrigger>
          <TabsTrigger value="template">Template Nomor</TabsTrigger>
        </TabsList>
        <TabsContent value="penerimaan"><TabJenisPembayaran /></TabsContent>
        <TabsContent value="pengeluaran"><TabJenisPengeluaran /></TabsContent>
        <TabsContent value="akun"><TabAkunRekening /></TabsContent>
        <TabsContent value="pengaturan-akun"><TabPengaturanAkun /></TabsContent>
        <TabsContent value="tahun-buku"><TabTahunBuku /></TabsContent>
        <TabsContent value="template"><TabTemplateNomor /></TabsContent>
      </Tabs>
    </div>
  );
}

function TabJenisPembayaran() {
  const { data, isLoading } = useAllJenisPembayaran();
  const { data: lembagaList } = useLembaga();
  const { data: akunPendapatanList } = useAkunByJenis("pendapatan");
  const createMut = useCreateJenisPembayaran();
  const updateMut = useUpdateJenisPembayaran();
  const deleteMut = useDeleteJenisPembayaran();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [nama, setNama] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [aktif, setAktif] = useState(true);
  const [formDepartemenId, setFormDepartemenId] = useState("");
  const [akunPendapatanId, setAkunPendapatanId] = useState("");
  const [tipe, setTipe] = useState("bulanan");

  const openAdd = () => { setEditItem(null); setNama(""); setNominal(""); setKeterangan(""); setAktif(true); setFormDepartemenId(""); setAkunPendapatanId(""); setTipe("bulanan"); setDialogOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); setNama(item.nama); setNominal(String(item.nominal || "")); setKeterangan(item.keterangan || ""); setAktif(item.aktif !== false); setFormDepartemenId(item.departemen_id || ""); setAkunPendapatanId(item.akun_pendapatan_id || ""); setTipe(item.tipe || "bulanan"); setDialogOpen(true); };

  const handleSave = async () => {
    const values = { nama, nominal: nominal ? Number(nominal) : undefined, keterangan: keterangan || undefined, aktif, departemen_id: formDepartemenId || undefined, akun_pendapatan_id: akunPendapatanId || null, tipe };
    if (editItem) await updateMut.mutateAsync({ id: editItem.id, ...values });
    else await createMut.mutateAsync(values);
    setDialogOpen(false);
  };

  const columns: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama", sortable: true },
    { key: "nominal", label: "Nominal", render: (v) => v ? formatRupiah(Number(v)) : "-" },
    { key: "tipe", label: "Tipe", render: (v) => v === "sekali" ? <Badge variant="secondary">Sekali Bayar</Badge> : <Badge variant="outline">Bulanan</Badge> },
    { key: "departemen", label: "Lembaga", render: (_, r) => (r as any).departemen?.kode || "Semua" },
    {
      key: "akun_pendapatan", label: "Akun Pendapatan",
      render: (_, r) => {
        const akun = (r as any).akun_pendapatan;
        if (akun) return <span className="text-sm">{akun.kode} - {akun.nama}</span>;
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Belum diset</Badge>;
      },
    },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    { key: "aktif", label: "Status", render: (v) => <span className={v ? "text-success" : "text-muted-foreground"}>{v ? "Aktif" : "Nonaktif"}</span> },
    {
      key: "aksi", label: "Aksi",
      render: (_, r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId((r as any).id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="mt-4">
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data || []}
            loading={isLoading}
            pageSize={20}
            actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah</Button>}
          />
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Jenis Penerimaan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama</Label><Input value={nama} onChange={(e) => setNama(e.target.value)} /></div>
            <div><Label>Nominal (Rp)</Label><Input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" /></div>
            <div>
              <Label>Tipe Pembayaran</Label>
              <Select value={tipe} onValueChange={setTipe}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bulanan">Bulanan (12x/tahun)</SelectItem>
                  <SelectItem value="sekali">Sekali Bayar</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Bulanan = SPP dll. Sekali Bayar = uang pangkal, pendaftaran dll.</p>
            </div>
            <div>
              <Label>Lembaga (kosongkan jika berlaku untuk semua)</Label>
              <Select value={formDepartemenId || "__all__"} onValueChange={(v) => setFormDepartemenId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua lembaga" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Lembaga</SelectItem>
                  {lembagaList?.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Akun Pendapatan (untuk jurnal otomatis)</Label>
              <Select value={akunPendapatanId || "__none__"} onValueChange={(v) => setAkunPendapatanId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih akun pendapatan..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak diset —</SelectItem>
                  {akunPendapatanList?.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.kode} - {a.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Akun yang di-kredit saat menerima pembayaran jenis ini</p>
            </div>
            <div><Label>Keterangan</Label><Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={aktif} onCheckedChange={setAktif} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!nama}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Jenis Penerimaan" description="Yakin ingin menghapus?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </>
  );
}

function TabJenisPengeluaran() {
  const { data, isLoading } = useAllJenisPengeluaran();
  const { data: lembagaList } = useLembaga();
  const { data: akunBebanList } = useAkunByJenis("beban");
  const createMut = useCreateJenisPengeluaran();
  const updateMut = useUpdateJenisPengeluaran();
  const deleteMut = useDeleteJenisPengeluaran();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [nama, setNama] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [aktif, setAktif] = useState(true);
  const [formDepartemenId, setFormDepartemenId] = useState("");
  const [akunBebanId, setAkunBebanId] = useState("");

  const openAdd = () => { setEditItem(null); setNama(""); setKeterangan(""); setAktif(true); setFormDepartemenId(""); setAkunBebanId(""); setDialogOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); setNama(item.nama); setKeterangan(item.keterangan || ""); setAktif(item.aktif !== false); setFormDepartemenId(item.departemen_id || ""); setAkunBebanId(item.akun_beban_id || ""); setDialogOpen(true); };

  const handleSave = async () => {
    const values = { nama, keterangan: keterangan || undefined, aktif, departemen_id: formDepartemenId || undefined, akun_beban_id: akunBebanId || null };
    if (editItem) await updateMut.mutateAsync({ id: editItem.id, ...values });
    else await createMut.mutateAsync(values);
    setDialogOpen(false);
  };

  const columns: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama", sortable: true },
    { key: "departemen", label: "Lembaga", render: (_, r) => (r as any).departemen?.kode || "Semua" },
    {
      key: "akun_beban", label: "Akun Beban",
      render: (_, r) => {
        const akun = (r as any).akun_beban;
        if (akun) return <span className="text-sm">{akun.kode} - {akun.nama}</span>;
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Belum diset</Badge>;
      },
    },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    { key: "aktif", label: "Status", render: (v) => <span className={v ? "text-success" : "text-muted-foreground"}>{v ? "Aktif" : "Nonaktif"}</span> },
    {
      key: "aksi", label: "Aksi",
      render: (_, r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId((r as any).id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="mt-4">
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data || []}
            loading={isLoading}
            pageSize={20}
            actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah</Button>}
          />
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Jenis Pengeluaran</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama</Label><Input value={nama} onChange={(e) => setNama(e.target.value)} /></div>
            <div>
              <Label>Lembaga (kosongkan jika berlaku untuk semua)</Label>
              <Select value={formDepartemenId || "__all__"} onValueChange={(v) => setFormDepartemenId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua lembaga" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Lembaga</SelectItem>
                  {lembagaList?.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Akun Beban (untuk jurnal otomatis)</Label>
              <Select value={akunBebanId || "__none__"} onValueChange={(v) => setAkunBebanId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih akun beban..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak diset —</SelectItem>
                  {akunBebanList?.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.kode} - {a.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Akun yang di-debit saat ada pengeluaran jenis ini</p>
            </div>
            <div><Label>Keterangan</Label><Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={aktif} onCheckedChange={setAktif} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!nama}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Jenis Pengeluaran" description="Yakin ingin menghapus?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </>
  );
}

// ─── Tab Pengaturan Akun Sistem ───
function TabPengaturanAkun() {
  const { data: settings, isLoading } = usePengaturanAkun();
  const { data: akunAsetList } = useAkunByJenis("aset");
  const updateMut = useUpdatePengaturanAkun();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((s: any) => { map[s.kode_setting] = s.akun_id || ""; });
      setValues(map);
    }
  }, [settings]);

  const settingsConfig = [
    { kode: "kas_tunai", label: "Akun Kas Tunai", desc: "Digunakan saat kasir input pembayaran manual" },
    { kode: "bank_midtrans", label: "Akun Bank Online Payment", desc: "Digunakan saat pembayaran online via Midtrans berhasil" },
    { kode: "kas_pengeluaran", label: "Akun Kas Pengeluaran", desc: "Digunakan saat ada pengeluaran (sisi kredit)" },
  ];

  const hasUnset = settings?.some((s: any) => !s.akun_id);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const cfg of settingsConfig) {
        const currentSetting = settings?.find((s: any) => s.kode_setting === cfg.kode);
        const newVal = values[cfg.kode] || null;
        if (currentSetting && currentSetting.akun_id !== newVal) {
          await updateMut.mutateAsync({ kode_setting: cfg.kode, akun_id: newVal });
        }
      }
      toast.success("Pengaturan akun berhasil disimpan");
    } catch {
      // error handled by mutation
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Card className="mt-4"><CardContent className="pt-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded" />)}</div></CardContent></Card>;
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-6 space-y-6">
        {hasUnset && (
          <Alert variant="destructive" className="border-yellow-300 bg-yellow-50 text-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              ⚠️ Beberapa akun sistem belum dikonfigurasi. Jurnal otomatis tidak akan berjalan sampai semua akun diset.
            </AlertDescription>
          </Alert>
        )}

        {settingsConfig.map((cfg) => {
          const setting = settings?.find((s: any) => s.kode_setting === cfg.kode);
          return (
            <div key={cfg.kode} className="space-y-2 p-4 border rounded-lg">
              <Label className="text-base font-semibold">{cfg.label}</Label>
              <p className="text-sm text-muted-foreground">{cfg.desc}</p>
              <Select value={values[cfg.kode] || "__none__"} onValueChange={(v) => setValues(prev => ({ ...prev, [cfg.kode]: v === "__none__" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Belum diset —</SelectItem>
                  {akunAsetList?.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.kode} - {a.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {setting?.akun && (
                <p className="text-xs text-muted-foreground">Saat ini: <span className="font-medium">{setting.akun.kode} - {setting.akun.nama}</span></p>
              )}
            </div>
          );
        })}

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </Button>
      </CardContent>
    </Card>
  );
}

const JENIS_OPTIONS = [
  { value: "aset", label: "Aset" },
  { value: "liabilitas", label: "Liabilitas" },
  { value: "ekuitas", label: "Ekuitas" },
  { value: "pendapatan", label: "Pendapatan" },
  { value: "beban", label: "Beban" },
];

const SALDO_NORMAL_MAP: Record<string, string> = {
  aset: "debit", liabilitas: "kredit", ekuitas: "kredit", pendapatan: "kredit", beban: "debit",
};

function TabAkunRekening() {
  const { data, isLoading } = useAllAkunRekening();
  const { data: lembagaList } = useLembaga();
  const createMut = useCreateAkunRekening();
  const updateMut = useUpdateAkunRekening();
  const deleteMut = useDeleteAkunRekening();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [jenis, setJenis] = useState("aset");
  const [saldoNormal, setSaldoNormal] = useState("debit");
  const [saldoAwal, setSaldoAwal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [aktif, setAktif] = useState(true);
  const [formDepartemenId, setFormDepartemenId] = useState("");

  const openAdd = () => {
    setEditItem(null); setKode(""); setNama(""); setJenis("aset"); setSaldoNormal("debit"); setSaldoAwal(""); setKeterangan(""); setAktif(true); setFormDepartemenId(""); setDialogOpen(true);
  };
  const openEdit = (item: any) => {
    setEditItem(item); setKode(item.kode); setNama(item.nama); setJenis(item.jenis); setSaldoNormal(item.saldo_normal); setSaldoAwal(String(item.saldo_awal || "")); setKeterangan(item.keterangan || ""); setAktif(item.aktif !== false); setFormDepartemenId(item.departemen_id || ""); setDialogOpen(true);
  };

  const handleJenisChange = (v: string) => {
    setJenis(v);
    setSaldoNormal(SALDO_NORMAL_MAP[v] || "debit");
  };

  const handleSave = async () => {
    const values = { kode, nama, jenis, saldo_normal: saldoNormal, saldo_awal: saldoAwal ? Number(saldoAwal) : 0, keterangan: keterangan || undefined, aktif, departemen_id: formDepartemenId || undefined };
    if (editItem) await updateMut.mutateAsync({ id: editItem.id, ...values });
    else await createMut.mutateAsync(values);
    setDialogOpen(false);
  };

  const jenisLabel: Record<string, string> = { aset: "Aset", liabilitas: "Liabilitas", ekuitas: "Ekuitas", pendapatan: "Pendapatan", beban: "Beban" };

  const columns: DataTableColumn<any>[] = [
    { key: "kode", label: "Kode", sortable: true },
    { key: "nama", label: "Nama", sortable: true },
    { key: "jenis", label: "Jenis", render: (v) => jenisLabel[v as string] || String(v) },
    { key: "departemen", label: "Lembaga", render: (_, r) => (r as any).departemen?.kode || "Shared" },
    { key: "saldo_normal", label: "Saldo Normal", render: (v) => <span className="capitalize">{v as string}</span> },
    { key: "saldo_awal", label: "Saldo Awal", render: (v) => formatRupiah(Number(v) || 0) },
    { key: "aktif", label: "Status", render: (v) => <span className={v ? "text-success" : "text-muted-foreground"}>{v ? "Aktif" : "Nonaktif"}</span> },
    {
      key: "aksi", label: "Aksi",
      render: (_, r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId((r as any).id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="mt-4">
        <CardContent className="pt-6">
          <DataTable columns={columns} data={data || []} loading={isLoading} pageSize={20} actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah</Button>} />
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Akun Rekening</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Kode *</Label><Input value={kode} onChange={(e) => setKode(e.target.value)} placeholder="1-1001" /></div>
            <div><Label>Nama *</Label><Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Kas Tunai" /></div>
            <div>
              <Label>Jenis</Label>
              <Select value={jenis} onValueChange={handleJenisChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JENIS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lembaga (kosongkan jika shared antar lembaga)</Label>
              <Select value={formDepartemenId || "__all__"} onValueChange={(v) => setFormDepartemenId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Shared (semua lembaga)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Shared (Semua Lembaga)</SelectItem>
                  {lembagaList?.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Saldo Normal</Label>
              <Select value={saldoNormal} onValueChange={setSaldoNormal}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit</SelectItem>
                  <SelectItem value="kredit">Kredit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Saldo Awal (Rp)</Label><Input type="number" value={saldoAwal} onChange={(e) => setSaldoAwal(e.target.value)} placeholder="0" /></div>
            <div><Label>Keterangan</Label><Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={aktif} onCheckedChange={setAktif} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!kode || !nama}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Akun Rekening" description="Yakin ingin menghapus akun ini? Akun yang sudah digunakan dalam jurnal tidak bisa dihapus." onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </>
  );
}

function TabTahunBuku() {
  const { data, isLoading } = useTahunAjaran();
  const createMut = useCreateTahunAjaran();
  const updateMut = useUpdateTahunAjaran();
  const deleteMut = useDeleteTahunAjaran();
  const aktifkanMut = useAktifkanTahunAjaran();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [nama, setNama] = useState("");
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [aktif, setAktif] = useState(false);

  const openAdd = () => {
    setEditItem(null); setNama(""); setTanggalMulai(""); setTanggalSelesai(""); setKeterangan(""); setAktif(false); setDialogOpen(true);
  };
  const openEdit = (item: any) => {
    setEditItem(item); setNama(item.nama); setTanggalMulai(item.tanggal_mulai || ""); setTanggalSelesai(item.tanggal_selesai || ""); setKeterangan(item.keterangan || ""); setAktif(item.aktif === true); setDialogOpen(true);
  };

  const handleSave = async () => {
    const values = { nama, tanggal_mulai: tanggalMulai, tanggal_selesai: tanggalSelesai, keterangan: keterangan || undefined, aktif };
    if (editItem) await updateMut.mutateAsync({ id: editItem.id, ...values });
    else await createMut.mutateAsync(values);
    setDialogOpen(false);
  };

  const columns: DataTableColumn<any>[] = [
    { key: "nama", label: "Nama", sortable: true },
    { key: "tanggal_mulai", label: "Mulai", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "tanggal_selesai", label: "Selesai", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    {
      key: "aktif", label: "Status",
      render: (v, r: any) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={!!v}
            onCheckedChange={(checked) => {
              if (checked) {
                aktifkanMut.mutate({ id: r.id, nama: r.nama });
              }
            }}
            disabled={!!v}
          />
          <span className={v ? "text-success font-medium" : "text-muted-foreground"}>
            {v ? "Aktif" : "Nonaktif"}
          </span>
        </div>
      ),
    },
    {
      key: "aksi", label: "Aksi",
      render: (_, r: any) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="mt-4">
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={data || []}
            loading={isLoading}
            pageSize={20}
            actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah</Button>}
          />
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Tahun Ajaran</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nama Tahun Ajaran *</Label><Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="2025/2026" /></div>
            <div><Label>Tanggal Mulai *</Label><Input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} /></div>
            <div><Label>Tanggal Selesai *</Label><Input type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} /></div>
            <div><Label>Keterangan</Label><Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={aktif} onCheckedChange={setAktif} /><Label>Jadikan Aktif</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!nama || !tanggalMulai || !tanggalSelesai}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Hapus Tahun Ajaran"
        description="Yakin ingin menghapus tahun ajaran ini?"
        onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}
      />
    </>
  );
}

// ─── Tab Template Nomor Kuitansi / Jurnal ───
function TabTemplateNomor() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const { data: templates, isLoading } = useQuery({
    queryKey: ["pengaturan_template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pengaturan_template")
        .select("*")
        .order("kode_template");
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (templates) {
      const map: Record<string, string> = {};
      templates.forEach((t: any) => { map[t.kode_template] = t.template; });
      setValues(map);
    }
  }, [templates]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const t of templates || []) {
        const newVal = values[t.kode_template];
        if (newVal !== undefined && newVal !== t.template) {
          const { error } = await supabase
            .from("pengaturan_template")
            .update({ template: newVal })
            .eq("id", t.id);
          if (error) throw error;
        }
      }
      qc.invalidateQueries({ queryKey: ["pengaturan_template"] });
      toast.success("Template berhasil disimpan");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Card className="mt-4"><CardContent className="pt-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded" />)}</div></CardContent></Card>;
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-6 space-y-6">
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription>
            Variabel yang tersedia: <code className="text-primary font-mono text-xs">{"{TAHUN}"}</code> <code className="text-primary font-mono text-xs">{"{BULAN}"}</code> <code className="text-primary font-mono text-xs">{"{NOMOR}"}</code> <code className="text-primary font-mono text-xs">{"{LEMBAGA}"}</code>
            <br />
            Contoh: <code className="font-mono text-xs">KWT-{"{TAHUN}"}-{"{BULAN}"}-{"{NOMOR}"}</code> → <span className="font-medium">KWT-2026-03-001</span>
          </AlertDescription>
        </Alert>

        {(templates || []).map((t: any) => (
          <div key={t.kode_template} className="space-y-2 p-4 border rounded-lg">
            <Label className="text-base font-semibold">{t.label}</Label>
            {t.keterangan && <p className="text-sm text-muted-foreground">{t.keterangan}</p>}
            <Input
              value={values[t.kode_template] || ""}
              onChange={(e) => setValues(prev => ({ ...prev, [t.kode_template]: e.target.value }))}
              placeholder={t.template}
              className="font-mono"
            />
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Menyimpan..." : "Simpan Template"}
        </Button>
      </CardContent>
    </Card>
  );
}
