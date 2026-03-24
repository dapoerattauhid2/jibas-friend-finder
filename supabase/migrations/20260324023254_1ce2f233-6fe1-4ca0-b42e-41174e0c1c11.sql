ALTER TABLE public.siswa_detail 
  ADD COLUMN jenis_pendaftaran text DEFAULT 'baru',
  ADD COLUMN asal_sekolah text,
  ADD COLUMN kelas_terakhir text,
  ADD COLUMN alasan_pindah text;