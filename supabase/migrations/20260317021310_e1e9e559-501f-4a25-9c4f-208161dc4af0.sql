
-- 1. Add 'ditutup' column to tahun_ajaran
ALTER TABLE public.tahun_ajaran ADD COLUMN IF NOT EXISTS ditutup boolean NOT NULL DEFAULT false;

-- 2. Create log_tutup_buku table for audit trail
CREATE TABLE IF NOT EXISTS public.log_tutup_buku (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  tanggal_proses timestamptz NOT NULL DEFAULT now(),
  total_laba_rugi numeric NOT NULL DEFAULT 0,
  jurnal_id uuid REFERENCES public.jurnal(id),
  keterangan text
);

-- 3. Enable RLS on log_tutup_buku
ALTER TABLE public.log_tutup_buku ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for log_tutup_buku
CREATE POLICY "admin_keuangan_manage_log_tutup_buku" ON public.log_tutup_buku
  FOR ALL TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'))
  WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));

CREATE POLICY "admin_keuangan_read_log_tutup_buku" ON public.log_tutup_buku
  FOR SELECT TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));

-- 5. Insert AKUN_LABA_DITAHAN setting if not exists
INSERT INTO public.pengaturan_akun (kode_setting, label, keterangan)
VALUES ('AKUN_LABA_DITAHAN', 'Akun Laba Ditahan (Ekuitas)', 'Akun ekuitas untuk menampung laba/rugi pada proses tutup buku')
ON CONFLICT DO NOTHING;

-- 6. Create helper function to check if a date falls in a closed period
CREATE OR REPLACE FUNCTION public.is_periode_ditutup(p_tanggal date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tahun_ajaran
    WHERE ditutup = true
      AND p_tanggal >= tanggal_mulai
      AND p_tanggal <= tanggal_selesai
  )
$$;
