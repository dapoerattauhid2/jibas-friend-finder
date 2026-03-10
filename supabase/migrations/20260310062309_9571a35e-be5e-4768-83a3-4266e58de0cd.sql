
-- Tabel tarif tagihan fleksibel: bisa per siswa, per kelas, per tahun ajaran, atau kombinasinya
CREATE TABLE public.tarif_tagihan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis_id uuid NOT NULL REFERENCES public.jenis_pembayaran(id) ON DELETE CASCADE,
  siswa_id uuid REFERENCES public.siswa(id) ON DELETE CASCADE,
  kelas_id uuid REFERENCES public.kelas(id) ON DELETE CASCADE,
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id) ON DELETE CASCADE,
  nominal numeric NOT NULL DEFAULT 0,
  keterangan text,
  aktif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index untuk query cepat
CREATE INDEX idx_tarif_jenis ON public.tarif_tagihan(jenis_id);
CREATE INDEX idx_tarif_siswa ON public.tarif_tagihan(siswa_id);
CREATE INDEX idx_tarif_kelas ON public.tarif_tagihan(kelas_id);
CREATE INDEX idx_tarif_tahun ON public.tarif_tagihan(tahun_ajaran_id);

-- Unique constraint: satu kombinasi jenis+siswa+kelas+tahun hanya boleh 1 tarif
CREATE UNIQUE INDEX uq_tarif_kombinasi ON public.tarif_tagihan(
  jenis_id,
  COALESCE(siswa_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(kelas_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(tahun_ajaran_id, '00000000-0000-0000-0000-000000000000')
);

-- RLS
ALTER TABLE public.tarif_tagihan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_keuangan_manage_tarif" ON public.tarif_tagihan
  FOR ALL TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'))
  WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'));

CREATE POLICY "auth_read_tarif" ON public.tarif_tagihan
  FOR SELECT TO authenticated
  USING (true);

-- Trigger updated_at
CREATE TRIGGER set_tarif_updated_at
  BEFORE UPDATE ON public.tarif_tagihan
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Function untuk mendapatkan nominal tagihan siswa dengan prioritas: siswa+kelas+tahun > siswa+tahun > siswa > kelas+tahun > kelas > tahun > default
CREATE OR REPLACE FUNCTION public.get_tarif_siswa(
  p_jenis_id uuid,
  p_siswa_id uuid,
  p_kelas_id uuid DEFAULT NULL,
  p_tahun_ajaran_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- Prioritas 1: per siswa + kelas + tahun ajaran
    (SELECT nominal FROM tarif_tagihan 
     WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id = p_kelas_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- Prioritas 2: per siswa + tahun ajaran
    (SELECT nominal FROM tarif_tagihan 
     WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id IS NULL AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- Prioritas 3: per siswa saja
    (SELECT nominal FROM tarif_tagihan 
     WHERE jenis_id = p_jenis_id AND siswa_id = p_siswa_id AND kelas_id IS NULL AND tahun_ajaran_id IS NULL AND aktif = true
     LIMIT 1),
    -- Prioritas 4: per kelas + tahun ajaran
    (SELECT nominal FROM tarif_tagihan 
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id = p_kelas_id AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- Prioritas 5: per kelas saja
    (SELECT nominal FROM tarif_tagihan 
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id = p_kelas_id AND tahun_ajaran_id IS NULL AND aktif = true
     LIMIT 1),
    -- Prioritas 6: per tahun ajaran saja
    (SELECT nominal FROM tarif_tagihan 
     WHERE jenis_id = p_jenis_id AND siswa_id IS NULL AND kelas_id IS NULL AND tahun_ajaran_id = p_tahun_ajaran_id AND aktif = true
     LIMIT 1),
    -- Default: dari jenis_pembayaran
    (SELECT nominal FROM jenis_pembayaran WHERE id = p_jenis_id)
  )
$$;
