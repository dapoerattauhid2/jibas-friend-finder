import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Database, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

const TABLES = [
  { key: "siswa", label: "Data Siswa" },
  { key: "pegawai", label: "Data Pegawai" },
  { key: "kelas", label: "Kelas" },
  { key: "kelas_siswa", label: "Kelas Siswa" },
  { key: "mata_pelajaran", label: "Mata Pelajaran" },
  { key: "departemen", label: "Departemen" },
  { key: "tahun_ajaran", label: "Tahun Ajaran" },
  { key: "semester", label: "Semester" },
  { key: "pembayaran", label: "Pembayaran" },
  { key: "pengeluaran", label: "Pengeluaran" },
  { key: "penilaian", label: "Penilaian" },
  { key: "presensi_siswa", label: "Presensi Siswa" },
  { key: "presensi_pegawai", label: "Presensi Pegawai" },
  { key: "jadwal", label: "Jadwal" },
  { key: "koleksi_buku", label: "Koleksi Buku" },
  { key: "peminjaman", label: "Peminjaman" },
  { key: "kompetensi_dasar", label: "Kompetensi Dasar" },
  { key: "nilai_kd", label: "Nilai KD" },
  { key: "kkm", label: "KKM" },
  { key: "jurnal", label: "Jurnal" },
  { key: "jurnal_detail", label: "Jurnal Detail" },
  { key: "sekolah", label: "Profil Sekolah" },
] as const;

type TableKey = (typeof TABLES)[number]["key"];

export default function BackupExport() {
  const [selected, setSelected] = useState<Set<string>>(new Set(TABLES.map(t => t.key)));
  const [exporting, setExporting] = useState(false);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(TABLES.map(t => t.key)));
  const selectNone = () => setSelected(new Set());

  const handleExport = async () => {
    if (selected.size === 0) { toast.error("Pilih minimal 1 tabel"); return; }
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      for (const key of Array.from(selected)) {
        const { data, error } = await (supabase.from(key as any).select("*") as any);
        if (error) { console.warn(`Error fetching ${key}:`, error.message); continue; }
        const ws = XLSX.utils.json_to_sheet(data || []);
        XLSX.utils.book_append_sheet(wb, ws, key.substring(0, 31));
      }
      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `backup_jibas_${dateStr}.xlsx`);
      toast.success(`Berhasil export ${selected.size} tabel`);
    } catch (e: any) {
      toast.error("Gagal export: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Backup & Export Data</h1>
        <p className="text-sm text-muted-foreground">Export seluruh data ke file Excel untuk backup</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Pilih Tabel untuk di-Export
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={selectAll}>Pilih Semua</Button>
            <Button variant="outline" size="sm" onClick={selectNone}>Hapus Semua</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TABLES.map((t) => (
              <div key={t.key} className="flex items-center gap-2">
                <Checkbox id={t.key} checked={selected.has(t.key)} onCheckedChange={() => toggle(t.key)} />
                <Label htmlFor={t.key} className="text-sm cursor-pointer">{t.label}</Label>
              </div>
            ))}
          </div>
          <div className="pt-4 border-t flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{selected.size} dari {TABLES.length} tabel dipilih</p>
            <Button onClick={handleExport} disabled={exporting || selected.size === 0}>
              {exporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Mengexport...</> : <><Download className="h-4 w-4 mr-2" />Export ke Excel</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">
            <strong>Catatan:</strong> Export akan mengunduh data dalam format XLSX (Excel). Setiap tabel menjadi 1 sheet.
            Data yang di-export terbatas pada data yang dapat diakses sesuai role pengguna Anda (RLS).
            Untuk backup lengkap database, gunakan Supabase Dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
