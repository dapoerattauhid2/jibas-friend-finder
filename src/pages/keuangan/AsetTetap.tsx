import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useAsetTetapList, useCreateAsetTetap, useDeleteAsetTetap } from "@/hooks/useISAK35";
import { formatRupiah } from "@/hooks/useKeuangan";
import { Plus, Trash2 } from "lucide-react";

export default function AsetTetap() {
  const { data: asetList = [], isLoading } = useAsetTetapList();
  const createMut = useCreateAsetTetap();
  const deleteMut = useDeleteAsetTetap();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ jenis_aset: "", tanggal_perolehan: "", umur_ekonomis_bulan: 12, harga_perolehan: 0, keterangan: "" });

  const handleSubmit = () => {
    if (!form.jenis_aset || !form.tanggal_perolehan || form.harga_perolehan <= 0) return;
    createMut.mutate(form, { onSuccess: () => { setOpen(false); setForm({ jenis_aset: "", tanggal_perolehan: "", umur_ekonomis_bulan: 12, harga_perolehan: 0, keterangan: "" }); } });
  };

  const totals = asetList.reduce((t: any, a: any) => ({
    hp: t.hp + Number(a.harga_perolehan), beban: t.beban + a.bebanTahunIni, akum: t.akum + a.akumulasi, nb: t.nb + a.nilaiBuku
  }), { hp: 0, beban: 0, akum: 0, nb: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Daftar Aset Tetap & Penyusutan</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Tambah Aset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah Aset Tetap</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Jenis Aset</Label><Input value={form.jenis_aset} onChange={e => setForm(f => ({ ...f, jenis_aset: e.target.value }))} placeholder="Contoh: Gedung Sekolah" /></div>
              <div><Label>Tanggal Perolehan</Label><Input type="date" value={form.tanggal_perolehan} onChange={e => setForm(f => ({ ...f, tanggal_perolehan: e.target.value }))} /></div>
              <div><Label>Umur Ekonomis (bulan)</Label><Input type="number" min={1} value={form.umur_ekonomis_bulan} onChange={e => setForm(f => ({ ...f, umur_ekonomis_bulan: parseInt(e.target.value) || 1 }))} /></div>
              <div><Label>Harga Perolehan (Rp)</Label><Input type="number" min={0} value={form.harga_perolehan} onChange={e => setForm(f => ({ ...f, harga_perolehan: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Keterangan</Label><Input value={form.keterangan} onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))} placeholder="Opsional" /></div>
              <Button onClick={handleSubmit} disabled={createMut.isPending} className="w-full">{createMut.isPending ? "Menyimpan..." : "Simpan"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Data Aset Tetap</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Memuat...</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Jenis Aset</TableHead>
                    <TableHead>Tgl Perolehan</TableHead>
                    <TableHead className="text-right">Umur (bln)</TableHead>
                    <TableHead className="text-right">Harga Perolehan</TableHead>
                    <TableHead className="text-right">Beban Dep./Tahun</TableHead>
                    <TableHead className="text-right">Akm. Depresiasi</TableHead>
                    <TableHead className="text-right">Nilai Buku</TableHead>
                    <TableHead className="w-16">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asetList.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Belum ada data aset tetap</TableCell></TableRow>
                  ) : asetList.map((a: any, i: number) => (
                    <TableRow key={a.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{a.jenis_aset}</TableCell>
                      <TableCell>{new Date(a.tanggal_perolehan).toLocaleDateString("id-ID")}</TableCell>
                      <TableCell className="text-right">{a.umur_ekonomis_bulan}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Number(a.harga_perolehan))}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Math.round(a.bebanTahunIni))}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Math.round(a.akumulasi))}</TableCell>
                      <TableCell className={`text-right ${a.nilaiBuku < 0 ? "text-destructive" : ""}`}>{formatRupiah(Math.round(a.nilaiBuku))}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {asetList.length > 0 && (
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell colSpan={4}>Total</TableCell>
                      <TableCell className="text-right">{formatRupiah(Math.round(totals.hp))}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Math.round(totals.beban))}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Math.round(totals.akum))}</TableCell>
                      <TableCell className={`text-right ${totals.nb < 0 ? "text-destructive" : ""}`}>{formatRupiah(Math.round(totals.nb))}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Aset" description="Apakah Anda yakin ingin menghapus aset ini?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId, { onSuccess: () => setDeleteId(null) }); }} loading={deleteMut.isPending} />
    </div>
  );
}
