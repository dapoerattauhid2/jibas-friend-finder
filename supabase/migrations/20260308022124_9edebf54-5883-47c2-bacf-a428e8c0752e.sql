
-- Unique constraints for upsert
ALTER TABLE public.presensi_siswa
ADD CONSTRAINT uq_presensi_siswa_harian UNIQUE (siswa_id, kelas_id, tanggal);

ALTER TABLE public.penilaian
ADD CONSTRAINT uq_penilaian UNIQUE (siswa_id, mapel_id, kelas_id, tahun_ajaran_id, semester_id, jenis_ujian);

-- CBE Tables
CREATE TABLE public.kkm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapel_id uuid REFERENCES public.mata_pelajaran(id) ON DELETE CASCADE,
  kelas_id uuid REFERENCES public.kelas(id) ON DELETE CASCADE,
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  semester_id uuid REFERENCES public.semester(id),
  nilai_kkm numeric(5,2) DEFAULT 70,
  UNIQUE (mapel_id, kelas_id, tahun_ajaran_id, semester_id)
);

CREATE TABLE public.kompetensi_dasar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapel_id uuid REFERENCES public.mata_pelajaran(id) ON DELETE CASCADE,
  kode_kd text NOT NULL,
  deskripsi text NOT NULL,
  semester_id uuid REFERENCES public.semester(id),
  urutan int DEFAULT 1,
  aktif boolean DEFAULT true
);

CREATE TABLE public.nilai_kd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siswa_id uuid REFERENCES public.siswa(id),
  kd_id uuid REFERENCES public.kompetensi_dasar(id),
  kelas_id uuid REFERENCES public.kelas(id),
  tahun_ajaran_id uuid REFERENCES public.tahun_ajaran(id),
  semester_id uuid REFERENCES public.semester(id),
  nilai numeric(5,2),
  keterangan text,
  UNIQUE (siswa_id, kd_id, kelas_id, tahun_ajaran_id, semester_id)
);

ALTER TABLE public.kkm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kompetensi_dasar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nilai_kd ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read kkm" ON public.kkm FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage kkm" ON public.kkm FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read kd" ON public.kompetensi_dasar FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin guru manage kd" ON public.kompetensi_dasar FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'));

CREATE POLICY "Auth read nilai_kd" ON public.nilai_kd FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin guru manage nilai_kd" ON public.nilai_kd FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'guru'));

-- SIMTAKA Tables
CREATE TABLE public.koleksi_buku (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text UNIQUE,
  judul text NOT NULL,
  pengarang text,
  penerbit text,
  tahun_terbit int,
  isbn text,
  kategori text,
  jumlah_total int DEFAULT 1,
  jumlah_tersedia int DEFAULT 1,
  lokasi text,
  foto_url text,
  deskripsi text,
  aktif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.peminjaman (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  koleksi_id uuid REFERENCES public.koleksi_buku(id),
  peminjam_id uuid NOT NULL,
  peminjam_tipe text DEFAULT 'siswa',
  tanggal_pinjam date NOT NULL DEFAULT current_date,
  tanggal_kembali_rencana date NOT NULL,
  tanggal_kembali_aktual date,
  status text DEFAULT 'dipinjam',
  denda numeric(10,2) DEFAULT 0,
  petugas_id uuid REFERENCES public.pegawai(id),
  keterangan text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.koleksi_buku ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peminjaman ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read koleksi" ON public.koleksi_buku FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pustakawan manage koleksi" ON public.koleksi_buku FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'pustakawan'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'pustakawan'));

CREATE POLICY "Auth read peminjaman" ON public.peminjaman FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pustakawan manage peminjaman" ON public.peminjaman FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'pustakawan'))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()) OR public.has_role(auth.uid(), 'pustakawan'));

-- Buletin Table
CREATE TABLE public.pengumuman (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul text NOT NULL,
  konten text NOT NULL,
  kategori text DEFAULT 'umum',
  target_tipe text DEFAULT 'semua',
  target_id uuid,
  tanggal_tayang date DEFAULT current_date,
  tanggal_kadaluarsa date,
  penulis_id uuid REFERENCES public.users_profile(id),
  departemen_id uuid REFERENCES public.departemen(id),
  penting boolean DEFAULT false,
  aktif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pengumuman ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read pengumuman" ON public.pengumuman
  FOR SELECT TO authenticated USING (aktif = true AND tanggal_tayang <= current_date);
CREATE POLICY "Admin manage pengumuman" ON public.pengumuman FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()));

-- Kepegawaian Riwayat Tables
CREATE TABLE public.riwayat_jabatan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  jabatan text NOT NULL,
  unit_kerja text,
  tmt date,
  sampai date,
  sk_nomor text,
  sk_tanggal date,
  keterangan text
);

CREATE TABLE public.riwayat_pendidikan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  jenjang text NOT NULL,
  nama_institusi text NOT NULL,
  jurusan text,
  tahun_masuk int,
  tahun_lulus int,
  ijazah_nomor text
);

CREATE TABLE public.riwayat_diklat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id uuid REFERENCES public.pegawai(id) ON DELETE CASCADE,
  nama_diklat text NOT NULL,
  penyelenggara text,
  tanggal_mulai date,
  tanggal_selesai date,
  jam_pelatihan int,
  sertifikat_nomor text
);

ALTER TABLE public.riwayat_jabatan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_pendidikan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_diklat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read riwayat_jabatan" ON public.riwayat_jabatan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage riwayat_jabatan" ON public.riwayat_jabatan FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read riwayat_pendidikan" ON public.riwayat_pendidikan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage riwayat_pendidikan" ON public.riwayat_pendidikan FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth read riwayat_diklat" ON public.riwayat_diklat FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage riwayat_diklat" ON public.riwayat_diklat FOR ALL TO authenticated
  USING (public.is_admin_or_kepala(auth.uid()))
  WITH CHECK (public.is_admin_or_kepala(auth.uid()));
