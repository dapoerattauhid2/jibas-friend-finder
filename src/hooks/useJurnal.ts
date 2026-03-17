import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Akun Rekening ───
export function useAkunRekening() {
  return useQuery({
    queryKey: ["akun_rekening", "aktif"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("akun_rekening")
        .select("*")
        .eq("aktif", true)
        .order("kode");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAllAkunRekening() {
  return useQuery({
    queryKey: ["akun_rekening", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("akun_rekening")
        .select("*")
        .order("kode");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateAkunRekening() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { kode: string; nama: string; jenis: string; saldo_normal: string; saldo_awal?: number; keterangan?: string; aktif?: boolean; departemen_id?: string }) => {
      const { error } = await supabase.from("akun_rekening").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["akun_rekening"] });
      toast.success("Akun rekening berhasil ditambahkan");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateAkunRekening() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; kode?: string; nama?: string; jenis?: string; saldo_normal?: string; saldo_awal?: number; keterangan?: string; aktif?: boolean; departemen_id?: string | null }) => {
      const { error } = await supabase.from("akun_rekening").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["akun_rekening"] });
      toast.success("Akun rekening berhasil diperbarui");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteAkunRekening() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: used } = await supabase
        .from("jurnal_detail")
        .select("id")
        .eq("akun_id", id)
        .limit(1);
      if (used && used.length > 0) throw new Error("Akun ini sudah digunakan dalam jurnal dan tidak bisa dihapus");
      const { error } = await supabase.from("akun_rekening").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["akun_rekening"] });
      toast.success("Akun rekening berhasil dihapus");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Jurnal ───
