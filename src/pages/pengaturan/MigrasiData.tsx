import { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

const TIPE_AKUN_VALID = ["aset", "liabilitas", "kewajiban", "aset_neto", "pendapatan", "beban"];
const SALDO_NORMAL_VALID = ["debit", "kredit"];
const POS_ISAK35_VALID = [
  "aset_lancar", "aset_tidak_lancar", "kewajiban_jangka_pendek", "kewajiban_jangka_panjang",
  "aset_neto_tidak_terikat", "aset_neto_terikat_temporer", "aset_neto_terikat_permanen",
  "pendapatan_tidak_terikat", "pendapatan_terikat_temporer", "beban_program", "beban_penunjang",
  "pendapatan", "beban", "pendapatan_terbatas", "beban_terbatas", "pkl",
];

export default function MigrasiData() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Migrasi Data Keuangan</h1>
        <p className="text-sm text-muted-foreground">Import/export kode akun, jurnal, dan saldo awal</p>
      </div>
      <Tabs defaultValue="kode-akun">
        <TabsList>
          <TabsTrigger value="kode-akun">Kode Akun</TabsTrigger>
          <TabsTrigger value="jurnal">Jurnal & Transaksi</TabsTrigger>
          <TabsTrigger value="saldo-awal">Saldo Awal</TabsTrigger>
        </TabsList>
        <TabsContent value="kode-akun"><TabKodeAkun /></TabsContent>
        <TabsContent value="jurnal"><TabJurnal /></TabsContent>
        <TabsContent value="saldo-awal"><TabSaldoAwal /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ======================== TAB KODE AKUN ======================== */
interface AkunRow {
  kode_akun: string; nama_akun: string; tipe_akun: string; pos_isak35: string;
  saldo_normal: string; urutan: number; level: number; kode_induk: string;
  error?: string;
}

function TabKodeAkun() {
  const [rows, setRows] = useState<AkunRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; updated: number; error: number } | null>(null);

  const validateRows = (data: AkunRow[]): AkunRow[] => {
    return data.map(r => {
      const errors: string[] = [];
      if (!r.kode_akun?.toString().trim()) errors.push("kode_akun kosong");
      if (r.tipe_akun && !TIPE_AKUN_VALID.includes(r.tipe_akun)) errors.push(`tipe_akun invalid: ${r.tipe_akun}`);
      if (r.saldo_normal && !SALDO_NORMAL_VALID.includes(r.saldo_normal?.toLowerCase())) errors.push(`saldo_normal invalid: ${r.saldo_normal}`);
      if (r.pos_isak35 && !POS_ISAK35_VALID.includes(r.pos_isak35)) errors.push(`pos_isak35 invalid: ${r.pos_isak35}`);
      return { ...r, error: errors.length ? errors.join("; ") : undefined };
    });
  };

  const hasErrors = rows.some(r => r.error);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<AkunRow>(ws);
      setRows(validateRows(data));
      setResult(null);
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const template = [{ kode_akun: "1-111", nama_akun: "Kas", tipe_akun: "aset", pos_isak35: "aset_lancar", saldo_normal: "debit", urutan: 1, level: 1, kode_induk: "" }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template_kode_akun.xlsx");
  };

  const handleImport = async () => {
    if (hasErrors) return;
    setImporting(true);
    setProgress(0);
    let success = 0, updated = 0, errorCount = 0;
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const saldoNormal = r.saldo_normal?.toLowerCase() === "debit" ? "D" : "K";
      const payload: any = {
        kode: r.kode_akun.toString().trim(),
        nama: r.nama_akun || "",
        jenis: r.tipe_akun || "aset",
        pos_isak35: r.pos_isak35 || null,
        saldo_normal: saldoNormal,
        urutan_isak35: r.urutan || null,
        keterangan: r.kode_induk || null,
        aktif: true,
      };

      const { data: existing } = await supabase.from("akun_rekening").select("id").eq("kode", payload.kode).maybeSingle();
      let error;
      if (existing) {
        ({ error } = await supabase.from("akun_rekening").update(payload).eq("id", existing.id));
        if (!error) updated++;
      } else {
        ({ error } = await supabase.from("akun_rekening").insert(payload));
        if (!error) success++;
      }
      if (error) errorCount++;
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResult({ success, updated, error: errorCount });
    setImporting(false);
    toast.success(`Import selesai: ${success} baru, ${updated} diupdate, ${errorCount} error`);
  };

  const handleExport = async () => {
    setExporting(true);
    const { data, error } = await supabase.from("akun_rekening").select("*").order("kode");
    if (error) { toast.error(error.message); setExporting(false); return; }
    const exportData = (data || []).map((a: any) => ({
      kode_akun: a.kode, nama_akun: a.nama, tipe_akun: a.jenis, pos_isak35: a.pos_isak35 || "",
      saldo_normal: a.saldo_normal === "D" ? "debit" : "kredit", urutan: a.urutan_isak35 || "", level: "", kode_induk: a.keterangan || "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kode Akun");
    XLSX.writeFile(wb, `kode_akun_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExporting(false);
    toast.success("Export berhasil");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Import / Export Kode Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Download Template Excel</Button>
            <Label htmlFor="upload-akun" className="cursor-pointer">
              <Button variant="outline" asChild><span><Upload className="mr-2 h-4 w-4" />Upload File Excel</span></Button>
            </Label>
            <input id="upload-akun" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export Kode Akun
            </Button>
          </div>

          {rows.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Preview: {Math.min(10, rows.length)} dari {rows.length} baris</p>
              <div className="border rounded-md overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Tipe</TableHead>
                      <TableHead>Pos ISAK 35</TableHead><TableHead>Saldo Normal</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 10).map((r, i) => (
                      <TableRow key={i} className={r.error ? "bg-destructive/10" : ""}>
                        <TableCell className="font-mono text-sm">{r.kode_akun}</TableCell>
                        <TableCell>{r.nama_akun}</TableCell>
                        <TableCell>{r.tipe_akun}</TableCell>
                        <TableCell>{r.pos_isak35}</TableCell>
                        <TableCell>{r.saldo_normal}</TableCell>
                        <TableCell>{r.error ? <span className="text-destructive text-xs">{r.error}</span> : <CheckCircle2 className="h-4 w-4 text-green-600" />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {importing && <Progress value={progress} className="h-2" />}

              {result && (
                <div className="flex gap-3 text-sm">
                  <Badge variant="default">{result.success} baru</Badge>
                  <Badge variant="secondary">{result.updated} diupdate</Badge>
                  {result.error > 0 && <Badge variant="destructive">{result.error} error</Badge>}
                </div>
              )}

              <Button onClick={handleImport} disabled={hasErrors || importing}>
                {importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mengimport...</> : "Simpan ke Database"}
              </Button>
              {hasErrors && <p className="text-xs text-destructive">Perbaiki error di atas sebelum import</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ======================== TAB JURNAL ======================== */
interface JurnalRow {
  nomor_jurnal: string; tanggal: string; keterangan: string; kode_akun: string;
  debit: number; kredit: number; referensi_dokumen: string; tahun_ajaran: string; periode_bulan: number;
  departemen_id?: string;
  program_dana_id?: string;
  error?: string;
}
interface JurnalGroup {
  nomor: string; tanggal: string; keterangan: string; totalDebit: number; totalKredit: number;
  balanced: boolean; rows: JurnalRow[];
}

function TabJurnal() {
  const [rows, setRows] = useState<JurnalRow[]>([]);
  const [akunMap, setAkunMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ jurnal: number; detail: number } | null>(null);

  useEffect(() => {
    supabase.from("akun_rekening").select("id, kode").then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach((a: any) => { map[a.kode] = a.id; });
      setAkunMap(map);
    });
  }, []);

  const groups = useMemo<JurnalGroup[]>(() => {
    const map = new Map<string, JurnalRow[]>();
    rows.forEach(r => {
      if (!map.has(r.nomor_jurnal)) map.set(r.nomor_jurnal, []);
      map.get(r.nomor_jurnal)!.push(r);
    });
    return Array.from(map.entries()).map(([nomor, items]) => {
      const totalDebit = items.reduce((s, r) => s + (Number(r.debit) || 0), 0);
      const totalKredit = items.reduce((s, r) => s + (Number(r.kredit) || 0), 0);
      return {
        nomor, tanggal: items[0].tanggal, keterangan: items[0].keterangan,
        totalDebit, totalKredit, balanced: Math.abs(totalDebit - totalKredit) < 0.01, rows: items,
      };
    });
  }, [rows]);

  const allBalanced = groups.length > 0 && groups.every(g => g.balanced);
  const hasRowErrors = rows.some(r => r.error);

  const validateRows = (data: JurnalRow[]): JurnalRow[] => {
    return data.map(r => {
      const errors: string[] = [];
      if (!r.nomor_jurnal?.toString().trim()) errors.push("nomor_jurnal kosong");
      if (!r.tanggal) errors.push("tanggal kosong");
      if (r.kode_akun && !akunMap[r.kode_akun?.toString().trim()]) errors.push(`kode_akun '${r.kode_akun}' tidak ditemukan`);
      if (r.debit != null && (isNaN(Number(r.debit)) || Number(r.debit) < 0)) errors.push("debit invalid");
      if (r.kredit != null && (isNaN(Number(r.kredit)) || Number(r.kredit) < 0)) errors.push("kredit invalid");
      return { ...r, error: errors.length ? errors.join("; ") : undefined };
    });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<JurnalRow>(ws);
      setRows(validateRows(data));
      setResult(null);
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const template = [{ nomor_jurnal: "JU-2025-001", tanggal: "2025-01-15", keterangan: "Penerimaan SPP", kode_akun: "1-111", debit: 500000, kredit: 0, referensi_dokumen: "BKM-001", tahun_ajaran: "2024/2025", periode_bulan: 1, departemen_id: "b8108afd-6070-4f82-85e0-4372d6faca4b", program_dana_id: "" }];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Jurnal");
    XLSX.writeFile(wb, "template_jurnal.xlsx");
  };

  const handleImport = async () => {
    if (!allBalanced || hasRowErrors) return;
    setImporting(true);
    setProgress(0);
    let jrnCount = 0, detCount = 0;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const rawDeptId = g.rows[0]?.departemen_id?.toString().trim();
      const departemenId = rawDeptId && UUID_RE.test(rawDeptId) ? rawDeptId : null;
      const rawProgId = g.rows[0]?.program_dana_id?.toString().trim();
      const programDanaId = rawProgId && UUID_RE.test(rawProgId) ? rawProgId : null;
      const { data: jrn, error: jErr } = await (supabase.from("jurnal") as any).insert({
        nomor: g.nomor, tanggal: g.tanggal, keterangan: g.keterangan,
        total_debit: g.totalDebit, total_kredit: g.totalKredit, status: "posted",
        referensi: g.rows[0]?.referensi_dokumen || null,
        departemen_id: departemenId,
        program_dana_id: programDanaId,
      }).select("id").single();

      if (jErr) { toast.error(`Error jurnal ${g.nomor}: ${jErr.message}`); continue; }
      jrnCount++;

      const details = g.rows.map((r, idx) => ({
        jurnal_id: jrn.id, akun_id: akunMap[r.kode_akun?.toString().trim()],
        debit: Number(r.debit) || 0, kredit: Number(r.kredit) || 0,
        keterangan: r.keterangan, urutan: idx + 1,
      }));
      const { error: dErr } = await supabase.from("jurnal_detail").insert(details);
      if (dErr) toast.error(`Error detail ${g.nomor}: ${dErr.message}`);
      else detCount += details.length;

      setProgress(Math.round(((i + 1) / groups.length) * 100));
    }

    setResult({ jurnal: jrnCount, detail: detCount });
    setImporting(false);
    toast.success(`Import selesai: ${jrnCount} jurnal, ${detCount} entri detail`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Import Jurnal dari Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Download Template Jurnal</Button>
            <Label htmlFor="upload-jurnal" className="cursor-pointer">
              <Button variant="outline" asChild><span><Upload className="mr-2 h-4 w-4" />Upload File Excel Jurnal</span></Button>
            </Label>
            <input id="upload-jurnal" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
          </div>

          {groups.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Ringkasan per Nomor Jurnal ({groups.length} jurnal, {rows.length} baris)</p>
              <div className="border rounded-md overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No. Jurnal</TableHead><TableHead>Tanggal</TableHead><TableHead>Keterangan</TableHead>
                      <TableHead className="text-right">Total Debit</TableHead><TableHead className="text-right">Total Kredit</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map(g => (
                      <TableRow key={g.nomor} className={!g.balanced ? "bg-destructive/10" : ""}>
                        <TableCell className="font-mono text-sm">{g.nomor}</TableCell>
                        <TableCell>{g.tanggal}</TableCell>
                        <TableCell>{g.keterangan}</TableCell>
                        <TableCell className="text-right font-mono">{Number(g.totalDebit).toLocaleString("id-ID")}</TableCell>
                        <TableCell className="text-right font-mono">{Number(g.totalKredit).toLocaleString("id-ID")}</TableCell>
                        <TableCell>{g.balanced ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {rows.some(r => r.error) && (
                <div className="border rounded-md p-3 bg-destructive/5 space-y-1">
                  <p className="text-sm font-medium text-destructive">Error per baris:</p>
                  {rows.filter(r => r.error).slice(0, 5).map((r, i) => (
                    <p key={i} className="text-xs text-destructive">{r.nomor_jurnal} / {r.kode_akun}: {r.error}</p>
                  ))}
                </div>
              )}

              {importing && <Progress value={progress} className="h-2" />}
              {result && (
                <div className="flex gap-3 text-sm">
                  <Badge variant="default">{result.jurnal} jurnal</Badge>
                  <Badge variant="secondary">{result.detail} entri detail</Badge>
                </div>
              )}

              <Button onClick={handleImport} disabled={!allBalanced || hasRowErrors || importing}>
                {importing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Mengimport...</> : "Simpan Jurnal"}
              </Button>
              {!allBalanced && <p className="text-xs text-destructive">Semua jurnal harus balance (debit = kredit)</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ======================== TAB SALDO AWAL ======================== */
interface AkunSaldo {
  id: string; kode: string; nama: string; jenis: string; saldo_normal: string; saldo: number;
}

function TabSaldoAwal() {
  const [akuns, setAkuns] = useState<AkunSaldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tahun, setTahun] = useState(new Date().getFullYear().toString());
  const [tahunOptions] = useState(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (y - 2 + i).toString());
  });

  const fetchAkuns = useCallback(async () => {
    setLoading(true);
    const { data: akunList } = await supabase.from("akun_rekening").select("id, kode, nama, jenis, saldo_normal, saldo_awal").eq("aktif", true).order("kode");
    const { data: saldoData } = await (supabase.from("saldo_awal_isak35" as any).select("akun_id, saldo").eq("tahun", parseInt(tahun)) as any);
    const saldoMap: Record<string, number> = {};
    ((saldoData as any[]) || []).forEach((s: any) => { saldoMap[s.akun_id] = Number(s.saldo); });

    setAkuns((akunList || []).map((a: any) => ({
      id: a.id, kode: a.kode, nama: a.nama, jenis: a.jenis, saldo_normal: a.saldo_normal,
      saldo: saldoMap[a.id] ?? Number(a.saldo_awal || 0),
    })));
    setLoading(false);
  }, [tahun]);

  useEffect(() => { fetchAkuns(); }, [fetchAkuns]);

  const grouped = useMemo(() => {
    const groups: Record<string, AkunSaldo[]> = {};
    const order = ["aset", "liabilitas", "kewajiban", "aset_neto", "pendapatan", "beban"];
    order.forEach(t => { groups[t] = []; });
    akuns.forEach(a => {
      const key = a.jenis || "aset";
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }, [akuns]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    Object.entries(grouped).forEach(([key, items]) => { t[key] = items.reduce((s, a) => s + a.saldo, 0); });
    return t;
  }, [grouped]);

  const totalAset = totals["aset"] || 0;
  const totalKewajiban = (totals["kewajiban"] || 0) + (totals["aset_neto"] || 0);
  const selisih = totalAset - totalKewajiban;
  const isBalanced = Math.abs(selisih) < 0.01;

  const updateSaldo = (id: string, val: number) => {
    setAkuns(prev => prev.map(a => a.id === id ? { ...a, saldo: val } : a));
  };

  const handleSave = async () => {
    setSaving(true);
    const thn = parseInt(tahun);
    // Delete existing then insert
    await (supabase.from("saldo_awal_isak35" as any).delete().eq("tahun", thn) as any);
    const payload = akuns.filter(a => a.saldo !== 0).map(a => ({ akun_id: a.id, tahun: thn, saldo: a.saldo }));
    if (payload.length > 0) {
      const { error } = await (supabase.from("saldo_awal_isak35" as any).insert(payload) as any);
      if (error) { toast.error("Gagal menyimpan: " + error.message); setSaving(false); return; }
    }
    toast.success("Saldo awal berhasil disimpan");
    setSaving(false);
  };

  const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
  const labelJenis: Record<string, string> = { aset: "ASET", kewajiban: "KEWAJIBAN", aset_neto: "ASET NETO", pendapatan: "PENDAPATAN", beban: "BEBAN" };

  if (loading) return <div className="py-8 text-center text-muted-foreground">Memuat data akun...</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Input Saldo Awal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label>Tahun</Label>
              <Select value={tahun} onValueChange={setTahun}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{tahunOptions.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {isBalanced ? (
                <Badge variant="default" className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Seimbang</Badge>
              ) : (
                <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Selisih {fmtRp(Math.abs(selisih))}</Badge>
              )}
            </div>
          </div>

          {Object.entries(grouped).map(([jenis, items]) => items.length > 0 && (
            <div key={jenis} className="space-y-2">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{labelJenis[jenis] || jenis}</h3>
              <div className="border rounded-md overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Kode</TableHead><TableHead>Nama</TableHead>
                      <TableHead className="w-20">Saldo Normal</TableHead><TableHead className="w-48 text-right">Saldo Awal (Rp)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(a => (
                      <TableRow key={a.id} className={a.saldo > 0 ? "bg-green-50 dark:bg-green-950/20" : ""}>
                        <TableCell className="font-mono text-sm">{a.kode}</TableCell>
                        <TableCell>{a.nama}</TableCell>
                        <TableCell>{a.saldo_normal === "D" ? "Debit" : "Kredit"}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" className="text-right w-full"
                            value={a.saldo || ""} onChange={(e) => updateSaldo(a.id, Number(e.target.value) || 0)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3} className="text-right">Subtotal {labelJenis[jenis]}</TableCell>
                      <TableCell className="text-right font-mono">{fmtRp(totals[jenis] || 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>Total Aset</span><span className="font-mono">{fmtRp(totalAset)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Total Kewajiban + Aset Neto</span><span className="font-mono">{fmtRp(totalKewajiban)}</span>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Menyimpan...</> : "Simpan Saldo Awal"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
