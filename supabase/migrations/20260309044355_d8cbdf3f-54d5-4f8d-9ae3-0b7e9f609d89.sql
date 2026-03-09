-- Table for storing number templates (kuitansi, jurnal, etc.)
CREATE TABLE public.pengaturan_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_template text NOT NULL UNIQUE,
  label text NOT NULL,
  template text NOT NULL DEFAULT '',
  keterangan text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pengaturan_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage pengaturan_template" ON public.pengaturan_template
  FOR ALL TO authenticated
  USING (is_admin_or_kepala(auth.uid()))
  WITH CHECK (is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read pengaturan_template" ON public.pengaturan_template
  FOR SELECT TO authenticated
  USING (true);

-- Seed default templates
INSERT INTO public.pengaturan_template (kode_template, label, template, keterangan) VALUES
  ('nomor_kuitansi', 'Nomor Kuitansi', 'KWT-{TAHUN}-{BULAN}-{NOMOR}', 'Template nomor kuitansi pembayaran. Variabel: {TAHUN}, {BULAN}, {NOMOR}, {LEMBAGA}'),
  ('nomor_jurnal', 'Nomor Jurnal', 'JRN-{TAHUN}-{NOMOR}', 'Template nomor jurnal umum. Variabel: {TAHUN}, {BULAN}, {NOMOR}, {LEMBAGA}'),
  ('prefix_jurnal_bayar', 'Prefix Jurnal Pembayaran', 'BYR', 'Prefix untuk jurnal otomatis dari pembayaran'),
  ('prefix_jurnal_keluar', 'Prefix Jurnal Pengeluaran', 'KLR', 'Prefix untuk jurnal otomatis dari pengeluaran'),
  ('prefix_jurnal_online', 'Prefix Jurnal Online Payment', 'OPY', 'Prefix untuk jurnal otomatis dari pembayaran online');

-- Create trigger for updated_at
CREATE TRIGGER set_pengaturan_template_updated_at
  BEFORE UPDATE ON public.pengaturan_template
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();