export function useJurnalList(bulan?: number, tahun?: number, departemenId?: string) {
  return useQuery({
    queryKey: ["jurnal", bulan, tahun, departemenId],
    queryFn: async () => {
      let q = supabase
        .from("jurnal")
        .select("*, departemen:departemen_id(nama, kode)")
        .order("tanggal", { ascending: false });
      if (bulan != null && tahun != null) {
        const start = `${tahun}-${String(bulan).padStart(2, "0")}-01`;
        const endMonth = bulan === 12 ? 1 : bulan + 1;
        const endYear = bulan === 12 ? tahun + 1 : tahun;
        const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        q = q.gte("tanggal", start).lt("tanggal", end);
      }
      if (departemenId) {
        q = q.eq("departemen_id", departemenId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useJurnalDetail(jurnalId?: string) {
  return useQuery({
    queryKey: ["jurnal", "detail", jurnalId],
    enabled: !!jurnalId,
    queryFn: async () => {
      const { data: jurnal, error: jErr } = await supabase
        .from("jurnal")
        .select("*, departemen:departemen_id(nama, kode)")
        .eq("id", jurnalId!)
        .single();
      if (jErr) throw jErr;

      const { data: details, error: dErr } = await supabase
        .from("jurnal_detail")
        .select("*, akun_rekening:akun_id(kode, nama)")
        .eq("jurnal_id", jurnalId!)
        .order("urutan");
      if (dErr) throw dErr;

      return { ...(jurnal as any), details: details as any[] };
    },
  });
}

// ─── Period Lock Check ───
async function checkPeriodeLocked(tanggal: string): Promise<void> {
  const { data } = await supabase
    .from("tahun_ajaran")
    .select("id, nama, ditutup, tanggal_mulai, tanggal_selesai")
    .lte("tanggal_mulai", tanggal)
    .gte("tanggal_selesai", tanggal)
    .limit(1);
  const locked = (data || []).find((d: any) => d.ditutup === true);
  if (locked) {
    throw new Error(`Transaksi ditolak: periode "${(locked as any).nama}" sudah ditutup buku.`);
  }
}

async function generateNomorJurnal(tahun: number): Promise<string> {
  const { data, error } = await supabase.rpc("generate_nomor_jurnal", {
    p_prefix: "JU",
    p_tahun: tahun,
  });
  if (error) throw error;
  if (!data) throw new Error("Gagal mendapatkan nomor jurnal");
  return data;
}

export function useCreateJurnal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      tanggal: string;
      keterangan: string;
      referensi?: string;
      departemen_id?: string;
      details: { akun_id: string; keterangan?: string; debit: number; kredit: number; urutan: number }[];
    }) => {
      const totalDebit = values.details.reduce((s, d) => s + d.debit, 0);
      const totalKredit = values.details.reduce((s, d) => s + d.kredit, 0);
      if (Math.abs(totalDebit - totalKredit) > 0.01) throw new Error("Total debit harus sama dengan total kredit");

      // Check period lock
      await checkPeriodeLocked(values.tanggal);

      const tahun = new Date(values.tanggal).getFullYear();
      const nomor = await generateNomorJurnal(tahun);

      const { data: jurnal, error: jErr } = await supabase
        .from("jurnal")
        .insert({
          nomor,
          tanggal: values.tanggal,
          keterangan: values.keterangan,
          referensi: values.referensi,
          departemen_id: values.departemen_id,
          total_debit: totalDebit,
          total_kredit: totalKredit,
        })
        .select()
        .single();
      if (jErr) throw jErr;

      const rows = values.details.map((d) => ({ ...d, jurnal_id: (jurnal as any).id }));
      const { error: dErr } = await supabase.from("jurnal_detail").insert(rows);
      if (dErr) throw dErr;

      return jurnal;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      toast.success("Jurnal berhasil disimpan");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateJurnal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      id: string;
      tanggal: string;
      keterangan: string;
      referensi?: string;
      departemen_id?: string;
      details: { akun_id: string; keterangan?: string; debit: number; kredit: number; urutan: number }[];
    }) => {
      const totalDebit = values.details.reduce((s, d) => s + d.debit, 0);
      const totalKredit = values.details.reduce((s, d) => s + d.kredit, 0);
      if (Math.abs(totalDebit - totalKredit) > 0.01) throw new Error("Total debit harus sama dengan total kredit");

      // Check period lock
      await checkPeriodeLocked(values.tanggal);

      const { data: existing } = await supabase.from("jurnal").select("status").eq("id", values.id).single();
      if ((existing as any)?.status === "posted") throw new Error("Jurnal yang sudah diposting tidak bisa diedit");

      const { error: jErr } = await supabase
        .from("jurnal")
        .update({
          tanggal: values.tanggal,
          keterangan: values.keterangan,
          referensi: values.referensi,
          departemen_id: values.departemen_id,
          total_debit: totalDebit,
          total_kredit: totalKredit,
        })
        .eq("id", values.id);
      if (jErr) throw jErr;

      await supabase.from("jurnal_detail").delete().eq("jurnal_id", values.id);
      const rows = values.details.map((d) => ({ ...d, jurnal_id: values.id }));
      const { error: dErr } = await supabase.from("jurnal_detail").insert(rows);
      if (dErr) throw dErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      toast.success("Jurnal berhasil diperbarui");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteJurnal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: existing } = await supabase.from("jurnal").select("status").eq("id", id).single();
      if ((existing as any)?.status === "posted") throw new Error("Jurnal yang sudah diposting tidak bisa dihapus");
      const { error } = await supabase.from("jurnal").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      toast.success("Jurnal berhasil dihapus");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function usePostJurnal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jurnal").update({ status: "posted" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      qc.invalidateQueries({ queryKey: ["buku_besar"] });
      toast.success("Jurnal berhasil diposting");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Pengaturan Akun Sistem ───
export function usePengaturanAkun() {
  return useQuery({
    queryKey: ["pengaturan_akun"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pengaturan_akun")
        .select("*, akun:akun_id(id, kode, nama, jenis)")
        .order("kode_setting");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useUpdatePengaturanAkun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kode_setting, akun_id }: { kode_setting: string; akun_id: string | null }) => {
      const { error } = await supabase
        .from("pengaturan_akun")
        .update({ akun_id, updated_at: new Date().toISOString() })
        .eq("kode_setting", kode_setting);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pengaturan_akun"] });
      toast.success("Pengaturan akun berhasil disimpan");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreatePengaturanAkun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { kode_setting: string; label: string; keterangan?: string; akun_id?: string | null }) => {
      const { error } = await supabase.from("pengaturan_akun").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pengaturan_akun"] });
      toast.success("Setting akun berhasil ditambahkan");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeletePengaturanAkun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pengaturan_akun").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pengaturan_akun"] });
      toast.success("Setting akun berhasil dihapus");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Akun by Jenis ───
export function useAkunByJenis(jenis: string) {
  return useQuery({
    queryKey: ["akun_rekening", "jenis", jenis],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("akun_rekening")
        .select("id, kode, nama")
        .eq("jenis", jenis.toLowerCase())
        .eq("aktif", true)
        .order("kode");
      if (error) throw error;
      return data as any[];
    },
  });
}

// ─── Buku Besar ───
export function useBukuBesar(akunId?: string, bulanDari?: number, bulanSampai?: number, tahun?: number) {
  return useQuery({
    queryKey: ["buku_besar", akunId, bulanDari, bulanSampai, tahun],
    enabled: !!akunId,
    queryFn: async () => {
      const y = tahun || new Date().getFullYear();
      let q = supabase
        .from("jurnal_detail")
        .select("*, jurnal:jurnal_id(nomor, tanggal, keterangan, status)")
        .eq("akun_id", akunId!);

      const { data, error } = await q.order("jurnal_id");
      if (error) throw error;

      const startMonth = bulanDari || 1;
      const endMonth = bulanSampai || 12;
      const startDate = `${y}-${String(startMonth).padStart(2, "0")}-01`;
      const endMonthNext = endMonth === 12 ? 1 : endMonth + 1;
      const endYearNext = endMonth === 12 ? y + 1 : y;
      const endDate = `${endYearNext}-${String(endMonthNext).padStart(2, "0")}-01`;

      return (data as any[]).filter((d: any) => {
        const j = d.jurnal;
        if (!j || j.status !== "posted") return false;
        return j.tanggal >= startDate && j.tanggal < endDate;
      }).sort((a: any, b: any) => a.jurnal.tanggal.localeCompare(b.jurnal.tanggal));
    },
  });
}
