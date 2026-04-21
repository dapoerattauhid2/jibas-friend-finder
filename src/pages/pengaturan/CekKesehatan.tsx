import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Play, Loader2, CheckCircle2, AlertTriangle, XCircle, Download } from "lucide-react";
import * as XLSX from "xlsx";

type Status = "ok" | "warning" | "error" | "pending";
interface CheckResult {
  title: string; status: Status; message: string; details?: string[];
}

export default function CekKesehatan() {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const runChecks = async () => {
    setRunning(true);
    setResults([]);
    const checks: CheckResult[] = [];
    const totalChecks = 5;
    let done = 0;
    const tick = () => { done++; setProgress(Math.round((done / totalChecks) * 100)); };

    // 1. Akun Rekening
    {
      const { data: akuns } = await supabase.from("akun_rekening").select("kode, jenis, pos_isak35, saldo_normal").eq("aktif", true);
      const details: string[] = [];
      const codes = (akuns || []).map((a: any) => a.kode);
      const dupes = codes.filter((c: string, i: number) => codes.indexOf(c) !== i);
      if (dupes.length) details.push(`Kode duplikat: ${[...new Set(dupes)].join(", ")}`);
      const noPos = (akuns || []).filter((a: any) => !a.pos_isak35);
      if (noPos.length) details.push(`${noPos.length} akun tanpa pos_isak35`);
      const hasKas = (akuns || []).some((a: any) => a.jenis === "aset" && a.saldo_normal === "D");
      if (!hasKas) details.push("Tidak ada akun kas (aset, saldo normal debit)");
      checks.push({
        title: "Akun Rekening", details,
        status: details.length === 0 ? "ok" : dupes.length || !hasKas ? "error" : "warning",
        message: details.length === 0 ? "Semua akun valid" : `${details.length} masalah ditemukan`,
      });
      tick();
    }

    // 2. Jurnal Balance
    {
      const { data: jurnals } = await supabase.from("jurnal").select("id, nomor, total_debit, total_kredit");
      const unbalanced = (jurnals || []).filter((j: any) => Math.abs(Number(j.total_debit || 0) - Number(j.total_kredit || 0)) > 0.01);
      const details = unbalanced.slice(0, 10).map((j: any) => `${j.nomor}: selisih Rp ${Math.abs(Number(j.total_debit) - Number(j.total_kredit)).toLocaleString("id-ID")}`);
      checks.push({
        title: "Jurnal Balance", details,
        status: unbalanced.length === 0 ? "ok" : "error",
        message: unbalanced.length === 0 ? "Semua jurnal balance" : `${unbalanced.length} jurnal tidak balance`,
      });
      tick();
    }

    // 3. Referensi Akun (orphan jurnal_detail)
    {
      const { data: details } = await supabase.from("jurnal_detail").select("akun_id").is("akun_id", null);
      const nullCount = (details || []).length;
      checks.push({
        title: "Referensi Akun",
        status: nullCount === 0 ? "ok" : "warning",
        message: nullCount === 0 ? "Semua detail jurnal memiliki akun" : `${nullCount} detail jurnal tanpa akun`,
        details: nullCount > 0 ? [`${nullCount} baris jurnal_detail dengan akun_id NULL`] : [],
      });
      tick();
    }

    // 4. Kelengkapan Mapping
    {
      const { data: jp } = await supabase.from("jenis_pembayaran").select("nama, akun_pendapatan_id").eq("aktif", true);
      const { data: jg } = await supabase.from("jenis_pengeluaran").select("nama, akun_beban_id").eq("aktif", true);
      const unmappedP = (jp || []).filter((j: any) => !j.akun_pendapatan_id).map((j: any) => j.nama);
      const unmappedG = (jg || []).filter((j: any) => !j.akun_beban_id).map((j: any) => j.nama);
      const details: string[] = [];
      if (unmappedP.length) details.push(`Jenis pembayaran belum dipetakan: ${unmappedP.join(", ")}`);
      if (unmappedG.length) details.push(`Jenis pengeluaran belum dipetakan: ${unmappedG.join(", ")}`);
      checks.push({
        title: "Kelengkapan Mapping ISAK 35", details,
        status: details.length === 0 ? "ok" : "warning",
        message: details.length === 0 ? "Semua jenis sudah dipetakan" : `${unmappedP.length + unmappedG.length} belum dipetakan`,
      });
      tick();
    }

    // 5. Persamaan Akuntansi
    {
      const { data: akuns } = await supabase.from("akun_rekening").select("jenis, saldo_awal").eq("aktif", true);
      const sums: Record<string, number> = {};
      (akuns || []).forEach((a: any) => { sums[a.jenis] = (sums[a.jenis] || 0) + Number(a.saldo_awal || 0); });
      const totalA = sums["aset"] || 0;
      const totalKAN = (sums["kewajiban"] || 0) + (sums["liabilitas"] || 0) + (sums["aset_neto"] || 0);
      const selisih = totalA - totalKAN;
      checks.push({
        title: "Persamaan Akuntansi (Saldo Awal)",
        status: Math.abs(selisih) < 0.01 ? "ok" : "error",
        message: Math.abs(selisih) < 0.01 ? "Aset = Kewajiban + Aset Neto ✓" : `Selisih Rp ${Math.abs(selisih).toLocaleString("id-ID")}`,
        details: [`Aset: Rp ${totalA.toLocaleString("id-ID")}`, `Kewajiban + Aset Neto: Rp ${totalKAN.toLocaleString("id-ID")}`],
      });
      tick();
    }

    setResults(checks);
    setRunning(false);
    toast.success("Pengecekan selesai");
  };

  const countByStatus = (s: Status) => results.filter(r => r.status === s).length;

  const exportReport = () => {
    const data = results.map(r => ({
      Pengecekan: r.title, Status: r.status.toUpperCase(), Pesan: r.message, Detail: r.details?.join("\n") || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cek Kesehatan");
    XLSX.writeFile(wb, `cek_kesehatan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const StatusIcon = ({ status }: { status: Status }) => {
    if (status === "ok") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    if (status === "error") return <XCircle className="h-5 w-5 text-destructive" />;
    return <div className="h-5 w-5 rounded-full bg-muted" />;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cek Kesehatan Data Keuangan</h1>
        <p className="text-sm text-muted-foreground">Verifikasi integritas dan kelengkapan data keuangan</p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={runChecks} disabled={running}>
          {running ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Memeriksa...</> : <><Play className="mr-2 h-4 w-4" />Jalankan Cek</>}
        </Button>
        {results.length > 0 && (
          <Button variant="outline" onClick={exportReport}><Download className="mr-2 h-4 w-4" />Download Laporan</Button>
        )}
      </div>

      {running && <Progress value={progress} className="h-2" />}

      {results.length > 0 && (
        <div className="flex gap-3">
          <Badge variant="default" className="bg-green-600">{countByStatus("ok")} OK</Badge>
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">{countByStatus("warning")} Perhatian</Badge>
          <Badge variant="destructive">{countByStatus("error")} Error</Badge>
        </div>
      )}

      <div className="grid gap-4">
        {results.map((r, i) => (
          <Card key={i} className={r.status === "error" ? "border-destructive/50" : r.status === "warning" ? "border-yellow-500/50" : ""}>
            <CardHeader className="py-4">
              <CardTitle className="flex items-center gap-3 text-base">
                <StatusIcon status={r.status} />
                <span className="flex-1">{r.title}</span>
                <Badge variant={r.status === "ok" ? "default" : r.status === "warning" ? "secondary" : "destructive"}>
                  {r.status === "ok" ? "OK" : r.status === "warning" ? "Perhatian" : "Error"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <p className="text-sm">{r.message}</p>
              {r.details && r.details.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/50 rounded p-2">
                  {r.details.map((d, j) => <p key={j}>{d}</p>)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
