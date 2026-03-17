import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatsCard } from "@/components/shared/StatsCard";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useJenisPembayaran, useLembaga, formatRupiah, namaBulan } from "@/hooks/useKeuangan";
import { getTarifBatch } from "@/hooks/useTarifTagihan";
import { useKelas } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Users, X } from "lucide-react";
import { toast } from "sonner";

export default function TunggakanPembayaran() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [departemenId, setDepartemenId] = useState<string>("");
  const [kelasId, setKelasId] = useState<string>("");
  const [jenisId, setJenisId] = useState<string>("");
  const [bulanDari, setBulanDari] = useState("1");
  const [bulanSampai, setBulanSampai] = useState(String(new Date().getMonth() + 1));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [isBulkPaying, setIsBulkPaying] = useState(false);

  const { data: lembagaList } = useLembaga();
  const { data: jenisList } = useJenisPembayaran(departemenId || undefined);
  const { data: kelasList } = useKelas();

  const filteredKelas = useMemo(() => {
    if (!kelasList) return [];
    if (!departemenId) return kelasList;
    return kelasList.filter((k: any) => k.departemen_id === departemenId);
  }, [kelasList, departemenId]);

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);
  const isSekaliBayar = (selectedJenis as any)?.tipe === "sekali";

  const { data: tunggakanData, isLoading } = useQuery({
    queryKey: ["tunggakan", departemenId, kelasId, jenisId, bulanDari, bulanSampai],
    enabled: !!jenisId,
    queryFn: async () => {
      let siswaQuery = supabase
        .from("kelas_siswa")
        .select("siswa_id, kelas_id, siswa:siswa_id(id, nis, nama), kelas:kelas_id(nama, departemen_id)")
        .eq("aktif", true);
      if (kelasId) siswaQuery = siswaQuery.eq("kelas_id", kelasId);
      const { data: siswaList } = await siswaQuery;
      if (!siswaList?.length) return [];

      const filtered = departemenId
        ? siswaList.filter((s: any) => s.kelas?.departemen_id === departemenId)
        : siswaList;

      if (!filtered.length) return [];

      const siswaIds = filtered.map((s: any) => s.siswa_id);

      // Get per-student tarif
      const tarifMap = await getTarifBatch(jenisId, siswaIds, kelasId || undefined);
      const tipe = (selectedJenis as any)?.tipe || "bulanan";

      if (tipe === "sekali") {
        const { data: payments } = await supabase
          .from("pembayaran")
          .select("siswa_id, jumlah")
          .eq("jenis_id", jenisId)
          .in("siswa_id", siswaIds);

        const paidMap = new Map<string, number>();
        payments?.forEach((p) => {
          paidMap.set(p.siswa_id!, (paidMap.get(p.siswa_id!) || 0) + Number(p.jumlah || 0));
        });

        const result: any[] = [];
        filtered.forEach((ks: any) => {
          const nominal = tarifMap.get(ks.siswa_id) || 0;
          if (nominal === 0) return; // Skip students without configured tarif
          const paid = paidMap.get(ks.siswa_id) || 0;
          const sisa = nominal - paid;
          if (sisa > 0) {
            result.push({
              id: ks.siswa_id,
              nama: ks.siswa?.nama || "-",
              nis: ks.siswa?.nis || "-",
              kelas: ks.kelas?.nama || "-",
              nominal,
              bulan_tunggak: "Sekali Bayar",
              bulan_tunggak_arr: [0],
              jumlah_bulan: 1,
              total: sisa,
            });
          }
        });
        return result;
      } else {
        const { data: payments } = await supabase
          .from("pembayaran")
          .select("siswa_id, bulan")
          .eq("jenis_id", jenisId)
          .in("siswa_id", siswaIds)
          .gte("bulan", Number(bulanDari))
          .lte("bulan", Number(bulanSampai));

        const paidMap = new Map<string, Set<number>>();
        payments?.forEach((p) => {
          if (!paidMap.has(p.siswa_id!)) paidMap.set(p.siswa_id!, new Set());
          paidMap.get(p.siswa_id!)!.add(p.bulan!);
        });

        const result: any[] = [];
        filtered.forEach((ks: any) => {
          const nominal = tarifMap.get(ks.siswa_id) || 0;
          if (nominal === 0) return; // Skip students without configured tarif
          const paid = paidMap.get(ks.siswa_id) || new Set();
          const bulanTunggak: number[] = [];
          for (let b = Number(bulanDari); b <= Number(bulanSampai); b++) {
            if (!paid.has(b)) bulanTunggak.push(b);
          }
          if (bulanTunggak.length > 0) {
            result.push({
              id: ks.siswa_id,
              nama: ks.siswa?.nama || "-",
              nis: ks.siswa?.nis || "-",
              kelas: ks.kelas?.nama || "-",
              nominal,
              bulan_tunggak: bulanTunggak.map(namaBulan).join(", "),
              bulan_tunggak_arr: bulanTunggak,
              jumlah_bulan: bulanTunggak.length,
              total: bulanTunggak.length * nominal,
            });
          }
        });
        return result;
      }
    },
  });

  const totalSiswa = tunggakanData?.length || 0;
  const totalNominal = tunggakanData?.reduce((s, r) => s + r.total, 0) || 0;

  const selectedRows = tunggakanData?.filter((r) => selectedIds.has(r.id)) || [];
  const selectedTotal = selectedRows.reduce((s, r) => s + r.total, 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!tunggakanData) return;
    if (selectedIds.size === tunggakanData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tunggakanData.map((r) => r.id)));
    }
  };

  const handleBulkPay = async () => {
    if (!selectedRows.length || !jenisId) return;
    setIsBulkPaying(true);
    try {
      const today = new Date().toISOString().split("T")[0];

      const rows: any[] = [];
      selectedRows.forEach((sr) => {
        sr.bulan_tunggak_arr.forEach((b: number) => {
          rows.push({
            siswa_id: sr.id,
            jenis_id: jenisId,
            bulan: b,
            jumlah: sr.nominal, // Use per-student tarif
            tanggal_bayar: today,
            departemen_id: departemenId || undefined,
          });
        });
      });

      const { error } = await supabase.from("pembayaran").insert(rows);
      if (error) throw error;

      toast.success(`Pembayaran berhasil dicatat untuk ${selectedRows.length} siswa`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["tunggakan"] });
      queryClient.invalidateQueries({ queryKey: ["pembayaran"] });
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan pembayaran");
    } finally {
      setIsBulkPaying(false);
      setShowConfirm(false);
    }
  };

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      label: "",
      className: "w-10",
      render: (_, r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectedIds.has(r.id as string)}
            onCheckedChange={() => toggleSelect(r.id as string)}
          />
        </div>
      ),
    },
    { key: "nis", label: "NIS", sortable: true },
    { key: "nama", label: "Nama Siswa", sortable: true },
    { key: "kelas", label: "Kelas" },
    { key: "nominal", label: "Tarif", render: (v: unknown) => formatRupiah(Number(v)) },
    { key: "bulan_tunggak", label: isSekaliBayar ? "Tipe" : "Bulan Tunggak" },
    ...(!isSekaliBayar ? [{ key: "jumlah_bulan", label: "Jml Bulan" }] : []),
    { key: "total", label: "Total Tunggakan", render: (v: unknown) => formatRupiah(Number(v)) },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tunggakan Pembayaran</h1>
        <p className="text-sm text-muted-foreground">Laporan siswa yang belum membayar</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>Lembaga</Label>
              <Select value={departemenId || "__all__"} onValueChange={(v) => {
                setDepartemenId(v === "__all__" ? "" : v);
                setJenisId("");
                setKelasId("");
                setSelectedIds(new Set());
              }}>
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
              <Label>Jenis Pembayaran</Label>
              <Select value={jenisId} onValueChange={(v) => { setJenisId(v); setSelectedIds(new Set()); }}>
                <SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                <SelectContent>
                  {jenisList?.map((j: any) => <SelectItem key={j.id} value={j.id}>{j.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kelas</Label>
              <Select value={kelasId || "__all__"} onValueChange={(v) => setKelasId(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Semua kelas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua</SelectItem>
                  {filteredKelas?.map((k: any) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isSekaliBayar && (
              <>
                <div>
                  <Label>Bulan Dari</Label>
                  <Select value={bulanDari} onValueChange={setBulanDari}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{namaBulan(i + 1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bulan Sampai</Label>
                  <Select value={bulanSampai} onValueChange={setBulanSampai}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{namaBulan(i + 1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatsCard title="Total Siswa Menunggak" value={totalSiswa} icon={Users} color="warning" />
        <StatsCard title="Total Nominal Tunggakan" value={formatRupiah(totalNominal)} icon={AlertTriangle} color="destructive" />
      </div>

      <Card>
        <CardContent className="pt-6">
          {!jenisId ? (
            <p className="text-sm text-muted-foreground text-center py-8">Pilih jenis pembayaran untuk melihat tunggakan</p>
          ) : (
            <>
              {tunggakanData && tunggakanData.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Checkbox
                    checked={tunggakanData.length > 0 && selectedIds.size === tunggakanData.length}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-sm text-muted-foreground">Pilih Semua</span>
                </div>
              )}
              <DataTable
                columns={columns}
                data={tunggakanData || []}
                loading={isLoading}
                exportable
                exportFilename="tunggakan-pembayaran"
                pageSize={20}
                onRowClick={(row) => navigate(`/keuangan/pembayaran?siswa=${row.id}`)}
              />
            </>
          )}
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border shadow-xl rounded-xl px-6 py-3 flex items-center gap-4 animate-fade-in">
          <span className="text-sm font-medium">
            {selectedIds.size} siswa dipilih — Total: <span className="text-primary font-bold">{formatRupiah(selectedTotal)}</span>
          </span>
          <Button size="sm" onClick={() => setShowConfirm(true)}>
            Bayar Sekarang
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
            <X className="h-4 w-4 mr-1" />
            Batal
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Konfirmasi Pembayaran Massal"
        description={`Akan mencatat pembayaran untuk ${selectedRows.length} siswa.\nTotal yang akan dibayar: ${formatRupiah(selectedTotal)}`}
        confirmLabel="Konfirmasi & Simpan"
        onConfirm={handleBulkPay}
        loading={isBulkPaying}
        variant="default"
      />
    </div>
  );
}
