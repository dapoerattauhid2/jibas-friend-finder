import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FilterToolbar, ActiveFilter } from "@/components/shared/FilterToolbar";
import { Badge } from "@/components/ui/badge";
import { useJurnalList, useJurnalDetail, useCreateJurnal, useUpdateJurnal, useDeleteJurnal, usePostJurnal, useAkunRekening, useKoreksiJurnal } from "@/hooks/useJurnal";
import { formatRupiah, BULAN_NAMES, BULAN_ORDER_AKADEMIK, namaBulan, useLembaga } from "@/hooks/useKeuangan";
import { StatsCard } from "@/components/shared/StatsCard";
import { Plus, Eye, Pencil, Trash2, Lock, Send, Search, BookOpen, CheckCircle, FileEdit, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface DetailRow {
  akun_id: string;
  keterangan: string;
  debit: number;
  kredit: number;
}

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

export default function JurnalUmum() {
  const [bulan, setBulan] = useState(currentMonth);
  const [tahun, setTahun] = useState(currentYear);
  const [departemenId, setDepartemenId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"semua" | "draft" | "posted">("semua");
  const [akunFilter, setAkunFilter] = useState("");
  const [tanggalDari, setTanggalDari] = useState("");
  const [tanggalSampai, setTanggalSampai] = useState("");
  const { data: lembagaList } = useLembaga();
  const { data: jurnalList, isLoading } = useJurnalList(bulan, tahun, departemenId || undefined);
  const { data: akunList } = useAkunRekening();
  const createMut = useCreateJurnal();
  const updateMut = useUpdateJurnal();
  const deleteMut = useDeleteJurnal();
  const postMut = usePostJurnal();

  const [formOpen, setFormOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);

  const [tanggal, setTanggal] = useState(format(new Date(), "yyyy-MM-dd"));
  const [keterangan, setKeterangan] = useState("");
  const [referensi, setReferensi] = useState("");
  const [formDepartemenId, setFormDepartemenId] = useState("");
  const [details, setDetails] = useState<DetailRow[]>([
    { akun_id: "", keterangan: "", debit: 0, kredit: 0 },
    { akun_id: "", keterangan: "", debit: 0, kredit: 0 },
  ]);

  const { data: viewData } = useJurnalDetail(viewId || editId || undefined);

  const totalDebit = details.reduce((s, d) => s + (d.debit || 0), 0);
  const totalKredit = details.reduce((s, d) => s + (d.kredit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalKredit) < 0.01 && totalDebit > 0;

  const openCreate = () => {
    setEditId(null);
    setTanggal(format(new Date(), "yyyy-MM-dd"));
    setKeterangan("");
    setReferensi("");
    setFormDepartemenId(departemenId || "");
    setDetails([
      { akun_id: "", keterangan: "", debit: 0, kredit: 0 },
      { akun_id: "", keterangan: "", debit: 0, kredit: 0 },
    ]);
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    setEditId(item.id);
    setTanggal(item.tanggal);
    setKeterangan(item.keterangan);
    setReferensi(item.referensi || "");
    setFormDepartemenId(item.departemen_id || "");
    setFormOpen(true);
  };

  useMemo(() => {
    if (editId && viewData?.details) {
      setDetails(
        viewData.details.map((d: any) => ({
          akun_id: d.akun_id,
          keterangan: d.keterangan || "",
          debit: Number(d.debit) || 0,
          kredit: Number(d.kredit) || 0,
        }))
      );
    }
  }, [editId, viewData]);

  const handleSave = async () => {
    const payload = {
      tanggal,
      keterangan,
      referensi: referensi || undefined,
      departemen_id: formDepartemenId || undefined,
      details: details.filter(d => d.akun_id).map((d, i) => ({ ...d, urutan: i + 1 })),
    };
    if (editId) {
      await updateMut.mutateAsync({ id: editId, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    setFormOpen(false);
  };

  const addRow = () => setDetails([...details, { akun_id: "", keterangan: "", debit: 0, kredit: 0 }]);
  const removeRow = (i: number) => { if (details.length > 2) setDetails(details.filter((_, idx) => idx !== i)); };
  const updateRow = (i: number, field: keyof DetailRow, value: any) => {
    const next = [...details];
    (next[i] as any)[field] = value;
    setDetails(next);
  };

  const lembagaNama = lembagaList?.find((l: any) => l.id === departemenId);

  // Query jurnal IDs that contain a specific akun (when akunFilter is set)
  const { data: jurnalIdsByAkun } = useQuery({
    queryKey: ["jurnal_by_akun", akunFilter],
    enabled: !!akunFilter,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jurnal_detail")
        .select("jurnal_id")
        .eq("akun_id", akunFilter);
      if (error) throw error;
      return new Set((data || []).map((r: any) => r.jurnal_id));
    },
  });

  const filteredJurnal = useMemo(() => {
    let list = (jurnalList as any[]) || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((j: any) =>
        j.nomor?.toLowerCase().includes(q) ||
        j.keterangan?.toLowerCase().includes(q) ||
        j.referensi?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "semua") {
      list = list.filter((j: any) => j.status === statusFilter);
    }
    if (tanggalDari) list = list.filter((j: any) => j.tanggal >= tanggalDari);
    if (tanggalSampai) list = list.filter((j: any) => j.tanggal <= tanggalSampai);
    if (akunFilter && jurnalIdsByAkun) {
      list = list.filter((j: any) => jurnalIdsByAkun.has(j.id));
    }
    return list;
  }, [jurnalList, searchQuery, statusFilter, tanggalDari, tanggalSampai, akunFilter, jurnalIdsByAkun]);

  const totalJurnal = filteredJurnal.length;
  const jurnalPosted = filteredJurnal.filter((j: any) => j.status === "posted").length;
  const jurnalDraft = filteredJurnal.filter((j: any) => j.status === "draft").length;

  const activeFilters: ActiveFilter[] = [
    ...(departemenId ? [{
      key: "lembaga", label: "Lembaga", value: lembagaNama?.kode || lembagaNama?.nama || "",
      onClear: () => setDepartemenId(""),
    }] : []),
    ...(statusFilter !== "semua" ? [{
      key: "status", label: "Status", value: statusFilter === "posted" ? "Posted" : "Draft",
      onClear: () => setStatusFilter("semua"),
    }] : []),
    ...(akunFilter ? [{
      key: "akun", label: "Akun",
      value: akunList?.find((a: any) => a.id === akunFilter)?.kode || "—",
      onClear: () => setAkunFilter(""),
    }] : []),
    ...(tanggalDari || tanggalSampai ? [{
      key: "rentang", label: "Rentang",
      value: `${tanggalDari || "…"} → ${tanggalSampai || "…"}`,
      onClear: () => { setTanggalDari(""); setTanggalSampai(""); },
    }] : []),
    {
      key: "periode", label: "Periode", value: `${BULAN_NAMES[bulan - 1]} ${tahun}`,
      onClear: () => { setBulan(currentMonth); setTahun(currentYear); },
    },
  ];

  const columns: DataTableColumn<any>[] = [
    { key: "nomor", label: "Nomor", sortable: true },
    {
      key: "tanggal", label: "Tanggal", sortable: true,
      render: (v) => v ? format(new Date(v as string), "d MMMM yyyy", { locale: idLocale }) : "-",
    },
    { key: "keterangan", label: "Keterangan" },
    { key: "departemen", label: "Lembaga", render: (_, r) => (r as any).departemen?.kode || "-" },
    { key: "total_debit", label: "Total Debit", render: (v) => formatRupiah(Number(v) || 0) },
    { key: "total_kredit", label: "Total Kredit", render: (v) => formatRupiah(Number(v) || 0) },
    {
      key: "status", label: "Status",
      render: (v) => (
        <Badge variant="outline" className={v === "posted" ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}>
          {v === "posted" ? "Posted" : "Draft"}
        </Badge>
      ),
    },
    {
      key: "aksi", label: "Aksi",
      render: (_, r: any) => (
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setViewId(r.id); setViewOpen(true); }}>
            <Eye className="h-4 w-4" />
          </Button>
          {r.status === "draft" ? (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => setPostId(r.id)}>
                <Send className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground ml-2 mt-2" />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-0 animate-fade-in">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Jurnal Umum</h1>
          <p className="text-xs text-muted-foreground">Catat transaksi keuangan dalam jurnal umum</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <StatsCard title="Total Jurnal" value={totalJurnal} icon={BookOpen} color="info" />
        <StatsCard title="Sudah Diposting" value={jurnalPosted} icon={CheckCircle} color="success" />
        <StatsCard title="Masih Draft" value={jurnalDraft} icon={FileEdit} color="warning" />
      </div>

      {/* Filter toolbar */}
      <div className="border-b border-border pb-3 mb-4">
        <FilterToolbar
          activeFilters={activeFilters}
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari nomor / keterangan / referensi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs w-72 pl-7"
                />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Buat Jurnal
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Lembaga</Label>
              <Select value={departemenId || "__all__"} onValueChange={(v) => setDepartemenId(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Semua lembaga" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Lembaga</SelectItem>
                  {lembagaList?.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Akun</Label>
              <Select value={akunFilter || "__all__"} onValueChange={(v) => setAkunFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Semua akun" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__all__">Semua Akun</SelectItem>
                  {akunList?.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.kode} — {a.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bulan</Label>
              <Select value={String(bulan)} onValueChange={v => setBulan(Number(v))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BULAN_ORDER_AKADEMIK.map((m) => <SelectItem key={m} value={String(m)}>{namaBulan(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tahun</Label>
              <Input type="number" className="h-8 text-xs" value={tahun} onChange={e => setTahun(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Dari Tanggal</Label>
              <Input type="date" className="h-8 text-xs" value={tanggalDari} onChange={(e) => setTanggalDari(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sampai Tanggal</Label>
              <Input type="date" className="h-8 text-xs" value={tanggalSampai} onChange={(e) => setTanggalSampai(e.target.value)} />
            </div>
          </div>
        </FilterToolbar>
      </div>

      {/* Table — no Card wrapper */}
      <DataTable
        columns={columns}
        data={filteredJurnal}
        loading={isLoading}
        pageSize={20}
        searchable={false}
        exportable
        exportFilename={`jurnal-${BULAN_NAMES[bulan - 1]}-${tahun}`}
      />

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editId ? (
                <>
                  Edit Jurnal
                  {viewData?.nomor && (
                    <Badge variant="outline" className="font-mono">{viewData.nomor}</Badge>
                  )}
                  <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Draft</Badge>
                </>
              ) : "Buat Jurnal Baru"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div><Label>Tanggal</Label><Input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} /></div>
              <div><Label>Keterangan *</Label><Input value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Keterangan jurnal" /></div>
              <div><Label>Referensi</Label><Input value={referensi} onChange={e => setReferensi(e.target.value)} placeholder="No. dokumen sumber" /></div>
              <div>
                <Label>Lembaga</Label>
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
            </div>

            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left w-10">No</th>
                    <th className="p-2 text-left min-w-[200px]">Akun</th>
                    <th className="p-2 text-left min-w-[150px]">Keterangan</th>
                    <th className="p-2 text-right w-36">Debit (Rp)</th>
                    <th className="p-2 text-right w-36">Kredit (Rp)</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{i + 1}</td>
                      <td className="p-2">
                        <Select value={row.akun_id} onValueChange={v => updateRow(i, "akun_id", v)}>
                          <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                          <SelectContent>
                            {akunList?.map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>{a.kode} - {a.nama}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2"><Input value={row.keterangan} onChange={e => updateRow(i, "keterangan", e.target.value)} placeholder="Ket. baris" /></td>
                      <td className="p-2"><Input type="number" className="text-right" value={row.debit || ""} onChange={e => updateRow(i, "debit", Number(e.target.value) || 0)} /></td>
                      <td className="p-2"><Input type="number" className="text-right" value={row.kredit || ""} onChange={e => updateRow(i, "kredit", Number(e.target.value) || 0)} /></td>
                      <td className="p-2">
                        {details.length > 2 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRow(i)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-semibold">
                  <tr>
                    <td colSpan={3} className="p-2 text-right">Total</td>
                    <td className="p-2 text-right">{formatRupiah(totalDebit)}</td>
                    <td className="p-2 text-right">{formatRupiah(totalKredit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {!isBalanced && totalDebit > 0 && (
              <p className="text-sm text-destructive font-medium">⚠ Total Debit dan Kredit harus sama (selisih: {formatRupiah(Math.abs(totalDebit - totalKredit))})</p>
            )}
            <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-2" />Tambah Baris</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={!isBalanced || !keterangan || !tanggal}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={v => { setViewOpen(v); if (!v) setViewId(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Detail Jurnal</DialogTitle></DialogHeader>
          {viewData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nomor:</span> <span className="font-medium">{viewData.nomor}</span></div>
                <div><span className="text-muted-foreground">Tanggal:</span> <span className="font-medium">{format(new Date(viewData.tanggal), "d MMMM yyyy", { locale: idLocale })}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={viewData.status === "posted" ? "bg-success/15 text-success border-success/30" : "bg-warning/15 text-warning border-warning/30"}>{viewData.status === "posted" ? "Posted" : "Draft"}</Badge></div>
                <div><span className="text-muted-foreground">Lembaga:</span> <span className="font-medium">{viewData.departemen?.kode || "-"}</span></div>
              </div>
              <div><span className="text-muted-foreground text-sm">Keterangan:</span> <p className="font-medium">{viewData.keterangan}</p></div>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left">Akun</th>
                      <th className="p-2 text-left">Keterangan</th>
                      <th className="p-2 text-right">Debit</th>
                      <th className="p-2 text-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewData.details?.map((d: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{d.akun_rekening?.kode} - {d.akun_rekening?.nama}</td>
                        <td className="p-2">{d.keterangan || "-"}</td>
                        <td className="p-2 text-right">{Number(d.debit) > 0 ? formatRupiah(Number(d.debit)) : "-"}</td>
                        <td className="p-2 text-right">{Number(d.kredit) > 0 ? formatRupiah(Number(d.kredit)) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 font-semibold">
                    <tr>
                      <td colSpan={2} className="p-2 text-right">Total</td>
                      <td className="p-2 text-right">{formatRupiah(Number(viewData.total_debit) || 0)}</td>
                      <td className="p-2 text-right">{formatRupiah(Number(viewData.total_kredit) || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {viewData.status === "draft" && (
                <Button onClick={() => { postMut.mutate(viewData.id); setViewOpen(false); setViewId(null); }}>
                  <Send className="h-4 w-4 mr-2" />Posting Jurnal
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Hapus Jurnal" description="Yakin ingin menghapus jurnal ini?" onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }} />
      <ConfirmDialog open={!!postId} onOpenChange={() => setPostId(null)} title="Posting Jurnal" description="Jurnal yang sudah diposting tidak bisa diedit lagi. Lanjutkan?" onConfirm={() => { if (postId) postMut.mutate(postId); setPostId(null); }} />
    </div>
  );
}
