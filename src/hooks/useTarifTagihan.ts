import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Get nominal for a specific siswa+jenis using DB function get_tarif_siswa
export function useTarifSiswa(jenisId?: string, siswaId?: string, kelasId?: string, tahunAjaranId?: string) {
  return useQuery({
    queryKey: ["tarif_siswa", jenisId, siswaId, kelasId, tahunAjaranId],
    enabled: !!jenisId && !!siswaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tarif_siswa", {
        p_jenis_id: jenisId!,
        p_siswa_id: siswaId!,
        p_kelas_id: kelasId || null,
        p_tahun_ajaran_id: tahunAjaranId || null,
      });
      if (error) throw error;
      return Number(data) || 0;
    },
  });
}

// Batch get tarif for multiple students (client-side, for reports)
export async function getTarifBatch(
  jenisId: string,
  siswaIds: string[],
  kelasId?: string | null,
  tahunAjaranId?: string | null,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  
  // Get all tarif_tagihan entries for this jenis
  const { data: tarifList } = await supabase
    .from("tarif_tagihan")
    .select("siswa_id, kelas_id, tahun_ajaran_id, nominal")
    .eq("jenis_id", jenisId)
    .eq("aktif", true);

  // Get default nominal
  const { data: jenis } = await supabase
    .from("jenis_pembayaran")
    .select("nominal")
    .eq("id", jenisId)
    .single();

  const defaultNominal = Number(jenis?.nominal || 0);

  for (const siswaId of siswaIds) {
    if (!tarifList?.length) {
      result.set(siswaId, defaultNominal);
      continue;
    }

    // Priority: siswa+kelas+tahun > siswa+tahun > siswa > kelas+tahun > kelas > tahun > default
    const match =
      tarifList.find(t => t.siswa_id === siswaId && t.kelas_id === kelasId && t.tahun_ajaran_id === tahunAjaranId) ||
      tarifList.find(t => t.siswa_id === siswaId && !t.kelas_id && t.tahun_ajaran_id === tahunAjaranId) ||
      tarifList.find(t => t.siswa_id === siswaId && !t.kelas_id && !t.tahun_ajaran_id) ||
      tarifList.find(t => !t.siswa_id && t.kelas_id === kelasId && t.tahun_ajaran_id === tahunAjaranId) ||
      tarifList.find(t => !t.siswa_id && t.kelas_id === kelasId && !t.tahun_ajaran_id) ||
      tarifList.find(t => !t.siswa_id && !t.kelas_id && t.tahun_ajaran_id === tahunAjaranId);

    result.set(siswaId, match ? Number(match.nominal) : defaultNominal);
  }

  return result;
}

export function useTarifTagihanList(jenisId?: string) {
  return useQuery({
    queryKey: ["tarif_tagihan", jenisId],
    queryFn: async () => {
      let q = supabase
        .from("tarif_tagihan")
        .select("*, jenis:jenis_id(id, nama), siswa:siswa_id(id, nama, nis), kelas:kelas_id(id, nama), tahun_ajaran:tahun_ajaran_id(id, nama)")
        .eq("aktif", true)
        .order("created_at", { ascending: false });
      if (jenisId) q = q.eq("jenis_id", jenisId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useAllTarifTagihan() {
  return useQuery({
    queryKey: ["tarif_tagihan", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarif_tagihan")
        .select("*, jenis:jenis_id(id, nama, nominal), siswa:siswa_id(id, nama, nis), kelas:kelas_id(id, nama), tahun_ajaran:tahun_ajaran_id(id, nama)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useCreateTarifTagihan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      jenis_id: string;
      siswa_id?: string | null;
      kelas_id?: string | null;
      tahun_ajaran_id?: string | null;
      nominal: number;
      keterangan?: string;
    }) => {
      const { error } = await supabase.from("tarif_tagihan").insert({
        ...values,
        siswa_id: values.siswa_id || null,
        kelas_id: values.kelas_id || null,
        tahun_ajaran_id: values.tahun_ajaran_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarif_tagihan"] });
      toast.success("Tarif tagihan berhasil ditambahkan");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTarifTagihan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: {
      id: string;
      nominal?: number;
      keterangan?: string;
      aktif?: boolean;
    }) => {
      const { error } = await supabase.from("tarif_tagihan").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarif_tagihan"] });
      toast.success("Tarif tagihan berhasil diperbarui");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteTarifTagihan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarif_tagihan").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tarif_tagihan"] });
      toast.success("Tarif tagihan berhasil dihapus");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
