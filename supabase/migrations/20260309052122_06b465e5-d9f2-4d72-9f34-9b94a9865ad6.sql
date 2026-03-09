
-- Table for tracking remedial & pengayaan
CREATE TABLE public.remedial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id) ON DELETE CASCADE NOT NULL,
  kd_id uuid REFERENCES public.kompetensi_dasar(id) ON DELETE CASCADE NOT NULL,
  kelas_id uuid REFERENCES public.kelas(id),
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  semester_id uuid REFERENCES public.semester(id),
  nilai_awal numeric,
  nilai_remedial numeric,
  jenis text NOT NULL DEFAULT 'remedial', -- 'remedial' or 'pengayaan'
  tanggal date DEFAULT CURRENT_DATE,
  keterangan text,
  status text DEFAULT 'belum', -- 'belum', 'selesai'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.remedial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin guru manage remedial" ON public.remedial
  FOR ALL TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'guru'))
  WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'guru'));

CREATE POLICY "Auth read remedial" ON public.remedial
  FOR SELECT TO authenticated
  USING (true);
