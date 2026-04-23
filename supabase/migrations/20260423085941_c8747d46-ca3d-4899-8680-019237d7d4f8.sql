CREATE TABLE IF NOT EXISTS public.audit_keuangan (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tabel_sumber text NOT NULL,
  record_id text NOT NULL,
  aksi text NOT NULL,
  data_lama jsonb,
  data_baru jsonb,
  keterangan text,
  departemen_id uuid REFERENCES public.departemen(id),
  dibuat_oleh uuid,
  nama_pengguna text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_keuangan_tabel ON public.audit_keuangan(tabel_sumber);
CREATE INDEX IF NOT EXISTS idx_audit_keuangan_created_at ON public.audit_keuangan(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_keuangan_aksi ON public.audit_keuangan(aksi);
CREATE INDEX IF NOT EXISTS idx_audit_keuangan_record_id ON public.audit_keuangan(record_id);

ALTER TABLE public.audit_keuangan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_keuangan_select" ON public.audit_keuangan
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_kepala(auth.uid())
    OR public.has_role(auth.uid(), 'keuangan')
  );

CREATE POLICY "audit_keuangan_insert" ON public.audit_keuangan
  FOR INSERT TO authenticated
  WITH CHECK (dibuat_oleh = auth.uid() OR dibuat_oleh IS NULL);