
-- Tabel saldo tabungan pegawai
CREATE TABLE public.tabungan_pegawai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid NOT NULL UNIQUE REFERENCES public.pegawai(id) ON DELETE CASCADE,
  saldo numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tabungan_pegawai ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_keuangan_manage_tabungan_pegawai" ON public.tabungan_pegawai
  FOR ALL TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'::text))
  WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'::text));

CREATE POLICY "pegawai_own_tabungan_select" ON public.tabungan_pegawai
  FOR SELECT TO authenticated
  USING (is_own_pegawai(auth.uid(), pegawai_id));

-- Tabel transaksi tabungan pegawai
CREATE TABLE public.transaksi_tabungan_pegawai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid NOT NULL REFERENCES public.pegawai(id) ON DELETE CASCADE,
  jenis text NOT NULL DEFAULT 'setor',
  jumlah numeric NOT NULL DEFAULT 0,
  saldo_sesudah numeric DEFAULT 0,
  tanggal date NOT NULL DEFAULT CURRENT_DATE,
  keterangan text,
  petugas_id uuid REFERENCES public.pegawai(id),
  jurnal_id uuid REFERENCES public.jurnal(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.transaksi_tabungan_pegawai ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_keuangan_manage_transaksi_tabungan_pegawai" ON public.transaksi_tabungan_pegawai
  FOR ALL TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'::text))
  WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'::text));

CREATE POLICY "pegawai_own_transaksi_tabungan_select" ON public.transaksi_tabungan_pegawai
  FOR SELECT TO authenticated
  USING (is_own_pegawai(auth.uid(), pegawai_id));

-- Tambah kolom jurnal_id ke transaksi_tabungan siswa (untuk tracking auto-jurnal)
ALTER TABLE public.transaksi_tabungan ADD COLUMN IF NOT EXISTS jurnal_id uuid REFERENCES public.jurnal(id);

-- Insert pengaturan akun untuk tabungan pegawai
INSERT INTO public.pengaturan_akun (kode_setting, label, keterangan)
VALUES ('tabungan_pegawai', 'Akun Tabungan Pegawai', 'Akun dana titipan/tabungan pegawai (kewajiban sekolah)')
ON CONFLICT DO NOTHING;
