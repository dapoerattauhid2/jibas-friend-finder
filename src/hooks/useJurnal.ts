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

      const { data: existing } = await supabase
        .from("jurnal")
        .select("status, nomor, keterangan, tanggal, total_debit, total_kredit, referensi")
        .eq("id", values.id)
        .single();
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

      await logAuditKeuangan({
        tabel_sumber: "jurnal",
        record_id: values.id,
        aksi: "UPDATE",
        data_lama: existing,
        data_baru: {
          tanggal: values.tanggal,
          keterangan: values.keterangan,
          referensi: values.referensi,
          total_debit: totalDebit,
          total_kredit: totalKredit,
        },
        keterangan: `Edit jurnal ${(existing as any)?.nomor || values.id}`,
        departemen_id: values.departemen_id,
      });
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
      const { data: existing } = await supabase
        .from("jurnal")
        .select("status, nomor, keterangan, tanggal, total_debit, departemen_id")
        .eq("id", id)
        .single();
      if ((existing as any)?.status === "posted") throw new Error("Jurnal yang sudah diposting tidak bisa dihapus");
      const { error } = await supabase.from("jurnal").delete().eq("id", id);
      if (error) throw error;

      await logAuditKeuangan({
        tabel_sumber: "jurnal",
        record_id: id,
        aksi: "DELETE",
        data_lama: existing,
        keterangan: `Hapus jurnal ${(existing as any)?.nomor || id}`,
        departemen_id: (existing as any)?.departemen_id,
      });
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
      const { data: existing } = await supabase
        .from("jurnal")
        .select("nomor, departemen_id")
        .eq("id", id)
        .single();
      const { error } = await supabase.from("jurnal").update({ status: "posted" }).eq("id", id);
      if (error) throw error;

      await logAuditKeuangan({
        tabel_sumber: "jurnal",
        record_id: id,
        aksi: "POST",
        data_baru: { status: "posted" },
        keterangan: `Posting jurnal ${(existing as any)?.nomor || id}`,
        departemen_id: (existing as any)?.departemen_id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      qc.invalidateQueries({ queryKey: ["buku_besar"] });
      toast.success("Jurnal berhasil diposting");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ─── Audit Keuangan ───
export async function logAuditKeuangan(params: {
  tabel_sumber: string;
  record_id: string;
  aksi: "CREATE" | "UPDATE" | "DELETE" | "POST";
  data_lama?: any;
  data_baru?: any;
  keterangan?: string;
  departemen_id?: string;
  nama_pengguna?: string;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await (supabase.from("audit_keuangan" as any).insert as any)({
      tabel_sumber: params.tabel_sumber,
      record_id: params.record_id,
      aksi: params.aksi,
      data_lama: params.data_lama || null,
      data_baru: params.data_baru || null,
      keterangan: params.keterangan || null,
      departemen_id: params.departemen_id || null,
      dibuat_oleh: user?.id || null,
      nama_pengguna: params.nama_pengguna || user?.email || "System",
    });
  } catch (err) {
    // best-effort; jangan gagalkan operasi utama
    console.warn("logAuditKeuangan failed:", err);
  }
}

export function useAuditKeuangan(filters: {
  tabelSumber?: string;
  aksi?: string;
  tanggalDari?: string;
  tanggalSampai?: string;
  departemenId?: string;
  searchQuery?: string;
}) {
  return useQuery({
    queryKey: ["audit_keuangan", filters],
    queryFn: async () => {
      let q: any = (supabase.from("audit_keuangan" as any).select("*") as any)
        .order("created_at", { ascending: false });

      if (filters.tabelSumber && filters.tabelSumber !== "semua") {
        q = q.eq("tabel_sumber", filters.tabelSumber);
      }
      if (filters.aksi && filters.aksi !== "semua") {
        q = q.eq("aksi", filters.aksi);
      }
      if (filters.tanggalDari) {
        q = q.gte("created_at", `${filters.tanggalDari}T00:00:00`);
      }
      if (filters.tanggalSampai) {
        q = q.lte("created_at", `${filters.tanggalSampai}T23:59:59`);
      }
      if (filters.departemenId) {
        q = q.eq("departemen_id", filters.departemenId);
      }

      const { data, error } = await q.limit(500);
      if (error) throw error;

      let rows = (data || []) as any[];
      if (filters.searchQuery?.trim()) {
        const sq = filters.searchQuery.toLowerCase();
        rows = rows.filter((r: any) =>
          r.record_id?.toLowerCase().includes(sq) ||
          r.keterangan?.toLowerCase().includes(sq) ||
          r.nama_pengguna?.toLowerCase().includes(sq) ||
          JSON.stringify(r.data_lama || {}).toLowerCase().includes(sq) ||
          JSON.stringify(r.data_baru || {}).toLowerCase().includes(sq)
        );
      }
      return rows;
    },
  });
}

// ─── Jurnal Koreksi / Pembalik ───
export function useKoreksiJurnal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      jurnal_asal_id: string;
      tanggal_koreksi: string;
      alasan: string;
      pengganti?: {
        keterangan: string;
        referensi?: string;
        details: { akun_id: string; keterangan?: string; debit: number; kredit: number; urutan: number }[];
      };
    }) => {
      const { data: jurnalAsal, error: e1 } = await supabase
        .from("jurnal")
        .select("*, departemen:departemen_id(nama, kode)")
        .eq("id", values.jurnal_asal_id)
        .single();
      if (e1) throw e1;
      if ((jurnalAsal as any).status !== "posted")
        throw new Error("Hanya jurnal yang sudah diposting yang bisa dikoreksi dengan cara ini.");

      const { data: detailAsal, error: e2 } = await supabase
        .from("jurnal_detail")
        .select("*")
        .eq("jurnal_id", values.jurnal_asal_id)
        .order("urutan");
      if (e2) throw e2;

      await checkPeriodeLocked(values.tanggal_koreksi);

      const tahun = new Date(values.tanggal_koreksi).getFullYear();
      const nomorPembalik = await generateNomorJurnal(tahun);
      const totalAsal = Number((jurnalAsal as any).total_debit) || 0;

      const { data: jurnalPembalik, error: e3 } = await supabase
        .from("jurnal")
        .insert({
          nomor: nomorPembalik,
          tanggal: values.tanggal_koreksi,
          keterangan: `KOREKSI: ${(jurnalAsal as any).keterangan}`,
          referensi: (jurnalAsal as any).nomor,
          departemen_id: (jurnalAsal as any).departemen_id,
          program_dana_id: (jurnalAsal as any).program_dana_id,
          total_debit: totalAsal,
          total_kredit: totalAsal,
          status: "posted",
          tipe: "pembalik",
          jurnal_asal_id: values.jurnal_asal_id,
        } as any)
        .select()
        .single();
      if (e3) throw e3;

      const detailPembalik = (detailAsal as any[]).map((d, i) => ({
        jurnal_id: (jurnalPembalik as any).id,
        akun_id: d.akun_id,
        debit: Number(d.kredit) || 0,
        kredit: Number(d.debit) || 0,
        keterangan: d.keterangan ? `[BALIK] ${d.keterangan}` : "[BALIK]",
        urutan: i + 1,
      }));
      const { error: e4 } = await supabase.from("jurnal_detail").insert(detailPembalik);
      if (e4) throw e4;

      await logAuditKeuangan({
        tabel_sumber: "jurnal",
        record_id: (jurnalPembalik as any).id,
        aksi: "CREATE",
        data_baru: {
          tipe: "pembalik",
          jurnal_asal: (jurnalAsal as any).nomor,
          alasan: values.alasan,
        },
        keterangan: `Jurnal koreksi pembalik untuk ${(jurnalAsal as any).nomor}: ${values.alasan}`,
        departemen_id: (jurnalAsal as any).departemen_id,
      });

      let jurnalPengganti: any = null;
      if (values.pengganti && values.pengganti.details.length > 0) {
        const totalPengganti = values.pengganti.details.reduce((s, d) => s + d.debit, 0);
        const nomorPengganti = await generateNomorJurnal(tahun);

        const { data: jp, error: e5 } = await supabase
          .from("jurnal")
          .insert({
            nomor: nomorPengganti,
            tanggal: values.tanggal_koreksi,
            keterangan: values.pengganti.keterangan,
            referensi: values.pengganti.referensi || (jurnalAsal as any).nomor,
            departemen_id: (jurnalAsal as any).departemen_id,
            program_dana_id: (jurnalAsal as any).program_dana_id,
            total_debit: totalPengganti,
            total_kredit: totalPengganti,
            status: "draft",
            tipe: "pengganti",
            jurnal_asal_id: values.jurnal_asal_id,
          } as any)
          .select()
          .single();
        if (e5) throw e5;

        const rowsPengganti = values.pengganti.details.map((d) => ({
          ...d,
          jurnal_id: (jp as any).id,
        }));
        const { error: e6 } = await supabase.from("jurnal_detail").insert(rowsPengganti);
        if (e6) throw e6;

        jurnalPengganti = jp;

        await logAuditKeuangan({
          tabel_sumber: "jurnal",
          record_id: (jp as any).id,
          aksi: "CREATE",
          data_baru: { tipe: "pengganti", jurnal_asal: (jurnalAsal as any).nomor },
          keterangan: `Jurnal koreksi pengganti untuk ${(jurnalAsal as any).nomor}`,
          departemen_id: (jurnalAsal as any).departemen_id,
        });
      }

      return { jurnalPembalik, jurnalPengganti };
    },
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      qc.invalidateQueries({ queryKey: ["buku_besar"] });
      const pesanPengganti = result.jurnalPengganti
        ? ` dan jurnal pengganti ${(result.jurnalPengganti as any).nomor} (draft) berhasil dibuat`
        : "";
      toast.success(
        `Jurnal pembalik ${(result.jurnalPembalik as any).nomor} berhasil dibuat${pesanPengganti}`
      );
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
