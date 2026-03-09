import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useDepartemen } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, AlertTriangle, Search, Paperclip, Download, X } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const KATEGORI = ["Umum", "Akademik", "Keuangan", "Kepegawaian", "Kegiatan", "Lainnya"];
const TARGET_OPTIONS = [
  { value: "semua", label: "Semua" },
  { value: "siswa", label: "Hanya Siswa" },
  { value: "pegawai", label: "Hanya Pegawai" },
  { value: "lembaga", label: "Per Lembaga" },
];

const kategoriBadgeColor: Record<string, string> = {
  Umum: "bg-muted text-muted-foreground",
  Akademik: "bg-primary/10 text-primary",
  Keuangan: "bg-emerald-500/10 text-emerald-700",
  Kepegawaian: "bg-yellow-500/10 text-yellow-700",
  Kegiatan: "bg-violet-500/10 text-violet-700",
  Lainnya: "bg-muted text-muted-foreground",
};

export default function Buletin() {
  const { role, user } = useAuth();
  const canEdit = role === "admin" || role === "kepala_sekolah";
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterKategori, setFilterKategori] = useState("all");
  const [filterTarget, setFilterTarget] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    judul: "", konten: "", kategori: "Umum", target_tipe: "semua",
    departemen_id: "", tanggal_tayang: format(new Date(), "yyyy-MM-dd"),
    tanggal_kadaluarsa: "", penting: false,
  });

  const { data: depts } = useDepartemen();

  const { data: pengumumanList, isLoading } = useQuery({
    queryKey: ["pengumuman", filterKategori, filterTarget, searchTerm],
    queryFn: async () => {
      let q = supabase.from("pengumuman").select("*, departemen:departemen_id(nama, kode), penulis:penulis_id(email)").order("penting", { ascending: false }).order("tanggal_tayang", { ascending: false });
      if (filterKategori !== "all") q = q.eq("kategori", filterKategori);
      if (filterTarget !== "all") q = q.eq("target_tipe", filterTarget);
      if (searchTerm) q = q.ilike("judul", `%${searchTerm}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: sidebarStats } = useQuery({
    queryKey: ["pengumuman_stats"],
    queryFn: async () => {
      const { count: aktif } = await supabase.from("pengumuman").select("*", { count: "exact", head: true }).eq("aktif", true);
      const sevenDays = format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd");
      const { count: kadaluarsa } = await supabase.from("pengumuman").select("*", { count: "exact", head: true }).eq("aktif", true).lte("tanggal_kadaluarsa", sevenDays).gte("tanggal_kadaluarsa", format(new Date(), "yyyy-MM-dd"));
      const { count: penting } = await supabase.from("pengumuman").select("*", { count: "exact", head: true }).eq("penting", true).eq("aktif", true);
      return { aktif: aktif || 0, kadaluarsa: kadaluarsa || 0, penting: penting || 0 };
    },
  });

  const saveMut = useMutation({
    mutationFn: async (vals: any) => {
      if (editItem) {
        const { error } = await supabase.from("pengumuman").update(vals).eq("id", editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pengumuman").insert({ ...vals, penulis_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pengumuman"] }); qc.invalidateQueries({ queryKey: ["pengumuman_stats"] }); toast.success("Pengumuman berhasil disimpan"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("pengumuman").update({ aktif: false }).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pengumuman"] }); toast.success("Pengumuman dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditItem(null);
    setForm({ judul: "", konten: "", kategori: "Umum", target_tipe: "semua", departemen_id: "", tanggal_tayang: format(new Date(), "yyyy-MM-dd"), tanggal_kadaluarsa: "", penting: false });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ judul: item.judul, konten: item.konten, kategori: item.kategori || "Umum", target_tipe: item.target_tipe || "semua", departemen_id: item.departemen_id || "", tanggal_tayang: item.tanggal_tayang || format(new Date(), "yyyy-MM-dd"), tanggal_kadaluarsa: item.tanggal_kadaluarsa || "", penting: item.penting || false });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.judul.trim() || !form.konten.trim()) { toast.error("Judul dan konten wajib diisi"); return; }
    saveMut.mutate({
      judul: form.judul, konten: form.konten, kategori: form.kategori,
      target_tipe: form.target_tipe, departemen_id: form.target_tipe === "lembaga" ? form.departemen_id || null : null,
      tanggal_tayang: form.tanggal_tayang, tanggal_kadaluarsa: form.tanggal_kadaluarsa || null,
      penting: form.penting,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buletin</h1>
          <p className="text-sm text-muted-foreground">Pengumuman dan informasi sekolah</p>
        </div>
        {canEdit && <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Buat Pengumuman</Button>}
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cari pengumuman..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <div><Select value={filterKategori} onValueChange={setFilterKategori}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua Kategori</SelectItem>{KATEGORI.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select></div>
        <div><Select value={filterTarget} onValueChange={setFilterTarget}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua Target</SelectItem>{TARGET_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Main list */}
        <div className="space-y-4">
          {isLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />) :
            pengumumanList?.length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">Belum ada pengumuman</CardContent></Card> :
            pengumumanList?.map((a: any) => (
              <Card key={a.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge className={kategoriBadgeColor[a.kategori] || kategoriBadgeColor.Umum} variant="secondary">{a.kategori}</Badge>
                        {a.penting && <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />PENTING</Badge>}
                        <Badge variant="outline" className="text-xs">{a.target_tipe === "lembaga" ? a.departemen?.nama || "Lembaga" : a.target_tipe}</Badge>
                        <span className="text-xs text-muted-foreground">{a.tanggal_tayang ? format(new Date(a.tanggal_tayang), "dd MMM yyyy", { locale: idLocale }) : ""}</span>
                      </div>
                      <h3 className="font-semibold text-foreground">{a.judul}</h3>
                      {expandedId === a.id ? (
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{a.konten}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.konten}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">Oleh: {a.penulis?.email || "-"}</p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          }
        </div>

        {/* Sidebar stats */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Ringkasan</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Pengumuman Aktif</span><span className="font-bold">{sidebarStats?.aktif || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Kadaluarsa (7 hari)</span><span className="font-bold text-yellow-600">{sidebarStats?.kadaluarsa || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pengumuman Penting</span><span className="font-bold text-destructive">{sidebarStats?.penting || 0}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit Pengumuman" : "Buat Pengumuman"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Judul *</Label><Input value={form.judul} onChange={e => setForm({ ...form, judul: e.target.value })} /></div>
            <div><Label>Kategori *</Label><Select value={form.kategori} onValueChange={v => setForm({ ...form, kategori: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KATEGORI.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Konten *</Label><Textarea value={form.konten} onChange={e => setForm({ ...form, konten: e.target.value })} rows={5} /></div>
            <div><Label>Target Penerima</Label><Select value={form.target_tipe} onValueChange={v => setForm({ ...form, target_tipe: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TARGET_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            {form.target_tipe === "lembaga" && (
              <div><Label>Lembaga</Label><Select value={form.departemen_id} onValueChange={v => setForm({ ...form, departemen_id: v })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.kode || d.nama}</SelectItem>)}</SelectContent></Select></div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Tanggal Tayang *</Label><Input type="date" value={form.tanggal_tayang} onChange={e => setForm({ ...form, tanggal_tayang: e.target.value })} /></div>
              <div><Label>Tanggal Kadaluarsa</Label><Input type="date" value={form.tanggal_kadaluarsa} onChange={e => setForm({ ...form, tanggal_kadaluarsa: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.penting} onCheckedChange={v => setForm({ ...form, penting: v })} /><Label>Tandai sebagai Penting</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saveMut.isPending}>{saveMut.isPending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Pengumuman" description="Pengumuman akan dinonaktifkan. Yakin?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </div>
  );
}
