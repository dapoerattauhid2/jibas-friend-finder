import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { supabase } from "@/integrations/supabase/client";
import { useLembaga, useJenisPembayaran, usePembayaranBySiswa, useCreatePembayaran, formatRupiah, namaBulan } from "@/hooks/useKeuangan";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function PembayaranPSB() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSiswa, setSelectedSiswa] = useState<any>(null);
  const [departemenId, setDepartemenId] = useState("");
  const [jenisId, setJenisId] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [tanggalBayar, setTanggalBayar] = useState(format(new Date(), "yyyy-MM-dd"));
  const [keterangan, setKeterangan] = useState("");

  const { data: lembagaList } = useLembaga();
  const { data: jenisList } = useJenisPembayaran(departemenId || undefined);
  const { data: riwayat, isLoading: loadRiwayat } = usePembayaranBySiswa(selectedSiswa?.id);
  const createMutation = useCreatePembayaran();

  // Search calon siswa only
  const { data: searchResults } = useQuery({
    queryKey: ["search_calon", searchTerm, departemenId],
    enabled: searchTerm.length >= 2 && !!departemenId,
    queryFn: async () => {
      const { data } = await supabase
        .from("siswa")
        .select("id, nis, nama, foto_url, status")
        .or(`nama.ilike.%${searchTerm}%,nis.ilike.%${searchTerm}%`)
        .eq("status", "calon")
        .limit(10);
      return data || [];
    },
  });

  const handleSubmit = async () => {
    if (!selectedSiswa || !jenisId || !jumlah) return;
    await createMutation.mutateAsync({
      siswa_id: selectedSiswa.id,
      jenis_id: jenisId,
      bulan: 0, // PSB tidak terikat bulan
      jumlah: Number(jumlah),
      tanggal_bayar: tanggalBayar,
      keterangan: keterangan || "Pembayaran PSB",
      departemen_id: departemenId || undefined,
    });
    setJenisId("");
    setJumlah("");
    setKeterangan("");
  };

  const selectedJenis = jenisList?.find((j: any) => j.id === jenisId);

  const riwayatColumns: DataTableColumn<any>[] = [
    { key: "jenis", label: "Jenis", render: (_, r) => (r as any).jenis_pembayaran?.nama || "-" },
    { key: "jumlah", label: "Jumlah", render: (v) => formatRupiah(Number(v)) },
    { key: "tanggal_bayar", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "dd MMM yyyy", { locale: idLocale }) : "-" },
    { key: "keterangan", label: "Keterangan", render: (v) => (v as string) || "-" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pembayaran Calon Siswa (PSB)</h1>
        <p className="text-sm text-muted-foreground">Input pembayaran untuk siswa berstatus calon (pendaftaran, uang pangkal, dll)</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="max-w-md">
            <Label>Pilih Lembaga</Label>
            <Select value={departemenId} onValueChange={(v) => { setDepartemenId(v); setSelectedSiswa(null); }}>
              <SelectTrigger><SelectValue placeholder="Pilih lembaga" /></SelectTrigger>
              <SelectContent>
                {lembagaList?.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.kode} — {l.nama}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari calon siswa (nama)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              disabled={!departemenId}
            />
            {searchResults && searchResults.length > 0 && searchTerm.length >= 2 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((s: any) => (
                  <button key={s.id} className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-center gap-3" onClick={() => { setSelectedSiswa(s); setSearchTerm(""); }}>
                    <div className="h-8 w-8 rounded-full bg-accent/50 flex items-center justify-center text-xs font-bold">{s.nama?.[0]}</div>
                    <div>
                      <p className="text-sm font-medium">{s.nama}</p>
                      <p className="text-xs text-muted-foreground">Status: Calon</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSiswa && (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-accent/20 flex items-center justify-center text-lg font-bold text-accent">
                  {selectedSiswa.nama?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{selectedSiswa.nama}</h3>
                  <p className="text-sm text-muted-foreground">Status: Calon Siswa</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Input Pembayaran PSB</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Jenis Pembayaran</Label>
                  <Select value={jenisId} onValueChange={(v) => {
                    setJenisId(v);
                    const j = jenisList?.find((x: any) => x.id === v);
                    if (j?.nominal) setJumlah(String(j.nominal));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                    <SelectContent>
                      {jenisList?.map((j: any) => (
                        <SelectItem key={j.id} value={j.id}>{j.nama} {j.nominal ? `(${formatRupiah(Number(j.nominal))})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Jumlah (Rp)</Label>
                  <Input type="number" value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>Tanggal Bayar</Label>
                  <Input type="date" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} />
                </div>
                <div>
                  <Label>Keterangan</Label>
                  <Textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Pembayaran PSB" />
                </div>
                <Button onClick={handleSubmit} disabled={!jenisId || !jumlah || createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Menyimpan..." : "Simpan Pembayaran"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Riwayat Pembayaran PSB</CardTitle></CardHeader>
              <CardContent>
                <DataTable columns={riwayatColumns} data={(riwayat as any[]) || []} loading={loadRiwayat} searchable={false} pageSize={10} emptyMessage="Belum ada pembayaran" />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
