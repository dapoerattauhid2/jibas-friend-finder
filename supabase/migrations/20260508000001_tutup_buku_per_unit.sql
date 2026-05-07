-- 1. Tambah kolom unit ke log_tutup_buku
--    Menyimpan nama unit yang diproses: 'unit_pendidikan' atau 'unit_usaha_dana'
ALTER TABLE public.log_tutup_buku
  ADD COLUMN IF NOT EXISTS unit text;

COMMENT ON COLUMN public.log_tutup_buku.unit IS
  'Unit yang diproses: unit_pendidikan | unit_usaha_dana | null (legacy = semua unit)';

-- 2. RPC: hitung_saldo_akun_per_kategori
--    Menghitung total debit & kredit per akun, difilter berdasarkan kategori departemen.
--    Dipakai oleh proses tutup buku per unit agar tidak mencampur lintas unit.
CREATE OR REPLACE FUNCTION public.hitung_saldo_akun_per_kategori(
  p_tanggal_mulai   date,
  p_tanggal_selesai date,
  p_kategori        text[]   -- contoh: ARRAY['unit_pendidikan'] atau ARRAY['unit_usaha','unit_dana_terikat','unit_yayasan']
)
RETURNS TABLE (
  akun_id     uuid,
  total_debit numeric,
  total_kredit numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    jd.akun_id,
    COALESCE(SUM(jd.debit),  0) AS total_debit,
    COALESCE(SUM(jd.kredit), 0) AS total_kredit
  FROM jurnal_detail jd
  JOIN jurnal j ON j.id = jd.jurnal_id
  JOIN departemen d ON d.id = j.departemen_id
  WHERE j.tanggal BETWEEN p_tanggal_mulai AND p_tanggal_selesai
    AND j.status = 'posted'
    AND d.kategori = ANY(p_kategori)
  GROUP BY jd.akun_id;
$$;

GRANT EXECUTE ON FUNCTION public.hitung_saldo_akun_per_kategori TO authenticated;
