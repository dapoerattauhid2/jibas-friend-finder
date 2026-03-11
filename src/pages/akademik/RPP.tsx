import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { useKelas, useTahunAjaran, useSemester } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Eye, Printer } from "lucide-react";

const STATUS_MAP: Record<string, string> = { draft: "Draft", final: "Final", disetujui: "Disetujui" };

export default function RPP() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [viewRpp, setViewRpp] = useState<any>(null);
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");

  // Form state
  const [form, setForm] = useState({ judul: "", mapel_id: "", kelas_id: "", kompetensi_inti: "", kompetensi_dasar: "", tujuan: "", materi: "", metode: "", langkah_kegiatan: "", penilaian: "", sumber_belajar: "", alokasi_waktu: "", pertemuan_ke: "1", status: "draft" });

  const { data: kelasList } = useKelas();
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);
  const { data: mapelList } = useQuery({
    queryKey: ["mapel_rpp"],
    queryFn: async () => { const { data } = await supabase.from("mata_pelajaran").select("id, nama").eq("aktif", true).order("nama"); return data || []; },
  });

  const { data: rppData, isLoading } = useQuery({
    queryKey: ["rpp_list", taId, semId],
    queryFn: async () => {
      let q = supabase.from("rpp").select("*, mapel:mapel_id(nama), kelas:kelas_id(nama), guru:pegawai_id(nama)").order("created_at", { ascending: false });
      if (taId) q = q.eq("tahun_ajaran_id", taId);
      if (semId) q = q.eq("semester_id", semId);
      const { data } = await q;
      return (data || []).map((r: any) => ({ ...r, mapel_nama: r.mapel?.nama || "-", kelas_nama: r.kelas?.nama || "-", guru_nama: r.guru?.nama || "-" }));
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rpp").insert({
        ...form, pertemuan_ke: Number(form.pertemuan_ke),
        tahun_ajaran_id: taId || null, semester_id: semId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rpp_list"] }); toast.success("RPP berhasil disimpan"); setShowForm(false); setForm({ judul: "", mapel_id: "", kelas_id: "", kompetensi_inti: "", kompetensi_dasar: "", tujuan: "", materi: "", metode: "", langkah_kegiatan: "", penilaian: "", sumber_belajar: "", alokasi_waktu: "", pertemuan_ke: "1", status: "draft" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const columns: DataTableColumn<any>[] = [
    { key: "judul", label: "Judul RPP", sortable: true },
    { key: "mapel_nama", label: "Mata Pelajaran", sortable: true },
    { key: "kelas_nama", label: "Kelas" },
    { key: "guru_nama", label: "Guru" },
    { key: "pertemuan_ke", label: "Pertemuan", render: (v) => `Ke-${String(v)}` },
    { key: "alokasi_waktu", label: "Waktu" },
    { key: "status", label: "Status", render: (v) => <Badge variant={v === "disetujui" ? "default" : v === "final" ? "secondary" : "outline"}>{STATUS_MAP[v as string] || String(v)}</Badge> },
    { key: "id", label: "Aksi", render: (_, row) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewRpp(row); }}><Eye className="h-4 w-4" /></Button> },
  ];

  const esc = (s: string | null | undefined) => {
    if (!s) return "-";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  const printRpp = (rpp: any) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>RPP - ${esc(rpp.judul)}</title><style>body{font-family:serif;margin:30px 50px;font-size:12pt}h1{font-size:16pt;text-align:center}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #000;padding:8px;text-align:left;vertical-align:top}th{width:200px;background:#f0f0f0}@media print{body{margin:0}}</style></head><body>
      <h1>RENCANA PELAKSANAAN PEMBELAJARAN</h1>
      <table>
        <tr><th>Mata Pelajaran</th><td>${esc(rpp.mapel_nama)}</td></tr>
        <tr><th>Kelas</th><td>${esc(rpp.kelas_nama)}</td></tr>
        <tr><th>Pertemuan ke-</th><td>${esc(String(rpp.pertemuan_ke))}</td></tr>
        <tr><th>Alokasi Waktu</th><td>${esc(rpp.alokasi_waktu)}</td></tr>
        <tr><th>Kompetensi Inti</th><td>${esc(rpp.kompetensi_inti)}</td></tr>
        <tr><th>Kompetensi Dasar</th><td>${esc(rpp.kompetensi_dasar)}</td></tr>
        <tr><th>Tujuan Pembelajaran</th><td>${esc(rpp.tujuan)}</td></tr>
        <tr><th>Materi</th><td>${esc(rpp.materi)}</td></tr>
        <tr><th>Metode</th><td>${esc(rpp.metode)}</td></tr>
        <tr><th>Langkah Kegiatan</th><td>${esc(rpp.langkah_kegiatan)}</td></tr>
        <tr><th>Penilaian</th><td>${esc(rpp.penilaian)}</td></tr>
        <tr><th>Sumber Belajar</th><td>${esc(rpp.sumber_belajar)}</td></tr>
      </table></body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-foreground">RPP</h1>
          <p className="text-sm text-muted-foreground">Rencana Pelaksanaan Pembelajaran</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-2" />Buat RPP</Button>
      </div>

      <div className="flex gap-3 items-end">
        <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Semua" /></SelectTrigger><SelectContent><SelectItem value="__all__">Semua</SelectItem>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Semua" /></SelectTrigger><SelectContent><SelectItem value="__all__">Semua</SelectItem>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
      </div>

      <DataTable columns={columns} data={rppData || []} loading={isLoading} searchable exportable exportFilename="rpp" />

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Buat RPP Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Judul</Label><Input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mata Pelajaran</Label><Select value={form.mapel_id} onValueChange={(v) => setForm({ ...form, mapel_id: v })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{mapelList?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nama}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Kelas</Label><Select value={form.kelas_id} onValueChange={(v) => setForm({ ...form, kelas_id: v })}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{kelasList?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Pertemuan ke-</Label><Input type="number" min={1} value={form.pertemuan_ke} onChange={(e) => setForm({ ...form, pertemuan_ke: e.target.value })} /></div>
              <div><Label>Alokasi Waktu</Label><Input value={form.alokasi_waktu} onChange={(e) => setForm({ ...form, alokasi_waktu: e.target.value })} placeholder="2 x 45 menit" /></div>
              <div><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="final">Final</SelectItem><SelectItem value="disetujui">Disetujui</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Kompetensi Inti</Label><Textarea rows={2} value={form.kompetensi_inti} onChange={(e) => setForm({ ...form, kompetensi_inti: e.target.value })} /></div>
            <div><Label>Kompetensi Dasar</Label><Textarea rows={2} value={form.kompetensi_dasar} onChange={(e) => setForm({ ...form, kompetensi_dasar: e.target.value })} /></div>
            <div><Label>Tujuan Pembelajaran</Label><Textarea rows={2} value={form.tujuan} onChange={(e) => setForm({ ...form, tujuan: e.target.value })} /></div>
            <div><Label>Materi</Label><Textarea rows={2} value={form.materi} onChange={(e) => setForm({ ...form, materi: e.target.value })} /></div>
            <div><Label>Metode</Label><Input value={form.metode} onChange={(e) => setForm({ ...form, metode: e.target.value })} placeholder="Ceramah, Diskusi, Tanya Jawab" /></div>
            <div><Label>Langkah Kegiatan</Label><Textarea rows={3} value={form.langkah_kegiatan} onChange={(e) => setForm({ ...form, langkah_kegiatan: e.target.value })} /></div>
            <div><Label>Penilaian</Label><Textarea rows={2} value={form.penilaian} onChange={(e) => setForm({ ...form, penilaian: e.target.value })} /></div>
            <div><Label>Sumber Belajar</Label><Textarea rows={2} value={form.sumber_belajar} onChange={(e) => setForm({ ...form, sumber_belajar: e.target.value })} /></div>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.judul} className="w-full">{saveMut.isPending ? "Menyimpan..." : "Simpan RPP"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewRpp} onOpenChange={(o) => !o && setViewRpp(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewRpp?.judul}</DialogTitle></DialogHeader>
          {viewRpp && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-2">
                <Badge>{viewRpp.mapel_nama}</Badge><Badge variant="outline">{viewRpp.kelas_nama}</Badge>
                <Badge variant="secondary">Pertemuan ke-{viewRpp.pertemuan_ke}</Badge>
              </div>
              {[
                ["Kompetensi Inti", viewRpp.kompetensi_inti],
                ["Kompetensi Dasar", viewRpp.kompetensi_dasar],
                ["Tujuan", viewRpp.tujuan],
                ["Materi", viewRpp.materi],
                ["Metode", viewRpp.metode],
                ["Langkah Kegiatan", viewRpp.langkah_kegiatan],
                ["Penilaian", viewRpp.penilaian],
                ["Sumber Belajar", viewRpp.sumber_belajar],
              ].map(([label, val]) => val ? (
                <div key={label as string}><Label className="text-muted-foreground">{label}</Label><p className="whitespace-pre-wrap">{val}</p></div>
              ) : null)}
              <Button variant="outline" onClick={() => printRpp(viewRpp)}><Printer className="h-4 w-4 mr-2" />Cetak RPP</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
