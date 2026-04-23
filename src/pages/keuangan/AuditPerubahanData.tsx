import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumn } from "@/components/shared/DataTable";
import { StatsCard } from "@/components/shared/StatsCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLembaga } from "@/hooks/useKeuangan";
import { useAuditKeuangan } from "@/hooks/useJurnal";
import { Shield, Edit, Trash2, CheckCircle, Plus, Eye } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

const now = new Date();

const AKSI_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  CREATE: { label: "Buat Baru", color: "bg-info/15 text-info border-info/30", icon: Plus },
  UPDATE: { label: "Diubah", color: "bg-warning/15 text-warning border-warning/30", icon: Edit },
  DELETE: { label: "Dihapus", color: "bg-destructive/15 text-destructive border-destructive/30", icon: Trash2 },
  POST: { label: "Diposting", color: "bg-success/15 text-success border-success/30", icon: CheckCircle },
};

export default function AuditPerubahanData() {
  const [departemenId, setDepartemenId] = useState("");
  const [tabelSumber, setTabelSumber] = useState("semua");
  const [aksiFilter, setAksiFilter] = useState("semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [tanggalDari, setTanggalDari] = useState(
    format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd")
  );
  const [tanggalSampai, setTanggalSampai] = useState(format(now, "yyyy-MM-dd"));
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any>(null);

  const { data: lembagaList } = useLembaga();
  const { data, isLoading } = useAuditKeuangan({
    tabelSumber, aksi: aksiFilter, tanggalDari, tanggalSampai, departemenId, searchQuery,
  });

  const rows = data || [];
  const countByAksi = (aksi: string) => rows.filter((r: any) => r.aksi === aksi).length;

  const columns: DataTableColumn<any>[] = [
    {
      key: "created_at", label: "Waktu", sortable: true,
      render: (v) => v ? format(new Date(v as string), "dd MMM yyyy HH:mm", { locale: idLocale }) : "-",
    },
    {
      key: "aksi", label: "Aksi",
      render: (v) => {
        const cfg = AKSI_CONFIG[v as string];
        if (!cfg) return <Badge variant="outline">{v as string}</Badge>;
        const Icon = cfg.icon;
        return (
          <Badge variant="outline" className={cfg.color}>
            <Icon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        );
      },
    },
    { key: "tabel_sumber", label: "Data", render: (v) => <span className="capitalize">{v as string}</span> },
    { key: "record_id", label: "ID Record", render: (v) => <code className="text-xs">{(v as string)?.slice(0, 8)}...</code> },
    { key: "keterangan", label: "Keterangan" },
    { key: "nama_pengguna", label: "Oleh", render: (v) => v as string || "-" },
    {
      key: "_aksi", label: "Detail",
      render: (_, r: any) => (
        <Button variant="ghost" size="icon" className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); setDetailRow(r); setDetailOpen(true); }}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Audit Perubahan Data Keuangan
        </h1>
        <p className="text-xs text-muted-foreground">
          Riwayat semua perubahan, penghapusan, dan pengubahan data keuangan
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Log" value={rows.length} icon={Shield} color="primary" />
        <StatsCard title="Diubah" value={countByAksi("UPDATE")} icon={Edit} color="warning" />
        <StatsCard title="Dihapus" value={countByAksi("DELETE")} icon={Trash2} color="destructive" />
        <StatsCard title="Diposting" value={countByAksi("POST")} icon={CheckCircle} color="success" />
      </div>

      <Card>
        <CardContent className="pt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">Cari</Label>
            <Input
              placeholder="ID, keterangan, pengguna..."
              className="h-8 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Jenis Data</Label>
            <Select value={tabelSumber} onValueChange={setTabelSumber}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Data</SelectItem>
                <SelectItem value="jurnal">Jurnal</SelectItem>
                <SelectItem value="pembayaran">Pembayaran</SelectItem>
                <SelectItem value="pengeluaran">Pengeluaran</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Aksi</Label>
            <Select value={aksiFilter} onValueChange={setAksiFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua Aksi</SelectItem>
                <SelectItem value="CREATE">Buat Baru</SelectItem>
                <SelectItem value="UPDATE">Diubah</SelectItem>
                <SelectItem value="DELETE">Dihapus</SelectItem>
                <SelectItem value="POST">Diposting</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dari</Label>
            <Input type="date" className="h-8 text-xs" value={tanggalDari} onChange={(e) => setTanggalDari(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sampai</Label>
            <Input type="date" className="h-8 text-xs" value={tanggalSampai} onChange={(e) => setTanggalSampai(e.target.value)} />
          </div>
          <div className="space-y-1 lg:col-span-2">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Log Perubahan Data</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            loading={isLoading}
            pageSize={20}
            searchable={false}
            exportable
            exportFilename="audit-perubahan-keuangan"
          />
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={(v) => { setDetailOpen(v); if (!v) setDetailRow(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detail Perubahan
              {detailRow && (
                <Badge variant="outline" className={AKSI_CONFIG[detailRow.aksi]?.color}>
                  {AKSI_CONFIG[detailRow.aksi]?.label || detailRow.aksi}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Waktu:</span> <span className="font-medium">{format(new Date(detailRow.created_at), "dd MMMM yyyy HH:mm:ss", { locale: idLocale })}</span></div>
                <div><span className="text-muted-foreground">Oleh:</span> <span className="font-medium">{detailRow.nama_pengguna || "-"}</span></div>
                <div><span className="text-muted-foreground">Tabel:</span> <span className="font-medium capitalize">{detailRow.tabel_sumber}</span></div>
                <div><span className="text-muted-foreground">ID Record:</span> <code className="text-xs">{detailRow.record_id}</code></div>
              </div>
              {detailRow.keterangan && (
                <div>
                  <p className="text-muted-foreground text-xs">Keterangan</p>
                  <p className="font-medium">{detailRow.keterangan}</p>
                </div>
              )}
              {detailRow.data_lama && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Data Sebelum</p>
                  <pre className="bg-muted/50 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(detailRow.data_lama, null, 2)}
                  </pre>
                </div>
              )}
              {detailRow.data_baru && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Data Sesudah</p>
                  <pre className="bg-muted/50 p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(detailRow.data_baru, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
