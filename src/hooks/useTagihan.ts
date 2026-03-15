import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useTagihanList(filters?: {
  tahun_ajaran_id?: string;
  jenis_id?: string;
  status?: string;
  siswa_id?: string;
}) {
  return useQuery({
    queryKey: ["tagihan", filters],
    queryFn: async () => {
      let q = supabase
        .from("tagihan")
        .select("*, siswa:siswa_id(id, nama, nis), jenis:jenis_id(id, nama, tipe), tahun_ajaran:tahun_ajaran_id(id, nama), kelas:kelas_id(id, nama)")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters?.tahun_ajaran_id) q = q.eq("tahun_ajaran_id", filters.tahun_ajaran_id);
      if (filters?.jenis_id) q = q.eq("jenis_id", filters.jenis_id);
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.siswa_id) q = q.eq("siswa_id", filters.siswa_id);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useTagihanBySiswa(siswaId?: string, jenisId?: string, bulan?: number) {
  return useQuery({
    queryKey: ["tagihan", "siswa", siswaId, jenisId, bulan],
    enabled: !!siswaId && !!jenisId,
    queryFn: async () => {
      let q = supabase
        .from("tagihan")
        .select("id, nominal, status, jurnal_piutang_id")
        .eq("siswa_id", siswaId!)
        .eq("jenis_id", jenisId!)
        .eq("status", "belum_bayar");

      if (bulan != null) {
        q = q.eq("bulan", bulan);
      } else {
        q = q.is("bulan", null);
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });
}

export function useGenerateTagihan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tahun_ajaran_id: string;
      jenis_id: string;
      bulan?: number;
      departemen_id?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("generate-tagihan", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tagihan"] });
      qc.invalidateQueries({ queryKey: ["jurnal"] });
      toast.success(`Tagihan berhasil di-generate: ${data.generated} siswa baru, ${data.skipped} sudah ada`);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateTagihanLunas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pembayaran_id }: { id: string; pembayaran_id: string }) => {
      const { error } = await supabase
        .from("tagihan")
        .update({ status: "lunas", pembayaran_id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tagihan"] });
    },
  });
}
