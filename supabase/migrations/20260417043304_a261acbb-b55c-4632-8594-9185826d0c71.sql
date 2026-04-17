
-- Rename setting AKUN_LABA_DITAHAN to AKUN_ASET_NETO_TIDAK_TERIKAT (ISAK 35: nirlaba)
UPDATE public.pengaturan_akun
SET kode_setting = 'AKUN_ASET_NETO_TIDAK_TERIKAT',
    label = 'Akun Aset Neto Tidak Terikat (Ekuitas Nirlaba)',
    keterangan = 'Akun penampung surplus/defisit periode pada saat tutup buku — sesuai ISAK 35.',
    updated_at = now()
WHERE kode_setting = 'AKUN_LABA_DITAHAN';

-- Insert if not exists (in case fresh installs)
INSERT INTO public.pengaturan_akun (kode_setting, label, keterangan)
SELECT 'AKUN_ASET_NETO_TIDAK_TERIKAT', 'Akun Aset Neto Tidak Terikat (Ekuitas Nirlaba)',
       'Akun penampung surplus/defisit periode pada saat tutup buku — sesuai ISAK 35.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pengaturan_akun WHERE kode_setting = 'AKUN_ASET_NETO_TIDAK_TERIKAT'
);
