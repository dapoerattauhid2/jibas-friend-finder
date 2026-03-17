
-- 1. Add pengaturan_akun for Pendapatan Diterima di Muka
INSERT INTO public.pengaturan_akun (kode_setting, label, keterangan)
VALUES ('AKUN_PENDAPATAN_DIMUKA', 'Akun Pendapatan Diterima di Muka (Liabilitas)', 'Akun liabilitas untuk pembayaran SPP tahun ajaran mendatang yang belum diakui sebagai pendapatan')
ON CONFLICT DO NOTHING;

-- 2. Create pendapatan_dimuka table to track unrecognized advance payments
CREATE TABLE IF NOT EXISTS public.pendapatan_dimuka (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pembayaran_id uuid REFERENCES public.pembayaran(id) ON DELETE CASCADE NOT NULL,
  siswa_id uuid REFERENCES public.siswa(id) ON DELETE CASCADE NOT NULL,
  jenis_id uuid REFERENCES public.jenis_pembayaran(id) NOT NULL,
  tahun_ajaran_pembayaran_id uuid REFERENCES public.tahun_ajaran(id) NOT NULL,
  tahun_ajaran_target_id uuid REFERENCES public.tahun_ajaran(id) NOT NULL,
  bulan integer,
  jumlah numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  jurnal_pengakuan_id uuid REFERENCES public.jurnal(id),
  tanggal_pengakuan date,
  created_at timestamptz NOT NULL DEFAULT now(),
  departemen_id uuid REFERENCES public.departemen(id)
);

-- 3. Enable RLS
ALTER TABLE public.pendapatan_dimuka ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
CREATE POLICY "admin_keuangan_manage_pendapatan_dimuka" ON public.pendapatan_dimuka
  FOR ALL TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'))
  WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));

CREATE POLICY "kasir_read_pendapatan_dimuka" ON public.pendapatan_dimuka
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'kasir'));

-- 5. Add validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_pendapatan_dimuka_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'diakui') THEN
    RAISE EXCEPTION 'status pendapatan_dimuka harus pending atau diakui';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_pendapatan_dimuka_status
  BEFORE INSERT OR UPDATE ON public.pendapatan_dimuka
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_pendapatan_dimuka_status();
