import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useDepartemen, useKelas, useTahunAjaran, useSemester } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertTriangle, Sparkles, Pencil } from "lucide-react";

export default function RemedialPengayaan() {
  const qc = useQueryClient();
  const [taId, setTaId] = useState("");
  const [semId, setSemId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [mapelId, setMapelId] = useState("");
  const [show, setShow] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: depts } = useDepartemen();
  const { data: taList } = useTahunAjaran();
  const { data: semList } = useSemester(taId || undefined);
  const { data: kelasList } = useKelas();
  const filteredKelas = deptId ? kelasList?.filter((k: any) => k.departemen?.id === deptId) : kelasList;

  const { data: mapelList } = useQuery({
    queryKey: ["mapel_remedial", deptId],
    enabled: !!deptId,
    queryFn: async () => {
      const { data } = await supabase.from("mata_pelajaran").select("id, nama").eq("aktif", true).eq("departemen_id", deptId).order("nama");
      return data || [];
    },
  });

  const { data: kkmVal } = useQuery({
    queryKey: ["kkm_remedial", mapelId, kelasId, taId, semId],
    enabled: !!mapelId && !!kelasId && !!taId && !!semId,
    queryFn: async () => {
      const { data } = await supabase.from("kkm").select("nilai_kkm").eq("mapel_id", mapelId).eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId).maybeSingle();
      return data?.nilai_kkm || 70;
    },
  });

  const { data: kdList } = useQuery({
    queryKey: ["kd_remedial", mapelId, semId],
    enabled: !!mapelId,
    queryFn: async () => {
      let q = supabase.from("kompetensi_dasar").select("id, kode_kd, deskripsi").eq("mapel_id", mapelId).eq("aktif", true).order("urutan");
      if (semId) q = q.eq("semester_id", semId);
      const { data } = await q;
      return data || [];
    },
  });

  // Get students with grades below KKM
  const { data: belowKKM, isLoading } = useQuery({
    queryKey: ["siswa_below_kkm", kelasId, mapelId, taId, semId, kkmVal],
    enabled: show && !!kelasId && !!mapelId && !!taId && !!semId,
    queryFn: async () => {
      const kkm = kkmVal || 70;
      const { data: ksList } = await supabase.from("kelas_siswa").select("siswa:siswa_id(id, nis, nama)").eq("kelas_id", kelasId).eq("aktif", true);
      const siswaList = (ksList || []).map((ks: any) => ks.siswa).filter(Boolean).sort((a: any, b: any) => a.nama.localeCompare(b.nama));
      const kdIds = (kdList || []).map((kd: any) => kd.id);
      if (!kdIds.length) return [];

      const { data: nilaiData } = await supabase.from("nilai_kd").select("siswa_id, kd_id, nilai").eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId).in("kd_id", kdIds);

      const { data: remedialData } = await supabase.from("remedial").select("*").eq("kelas_id", kelasId).eq("tahun_ajaran_id", taId).eq("semester_id", semId).in("kd_id", kdIds);

      const remedialMap: Record<string, any> = {};
      (remedialData || []).forEach((r: any) => { remedialMap[`${r.siswa_id}_${r.kd_id}`] = r; });

      const results: any[] = [];
      siswaList.forEach((s: any) => {
        kdIds.forEach((kdId: string) => {
          const nilai = (nilaiData || []).find((n: any) => n.siswa_id === s.id && n.kd_id === kdId);
          const val = nilai?.nilai || 0;
          if (val > 0 && val < kkm) {
            const kd = (kdList || []).find((k: any) => k.id === kdId);
            const rem = remedialMap[`${s.id}_${kdId}`];
            results.push({ siswa: s, kd, nilai_awal: val, remedial: rem, jenis: "remedial" });
          } else if (val >= kkm + 15) {
            const kd = (kdList || []).find((k: any) => k.id === kdId);
            const rem = remedialMap[`${s.id}_${kdId}`];
            results.push({ siswa: s, kd, nilai_awal: val, remedial: rem, jenis: "pengayaan" });
          }
        });
      });
      return results;
    },
  });

  const kkm = kkmVal || 70;
  const remedialList = belowKKM?.filter((b: any) => b.jenis === "remedial") || [];
  const pengayaanList = belowKKM?.filter((b: any) => b.jenis === "pengayaan") || [];

  const saveMut = useMutation({
    mutationFn: async (vals: any) => {
      if (editItem?.remedial?.id) {
        const { error } = await supabase.from("remedial").update({ nilai_remedial: vals.nilai_remedial, keterangan: vals.keterangan, status: vals.status }).eq("id", editItem.remedial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("remedial").insert({
          siswa_id: editItem.siswa.id, kd_id: editItem.kd.id, kelas_id: kelasId,
          tahun_ajaran_id: taId, semester_id: semId, nilai_awal: editItem.nilai_awal,
          jenis: editItem.jenis, ...vals,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["siswa_below_kkm"] }); toast.success("Data remedial disimpan"); setDialogOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const [formNilai, setFormNilai] = useState("");
  const [formKet, setFormKet] = useState("");
  const [formStatus, setFormStatus] = useState("belum");

  const openEdit = (item: any) => {
    setEditItem(item);
    setFormNilai(item.remedial?.nilai_remedial?.toString() || "");
    setFormKet(item.remedial?.keterangan || "");
    setFormStatus(item.remedial?.status || "belum");
    setDialogOpen(true);
  };

  const renderTable = (items: any[], jenis: string) => (
    <Card><CardContent className="pt-6 overflow-x-auto">
      <div className="flex items-center gap-2 mb-4">
        {jenis === "remedial" ? <AlertTriangle className="h-5 w-5 text-destructive" /> : <Sparkles className="h-5 w-5 text-amber-500" />}
        <h3 className="font-semibold">{jenis === "remedial" ? `Remedial (Nilai < ${kkm})` : `Pengayaan (Nilai ≥ ${kkm + 15})`}</h3>
        <Badge variant="secondary">{items.length} siswa</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Tidak ada data</p>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10">No</TableHead>
            <TableHead>Nama Siswa</TableHead>
            <TableHead>KD</TableHead>
            <TableHead className="text-center">Nilai Awal</TableHead>
            <TableHead className="text-center">Nilai {jenis === "remedial" ? "Remedial" : "Pengayaan"}</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead>Aksi</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((item: any, i: number) => (
              <TableRow key={`${item.siswa.id}_${item.kd.id}`}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium text-sm">{item.siswa.nama}</TableCell>
                <TableCell className="text-sm">{item.kd.kode_kd}</TableCell>
                <TableCell className={cn("text-center font-bold", item.nilai_awal < kkm ? "text-destructive" : "text-emerald-600")}>{item.nilai_awal}</TableCell>
                <TableCell className="text-center font-bold">{item.remedial?.nilai_remedial || "-"}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={item.remedial?.status === "selesai" ? "default" : "secondary"}>
                    {item.remedial?.status === "selesai" ? "Selesai" : "Belum"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );

  return (
    <div className="space-y-4 pt-4">
      <Card><CardContent className="pt-6">
        <div className="flex gap-3 items-end flex-wrap">
          <div><Label>Tahun Ajaran</Label><Select value={taId} onValueChange={setTaId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{taList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Semester</Label><Select value={semId} onValueChange={setSemId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{semList?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Lembaga</Label><Select value={deptId} onValueChange={(v) => { setDeptId(v); setKelasId(""); setMapelId(""); }}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{depts?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.kode || d.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Kelas</Label><Select value={kelasId} onValueChange={setKelasId}><SelectTrigger className="w-36"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{filteredKelas?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Mata Pelajaran</Label><Select value={mapelId} onValueChange={setMapelId}><SelectTrigger className="w-44"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{mapelList?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nama}</SelectItem>)}</SelectContent></Select></div>
          <Button onClick={() => setShow(true)} disabled={!kelasId || !mapelId || !taId || !semId}>Tampilkan</Button>
        </div>
      </CardContent></Card>

      {show && (
        <>
          <p className="text-sm text-muted-foreground">KKM: <strong>{kkm}</strong></p>
          {isLoading ? <Skeleton className="h-64" /> : (
            <div className="space-y-4">
              {renderTable(remedialList, "remedial")}
              {renderTable(pengayaanList, "pengayaan")}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Input Nilai {editItem?.jenis === "remedial" ? "Remedial" : "Pengayaan"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm"><strong>{editItem?.siswa?.nama}</strong> — KD: {editItem?.kd?.kode_kd}</div>
            <div className="text-sm">Nilai Awal: <strong className="text-destructive">{editItem?.nilai_awal}</strong></div>
            <div><Label>Nilai {editItem?.jenis === "remedial" ? "Remedial" : "Pengayaan"}</Label><Input type="number" min={0} max={100} value={formNilai} onChange={(e) => setFormNilai(e.target.value)} /></div>
            <div><Label>Keterangan</Label><Textarea value={formKet} onChange={(e) => setFormKet(e.target.value)} rows={2} /></div>
            <div><Label>Status</Label><Select value={formStatus} onValueChange={setFormStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="belum">Belum</SelectItem><SelectItem value="selesai">Selesai</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={() => saveMut.mutate({ nilai_remedial: formNilai ? Number(formNilai) : null, keterangan: formKet, status: formStatus })} disabled={saveMut.isPending}>{saveMut.isPending ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
