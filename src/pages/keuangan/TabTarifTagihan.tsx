import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Info, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatRupiah, useAllJenisPembayaran, useTahunAjaran, useLembaga, namaBulan } from "@/hooks/useKeuangan";
import { useAllTarifTagihan, useCreateTarifTagihan, useUpdateTarifTagihan, useDeleteTarifTagihan } from "@/hooks/useTarifTagihan";
import { useTagihanList, useGenerateTagihan } from "@/hooks/useTagihan";
import { useKelas } from "@/hooks/useAkademikData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

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
  const { data: lembagaList } = useLembaga();

  const createMut = useCreateTarifTagihan();
  const updateMut = useUpdateTarifTagihan();
  const deleteMut = useDeleteTarifTagihan();
  const generateMut = useGenerateTagihan();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form fields
  const [jenisId, setJenisId] = useState("");
  const [siswaId, setSiswaId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [kelasId, setKelasId] = useState("");
  const [tahunAjaranId, setTahunAjaranId] = useState("");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [siswaSearch, setSiswaSearch] = useState("");
  const { data: siswaResults } = useSiswaSearch(siswaSearch);

  // Filter kelas by selected lembaga
  const filteredKelasList = useMemo(() => {
    if (!kelasList) return [];
    if (!deptId) return kelasList;
    return kelasList.filter((k: any) => k.departemen_id === deptId);
  }, [kelasList, deptId]);

  // Auto-generate options
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [genBulanList, setGenBulanList] = useState<number[]>([]);
  const [genDeptId, setGenDeptId] = useState("");

  // Filter tarif
  const [filterJenis, setFilterJenis] = useState("");

  // Tagihan list filters
  const [filterTahunId, setFilterTahunId] = useState("");
  const [filterJenisId, setFilterJenisId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const { data: tagihanData, isLoading: loadingTagihan } = useTagihanList({
    tahun_ajaran_id: filterTahunId || undefined,
    jenis_id: filterJenisId || undefined,
    status: filterStatus || undefined,
  });

  const filteredData = useMemo(() => {
    if (!tarifList) return [];
    if (!filterJenis) return tarifList;
    return tarifList.filter((t: any) => t.jenis_id === filterJenis);
  }, [tarifList, filterJenis]);

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);
  const isSekali = selectedJenis?.tipe === "sekali";
  const allMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  const allSelected = genBulanList.length === 12;

  const toggleBulan = (b: number) => {
    setGenBulanList((prev) => prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b].sort((a, c) => a - c));
  };

  const openAdd = () => {
    setEditItem(null); setJenisId(""); setSiswaId(""); setDeptId(""); setKelasId(""); setTahunAjaranId(""); setNominal(""); setKeterangan(""); setSiswaSearch("");
    setAutoGenerate(true); setGenBulanList([]); setGenDeptId("");
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item); setJenisId(item.jenis_id); setSiswaId(item.siswa_id || ""); setDeptId(item.kelas?.departemen_id || ""); setKelasId(item.kelas_id || ""); setTahunAjaranId(item.tahun_ajaran_id || "");
    setNominal(String(item.nominal || "")); setKeterangan(item.keterangan || ""); setSiswaSearch(item.siswa ? `${item.siswa.nama} (${item.siswa.nis || '-'})` : "");
    setAutoGenerate(false); setGenBulanList([]); setGenDeptId("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editItem) {
        await updateMut.mutateAsync({ id: editItem.id, nominal: Number(nominal), keterangan: keterangan || undefined });
      } else {
        await createMut.mutateAsync({ jenis_id: jenisId, siswa_id: siswaId || null, kelas_id: kelasId || null, tahun_ajaran_id: tahunAjaranId || null, nominal: Number(nominal), keterangan: keterangan || undefined });

        // Auto-generate tagihan if checked
        if (autoGenerate && tahunAjaranId && jenisId) {
          try {
            const params: any = {
              tahun_ajaran_id: tahunAjaranId,
              jenis_id: jenisId,
            };
            if (siswaId) params.siswa_id = siswaId;
            if (kelasId) params.kelas_id = kelasId;
            const effectiveDeptId = genDeptId || deptId;
            if (effectiveDeptId) params.departemen_id = effectiveDeptId;
            if (!isSekali && genBulanList.length > 0) {
              params.bulan_list = genBulanList;
            }
            await generateMut.mutateAsync(params);
          } catch (genErr: any) {
            toast.error(`Tarif tersimpan, tapi generate tagihan gagal: ${genErr.message}`);
          }
        }
      }
      setDialogOpen(false);
    } catch {
      // mutation error already handled by toast in hooks
    }
  };

  const canSave = !!jenisId && !!nominal;
  const canGenerate = autoGenerate && !!tahunAjaranId && (isSekali || genBulanList.length > 0);
  const isSaving = createMut.isPending || updateMut.isPending || generateMut.isPending;

  const getLevelBadge = (row: any) => {
    const parts: string[] = [];
    if (row.siswa_id) parts.push("Siswa");
    if (row.kelas_id) parts.push("Kelas");
    if (row.tahun_ajaran_id) parts.push("Tahun");
    if (parts.length === 0) return <Badge variant="outline">Umum</Badge>;
    return <Badge variant="secondary">{parts.join(" + ")}</Badge>;
  };

  const tarifColumns: DataTableColumn<any>[] = [
    { key: "jenis", label: "Jenis Pembayaran", render: (_, r) => (r as any).jenis?.nama || "-", sortable: true },
    { key: "level", label: "Level Override", render: (_, r) => getLevelBadge(r) },
    { key: "siswa", label: "Siswa", render: (_, r) => { const s = (r as any).siswa; return s ? <span>{s.nama} <span className="text-muted-foreground text-xs">({s.nis || '-'})</span></span> : <span className="text-muted-foreground">—</span>; } },
    { key: "kelas", label: "Kelas", render: (_, r) => (r as any).kelas?.nama || <span className="text-muted-foreground">—</span> },
    { key: "tahun_ajaran", label: "Tahun Ajaran", render: (_, r) => (r as any).tahun_ajaran?.nama || <span className="text-muted-foreground">—</span> },
    { key: "nominal_default", label: "Nominal Default", render: (_, r) => { const def = (r as any).jenis?.nominal; return def ? <span className="text-muted-foreground">{formatRupiah(Number(def))}</span> : "-"; } },
    { key: "nominal", label: "Nominal Override", render: (v) => <span className="font-semibold text-primary">{formatRupiah(Number(v))}</span> },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
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

  const tagihanColumns: DataTableColumn<any>[] = [
    { key: "siswa", label: "Siswa", render: (_, r) => { const s = (r as any).siswa; return s ? <span>{s.nama} <span className="text-muted-foreground text-xs">({s.nis || '-'})</span></span> : "-"; }, sortable: true },
    { key: "jenis", label: "Jenis", render: (_, r) => (r as any).jenis?.nama || "-" },
    { key: "kelas", label: "Kelas", render: (_, r) => (r as any).kelas?.nama || "-" },
    { key: "tahun_ajaran", label: "Tahun Ajaran", render: (_, r) => (r as any).tahun_ajaran?.nama || "-" },
    { key: "bulan", label: "Bulan", render: (v) => v ? namaBulan(v as number) : <Badge variant="outline">Sekali</Badge> },
    { key: "nominal", label: "Nominal", render: (v) => <span className="font-semibold">{formatRupiah(Number(v))}</span> },
    {
      key: "status", label: "Status",
      render: (v) => v === "lunas"
        ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Lunas</Badge>
        : <Badge variant="destructive">Belum Bayar</Badge>,
    },
  ];

  return (
    <>
      {/* ─── Pengaturan Tarif ─── */}
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
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DataTable columns={tarifColumns} data={filteredData} loading={isLoading} pageSize={20} actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Tambah Tarif</Button>} />
        </CardContent>
      </Card>

      {/* ─── Daftar Tagihan ─── */}
      <Card className="mt-4">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Daftar Tagihan</h3>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Tagihan & <strong>jurnal piutang otomatis</strong> (Debit Piutang | Credit Pendapatan) dibuat saat menyimpan tarif baru dengan opsi generate dicentang.
              Saat pembayaran diterima, jurnal akan otomatis menjadi Debit Kas | Credit Piutang.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-48">
              <Label className="text-xs">Tahun Ajaran</Label>
              <Select value={filterTahunId || "__all__"} onValueChange={(v) => setFilterTahunId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Label className="text-xs">Jenis Pembayaran</Label>
              <Select value={filterJenisId || "__all__"} onValueChange={(v) => setFilterJenisId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus || "__all__"} onValueChange={(v) => setFilterStatus(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  <SelectItem value="belum_bayar">Belum Bayar</SelectItem>
                  <SelectItem value="lunas">Lunas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DataTable columns={tagihanColumns} data={tagihanData || []} loading={loadingTagihan} pageSize={20} />
        </CardContent>
      </Card>

      {/* ─── Dialog Tambah/Edit Tarif ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Tambah"} Tarif Tagihan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Jenis Pembayaran *</Label>
              <Select value={jenisId} onValueChange={(v) => { setJenisId(v); setGenBulanList([]); }} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis pembayaran..." /></SelectTrigger>
                <SelectContent>{jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama} {j.nominal ? `(Default: ${formatRupiah(Number(j.nominal))})` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Siswa (opsional)</Label>
              <div className="relative">
                <Input value={siswaSearch} onChange={(e) => { setSiswaSearch(e.target.value); if (!e.target.value) setSiswaId(""); }} placeholder="Ketik nama atau NIS siswa..." disabled={!!editItem} />
                {siswaSearch.length >= 2 && siswaResults && siswaResults.length > 0 && !siswaId && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                    {siswaResults.map((s: any) => (
                      <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm" onClick={() => { setSiswaId(s.id); setSiswaSearch(`${s.nama} (${s.nis || '-'})`); }}>
                        {s.nama} <span className="text-muted-foreground">({s.nis || '-'})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {siswaId && <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => { setSiswaId(""); setSiswaSearch(""); }}>Hapus pilihan siswa</Button>}
            </div>
            <div>
              <Label>Lembaga (opsional — pilih sebelum kelas)</Label>
              <Select value={deptId || "__none__"} onValueChange={(v) => { setDeptId(v === "__none__" ? "" : v); setKelasId(""); }} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Semua lembaga" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Semua Lembaga —</SelectItem>
                  {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kelas (opsional)</Label>
              <Select value={kelasId || "__none__"} onValueChange={(v) => setKelasId(v === "__none__" ? "" : v)} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Semua kelas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Semua Kelas —</SelectItem>
                  {filteredKelasList.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tahun Ajaran {autoGenerate && !editItem ? "*" : "(opsional)"}</Label>
              <Select value={tahunAjaranId || "__none__"} onValueChange={(v) => setTahunAjaranId(v === "__none__" ? "" : v)} disabled={!!editItem}>
                <SelectTrigger><SelectValue placeholder="Semua tahun ajaran" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Semua Tahun Ajaran —</SelectItem>
                  {tahunList?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nominal Override (Rp) *</Label>
              <Input type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground mt-1">Nominal ini akan menggantikan nominal default</p>
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Misal: Beasiswa prestasi, potongan 50%" />
            </div>

            {/* Auto-generate section - only for new tarif */}
            {!editItem && (
              <>
                <Separator />
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={autoGenerate}
                      onCheckedChange={(v) => setAutoGenerate(!!v)}
                    />
                    <span className="text-sm font-medium">Generate tagihan & jurnal piutang otomatis</span>
                  </label>

                  {autoGenerate && (
                    <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                      <Alert className="py-2">
                        <Info className="h-3 w-3" />
                        <AlertDescription className="text-xs">
                          Akan membuat tagihan + jurnal piutang untuk{" "}
                          {siswaId
                            ? <strong>siswa {siswaSearch.split(" (")[0]}</strong>
                            : kelasId
                              ? <strong>siswa di kelas {filteredKelasList.find((k: any) => k.id === kelasId)?.nama}</strong>
                              : (deptId || genDeptId)
                                ? <strong>siswa di lembaga {lembagaList?.find((l: any) => l.id === (deptId || genDeptId))?.kode}</strong>
                                : <strong>semua siswa aktif di tahun ajaran terpilih</strong>
                          }. Siswa yang sudah punya tagihan akan di-skip.
                        </AlertDescription>
                      </Alert>

                      {!tahunAjaranId && (
                        <p className="text-xs text-destructive">⚠ Pilih Tahun Ajaran di atas untuk mengaktifkan generate.</p>
                      )}

                      {jenisId && isSekali && (
                        <p className="text-xs text-muted-foreground">
                          Tipe <Badge variant="outline" className="text-xs">1x Bayar</Badge> — tagihan di-generate tanpa bulan
                        </p>
                      )}

                      {jenisId && !isSekali && (
                        <div>
                          <Label className="text-xs">Bulan *</Label>
                          <div className="flex items-center gap-2 mb-2 mt-1">
                            <Checkbox
                              id="select-all-months"
                              checked={allSelected}
                              onCheckedChange={(checked) => setGenBulanList(checked ? [...allMonths] : [])}
                            />
                            <label htmlFor="select-all-months" className="text-sm cursor-pointer">Pilih semua (12 bulan)</label>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {allMonths.map((b) => (
                              <label key={b} className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <Checkbox
                                  checked={genBulanList.includes(b)}
                                  onCheckedChange={() => toggleBulan(b)}
                                />
                                {namaBulan(b)}
                              </label>
                            ))}
                          </div>
                          {genBulanList.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {genBulanList.length} bulan dipilih
                            </p>
                          )}
                        </div>
                      )}

                      {!deptId && !siswaId && !kelasId && (
                        <div>
                          <Label className="text-xs">Lembaga (opsional — filter generate)</Label>
                          <Select value={genDeptId || "__all__"} onValueChange={(v) => setGenDeptId(v === "__all__" ? "" : v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">Semua Lembaga</SelectItem>
                              {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || (autoGenerate && !editItem && !canGenerate) || isSaving}
            >
              {isSaving ? "Memproses..." : editItem ? "Simpan" : autoGenerate && canGenerate ? "Simpan & Generate" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Tarif Tagihan" description="Yakin ingin menghapus tarif ini?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
    </>
  );
}
