import type { SupabaseClient } from "@supabase/supabase-js";

export interface NISComponents {
  npsn4: string;
  nomorUrut: string;
  kodeRombel: string;
  tahun2: string;
}

/**
 * Ekstrak kode rombel dari huruf terakhir nama kelas.
 * "1A" → 1, "2B" → 2, dst.
 */
export function getKodeRombel(namaKelas: string): number | null {
  const lastChar = namaKelas.trim().slice(-1).toUpperCase();
  const code = lastChar.charCodeAt(0) - 64;
  return code >= 1 && code <= 26 ? code : null;
}

/**
 * Parse komponen NIS dari data mentah.
 */
export function parseNISComponents(
  npsn: string,
  namaKelas: string,
  namaAngkatan: string,
  nomorUrut: number
): NISComponents {
  const npsn4 = npsn.slice(-4);
  const tahunMatch = namaAngkatan.trim().match(/\d{4}/);
  const tahun2 = tahunMatch ? tahunMatch[0].slice(-2) : namaAngkatan.trim().slice(-2);
  const rombel = getKodeRombel(namaKelas);
  return {
    npsn4,
    nomorUrut: String(nomorUrut).padStart(3, "0"),
    kodeRombel: String(rombel ?? 0),
    tahun2,
  };
}

/**
 * Generate preview string NIS 10 digit.
 */
export function generateNISPreview(
  npsn: string,
  namaKelas: string,
  namaAngkatan: string,
  nomorUrut: number
): string {
  const c = parseNISComponents(npsn, namaKelas, namaAngkatan, nomorUrut);
  return `${c.npsn4}${c.nomorUrut}${c.kodeRombel}${c.tahun2}`;
}

/**
 * Panggil edge function generate-nis untuk generate & simpan NIS.
 */
export async function generateNISViaEdgeFunction(
  supabase: SupabaseClient,
  payload: {
    siswa_id: string;
    departemen_id: string;
    angkatan_id: string;
    kelas_id: string;
  }
): Promise<{ nis: string }> {
  const { data, error } = await supabase.functions.invoke("generate-nis", {
    body: payload,
  });
  if (error) throw new Error(error.message || "Gagal generate NIS");
  if (data?.error) throw new Error(data.error);
  return { nis: data.nis };
}
