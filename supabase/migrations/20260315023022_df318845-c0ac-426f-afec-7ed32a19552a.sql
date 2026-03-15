
-- Tabel tagihan untuk pencatatan piutang
CREATE TABLE public.tagihan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid NOT NULL REFERENCES public.siswa(id) ON DELETE CASCADE,
  jenis_id uuid NOT NULL REFERENCES public.jenis_pembayaran(id) ON DELETE RESTRICT,
  tahun_ajaran_id uuid NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE RESTRICT,
  kelas_id uuid REFERENCES public.kelas(id) ON DELETE SET NULL,
  bulan integer, -- null untuk tipe sekali bayar
  nominal numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'belum_bayar', -- belum_bayar | lunas
  jurnal_piutang_id uuid REFERENCES public.jurnal(id) ON DELETE SET NULL,
  pembayaran_id uuid REFERENCES public.pembayaran(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tagihan_unique UNIQUE (siswa_id, jenis_id, tahun_ajaran_id, bulan)
);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_tagihan_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('belum_bayar', 'lunas') THEN
    RAISE EXCEPTION 'status tagihan harus belum_bayar atau lunas';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_tagihan_status
  BEFORE INSERT OR UPDATE ON public.tagihan
  FOR EACH ROW EXECUTE FUNCTION public.validate_tagihan_status();

-- Enable RLS
ALTER TABLE public.tagihan ENABLE ROW LEVEL SECURITY;

-- Admin/keuangan full access
CREATE POLICY "admin_keuangan_manage_tagihan"
ON public.tagihan FOR ALL TO authenticated
USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'))
WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));

-- Kasir can read tagihan
CREATE POLICY "kasir_read_tagihan"
ON public.tagihan FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'kasir'));

-- Siswa can read own tagihan
CREATE POLICY "siswa_read_own_tagihan"
ON public.tagihan FOR SELECT TO authenticated
USING (is_own_siswa(auth.uid(), siswa_id));

-- Ortu can read child's tagihan
CREATE POLICY "ortu_read_tagihan"
ON public.tagihan FOR SELECT TO authenticated
USING (is_ortu_of(auth.uid(), siswa_id));

-- Index for performance
CREATE INDEX idx_tagihan_siswa_jenis ON public.tagihan(siswa_id, jenis_id, tahun_ajaran_id, bulan);
CREATE INDEX idx_tagihan_status ON public.tagihan(status);
