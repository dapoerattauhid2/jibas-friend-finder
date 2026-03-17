import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { ExportButton } from "@/components/shared/ExportButton";
import { useAkunRekening, useBukuBesar } from "@/hooks/useJurnal";
import { formatRupiah, BULAN_NAMES, BULAN_ORDER_AKADEMIK, namaBulan } from "@/hooks/useKeuangan";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const currentYear = new Date().getFullYear();

export default function BukuBesar() {
  const [akunId, setAkunId] = useState<string>("");
  const [bulanDari, setBulanDari] = useState(1);
  const [bulanSampai, setBulanSampai] = useState(12);
  const [tahun, setTahun] = useState(currentYear);

  const { data: akunList } = useAkunRekening();
  const { data: mutasiList, isLoading } = useBukuBesar(akunId || undefined, bulanDari, bulanSampai, tahun);

  const selectedAkun = akunList?.find((a: any) => a.id === akunId);

  const computedData = useMemo(() => {
    if (!mutasiList || !selectedAkun) return [];
    const isDebitNormal = selectedAkun.saldo_normal === "debit";
    let saldo = Number(selectedAkun.saldo_awal) || 0;

    return mutasiList.map((d: any) => {
      const debit = Number(d.debit) || 0;
      const kredit = Number(d.kredit) || 0;
      saldo += isDebitNormal ? (debit - kredit) : (kredit - debit);
      return {
        tanggal: d.jurnal?.tanggal,
        nomor: d.jurnal?.nomor,
        keterangan: d.keterangan || d.jurnal?.keterangan || "-",
        debit,
        kredit,
        saldo,
      };
    });
  }, [mutasiList, selectedAkun]);

  const saldoAkhir = computedData.length > 0 ? computedData[computedData.length - 1].saldo : (Number(selectedAkun?.saldo_awal) || 0);

  const columns: DataTableColumn<any>[] = [
    { key: "tanggal", label: "Tanggal", render: (v) => v ? format(new Date(v as string), "d MMM yyyy", { locale: idLocale }) : "-" },
    { key: "nomor", label: "No. Jurnal" },
    { key: "keterangan", label: "Keterangan" },
    { key: "debit", label: "Debit", render: (v) => Number(v) > 0 ? formatRupiah(Number(v)) : "-" },
    { key: "kredit", label: "Kredit", render: (v) => Number(v) > 0 ? formatRupiah(Number(v)) : "-" },
    { key: "saldo", label: "Saldo", render: (v) => formatRupiah(Number(v)) },
  ];

  const jenisLabel: Record<string, string> = { aset: "Aset", liabilitas: "Liabilitas", ekuitas: "Ekuitas", pendapatan: "Pendapatan", beban: "Beban" };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Buku Besar</h1>
        <p className="text-sm text-muted-foreground">Lihat mutasi per akun rekening dari jurnal yang sudah diposting</p>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="min-w-[250px]">
          <Label>Akun Rekening</Label>
          <Select value={akunId} onValueChange={setAkunId}>
            <SelectTrigger><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
            <SelectContent>
              {akunList?.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.kode} - {a.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bulan Dari</Label>
          <Select value={String(bulanDari)} onValueChange={v => setBulanDari(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BULAN_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Bulan Sampai</Label>
          <Select value={String(bulanSampai)} onValueChange={v => setBulanSampai(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BULAN_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tahun</Label>
          <Input type="number" className="w-28" value={tahun} onChange={e => setTahun(Number(e.target.value))} />
        </div>
      </div>

      {selectedAkun && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mb-4">
              <div><span className="text-muted-foreground">Kode:</span> <span className="font-semibold">{selectedAkun.kode}</span></div>
              <div><span className="text-muted-foreground">Nama:</span> <span className="font-semibold">{selectedAkun.nama}</span></div>
              <div><span className="text-muted-foreground">Jenis:</span> <span className="font-semibold">{jenisLabel[selectedAkun.jenis] || selectedAkun.jenis}</span></div>
              <div><span className="text-muted-foreground">Saldo Normal:</span> <span className="font-semibold capitalize">{selectedAkun.saldo_normal}</span></div>
              <div><span className="text-muted-foreground">Saldo Awal:</span> <span className="font-semibold">{formatRupiah(Number(selectedAkun.saldo_awal) || 0)}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {akunId && (
        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={computedData}
              loading={isLoading}
              pageSize={50}
              actions={
                computedData.length > 0 ? (
                  <ExportButton data={computedData} filename={`buku-besar-${selectedAkun?.kode}`} />
                ) : undefined
              }
            />
            {computedData.length > 0 && (
              <div className="mt-4 p-3 bg-muted/50 rounded-md text-right">
                <span className="text-sm text-muted-foreground mr-2">Saldo Akhir:</span>
                <span className="text-lg font-bold">{formatRupiah(saldoAkhir)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!akunId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Pilih akun rekening untuk melihat buku besar
          </CardContent>
        </Card>
      )}
    </div>
  );
}
