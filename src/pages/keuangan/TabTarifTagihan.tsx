import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatRupiah, useAllJenisPembayaran, useTahunAjaran } from "@/hooks/useKeuangan";
import { useAllTarifTagihan, useCreateTarifTagihan, useUpdateTarifTagihan, useDeleteTarifTagihan } from "@/hooks/useTarifTagihan";
import { useKelas } from "@/hooks/useAkademikData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function useSiswaSearch(search: string) {
  return useQuery({
    queryKey: ["siswa_search", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("siswa")
        .select("id, nama, nis")
        .or(`nama.ilike.%${search}%,nis.ilike.%${search}%`)
        .eq("status", "aktif")
        .limit(20)
        .order("nama");
      if (error) throw error;
      return data || [];
    },
  });
}

export default function TabTarifTagihan() {
  const { data: tarifList, isLoading } = useAllTarifTagihan();
  const { data: jenisList } = useAllJenisPembayaran();
  const { data: kelasList } = useKelas();
  const { data: tahunList } = useTahunAjaran();

  const createMut = useCreateTarifTagihan();
  const updateMut = useUpdateTarifTagihan();
  const deleteMut = useDeleteTarifTagihan();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [jenisId, setJenisId] = useState("");
  const [siswaId, setSiswaId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [siswaSearch, setSiswaSearch] = useState("");
  const { data: siswaResults } = useSiswaSearch(siswaSearch);

  // Filter state
  const [filterJenis, setFilterJenis] = useState("");

  const filteredData = useMemo(() => {
    if (!tarifList) return [];
    if (!filterJenis) return tarifList;
    return tarifList.filter((t: any) => t.jenis_id === filterJenis);
  }, [tarifList, filterJenis]);

  const openAdd = () => {
    setEditItem(null);
    setJenisId("");
    setSiswaId("");
    setKelasId("");
    setTahunAjaranId("");
    setNominal("");
    setKeterangan("");
    setSiswaSearch("");
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setJenisId(item.jenis_id);
    setSiswaId(item.siswa_id || "");
    setKelasId(item.kelas_id || "");
    setTahunAjaranId(item.tahun_ajaran_id || "");
    setNominal(String(item.nominal || ""));
    setKeterangan(item.keterangan || "");
    setSiswaSearch(item.siswa ? `${item.siswa.nama} (${item.siswa.nis || '-'})` : "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editItem) {
      await updateMut.mutateAsync({
        id: editItem.id,
        nominal: Number(nominal),
        keterangan: keterangan || undefined,
      });
    } else {
      await createMut.mutateAsync({
        jenis_id: jenisId,
        siswa_id: siswaId || null,
        kelas_id: kelasId || null,
        tahun_ajaran_id: tahunAjaranId || null,
        nominal: Number(nominal),
        keterangan: keterangan || undefined,
      });
    }
    setDialogOpen(false);
  };

  const getLevelBadge = (row: any) => {
    const parts: string[] = [];
    if (row.siswa_id) parts.push("Siswa");
    if (row.kelas_id) parts.push("Kelas");
    if (row.tahun_ajaran_id) parts.push("Tahun");
    if (parts.length === 0) return <Badge variant="outline">Umum</Badge>;
    return <Badge variant="secondary">{parts.join(" + ")}</Badge>;
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "jenis", label: "Jenis Pembayaran",
      render: (_, r) => (r as any).jenis?.nama || "-",
      sortable: true,
    },
    {
      key: "level", label: "Level Override",
      render: (_, r) => getLevelBadge(r),
    },
    {
      key: "siswa", label: "Siswa",
      render: (_, r) => {
        const s = (r as any).siswa;
        return s ? <span>{s.nama} <span className="text-muted-foreground text-xs">({s.nis || '-'})</span></span> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: "kelas", label: "Kelas",
      render: (_, r) => (r as any).kelas?.nama || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "tahun_ajaran", label: "Tahun Ajaran",
      render: (_, r) => (r as any).tahun_ajaran?.nama || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "nominal_default", label: "Nominal Default",
      render: (_, r) => {
        const def = (r as any).jenis?.nominal;
        return def ? <span className="text-muted-foreground">{formatRupiah(Number(def))}</span> : "-";
      },
    },
    {
      key: "nominal", label: "Nominal Override",
      render: (v) => <span className="font-semibold text-primary">{formatRupiah(Number(v))}</span>,
    },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
    {
      key: "aksi", label: "Aksi",
      render: (_, r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId((r as any).id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card className="mt-4">
        <CardContent className="pt-6 space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Tarif tagihan memungkinkan pengaturan nominal berbeda per <strong>siswa</strong>, <strong>kelas</strong>, dan/atau <strong>tahun ajaran</strong>.
              Prioritas: Siswa+Kelas+Tahun → Siswa+Tahun → Siswa → Kelas+Tahun → Kelas → Tahun → Default.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2 items-end">
            <div className="w-64">
              <Label className="text-xs">Filter Jenis Pembayaran</Label>
              <Select value={filterJenis || "__all__"} onValueChange={(v) => setFilterJenis(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua jenis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Jenis</SelectItem>
                  {jenisList?.map((j: any) => (
                    <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredData}
            loading={isLoading}
            pageSize={20}
            actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Tarif</Button>}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit" : "Tambah"} Tarif Tagihan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Jenis Pembayaran *</Label>
              <Select value={jenisId} onValueChange={setJenisId} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis pembayaran..." /></SelectTrigger>
                <SelectContent>
                  {jenisList?.map((j: any) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.nama} {j.nominal ? `(Default: ${formatRupiah(Number(j.nominal))})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Siswa (opsional — kosongkan jika berlaku untuk semua siswa)</Label>
              <div className="relative">
                <Input
                  value={siswaSearch}
                  onChange={(e) => {
                    setSiswaSearch(e.target.value);
                    if (!e.target.value) setSiswaId("");
                  }}
                  placeholder="Ketik nama atau NIS siswa..."
                  disabled={!!editItem}
                />
                {siswaSearch.length >= 2 && siswaResults && siswaResults.length > 0 && !siswaId && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {siswaResults.map((s: any) => (
                      <button
                        key={s.id}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                        onClick={() => {
                          setSiswaId(s.id);
                          setSiswaSearch(`${s.nama} (${s.nis || '-'})`);
                        }}
                      >
                        {s.nama} <span className="text-muted-foreground">({s.nis || '-'})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {siswaId && (
                <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => { setSiswaId(""); setSiswaSearch(""); }}>
                  Hapus pilihan siswa
                </Button>
              )}
            </div>

            <div>
              <Label>Kelas (opsional — kosongkan jika berlaku untuk semua kelas)</Label>
              <Select value={kelasId || "__none__"} onValueChange={(v) => setKelasId(v === "__none__" ? "" : v)} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Semua kelas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Semua Kelas —</SelectItem>
                  {kelasList?.map((k: any) => (
                    <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tahun Ajaran (opsional — kosongkan jika berlaku untuk semua tahun)</Label>
              <Select value={tahunAjaranId || "__none__"} onValueChange={(v) => setTahunAjaranId(v === "__none__" ? "" : v)} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Semua tahun ajaran" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Semua Tahun Ajaran —</SelectItem>
                  {tahunList?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Nominal Override (Rp) *</Label>
              <Input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground mt-1">Nominal ini akan menggantikan nominal default dari jenis pembayaran</p>
            </div>

            <div>
              <Label>Keterangan</Label>
              <Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Misal: Beasiswa prestasi, potongan 50%" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!jenisId || !nominal}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Hapus Tarif Tagihan"
        description="Yakin ingin menghapus tarif ini? Tagihan akan kembali menggunakan nominal default."
        onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}
      />
    </>
  );
}
