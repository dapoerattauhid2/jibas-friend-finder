
-- 1. Add ISAK 35 columns to akun_rekening
ALTER TABLE akun_rekening
  ADD COLUMN IF NOT EXISTS pos_isak35 varchar(30),
  ADD COLUMN IF NOT EXISTS urutan_isak35 int,
  ADD COLUMN IF NOT EXISTS kode_isak35 varchar(10);

-- 2. Create aset_tetap table
CREATE TABLE IF NOT EXISTS aset_tetap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departemen_id uuid REFERENCES departemen(id),
  jenis_aset varchar(100) NOT NULL,
  tanggal_perolehan date NOT NULL,
  umur_ekonomis_bulan int NOT NULL,
  harga_perolehan numeric(15,2) NOT NULL,
  keterangan text,
  aktif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE aset_tetap ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aset_tetap_all" ON aset_tetap FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Create saldo_awal_isak35 table
CREATE TABLE IF NOT EXISTS saldo_awal_isak35 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departemen_id uuid REFERENCES departemen(id),
  tahun int NOT NULL,
  akun_id uuid REFERENCES akun_rekening(id),
  saldo numeric(15,2) DEFAULT 0,
  UNIQUE(departemen_id, tahun, akun_id)
);
ALTER TABLE saldo_awal_isak35 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saldo_awal_all" ON saldo_awal_isak35 FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Insert 35 ISAK 35 standard accounts
INSERT INTO akun_rekening (kode, nama, jenis, saldo_normal, kode_isak35, pos_isak35, urutan_isak35, aktif)
VALUES
  ('1-111','Kas dan Setara Kas','aset','D','1-111','aset_lancar',10,true),
  ('1-112','Piutang','aset','D','1-112','aset_lancar',20,true),
  ('1-113','Investasi Jangka Pendek','aset','D','1-113','aset_lancar',30,true),
  ('1-114','Persediaan','aset','D','1-114','aset_lancar',40,true),
  ('1-115','Aset Lancar Lain','aset','D','1-115','aset_lancar',50,true),
  ('1-211','Properti Investasi','aset','D','1-211','aset_tidak_lancar',60,true),
  ('1-212','Investasi Jangka Panjang','aset','D','1-212','aset_tidak_lancar',70,true),
  ('1-213','Aset Tetap','aset','D','1-213','aset_tidak_lancar',80,true),
  ('1-214','Akm. Penyusutan Aset Tetap','aset','K','1-214','aset_tidak_lancar',90,true),
  ('2-111','Pendapatan Diterima Dimuka','liabilitas','K','2-111','liabilitas_jangka_pendek',100,true),
  ('2-112','Utang Jangka Pendek','liabilitas','K','2-112','liabilitas_jangka_pendek',110,true),
  ('2-113','Utang Jangka Panjang','liabilitas','K','2-113','liabilitas_jangka_panjang',120,true),
  ('2-114','Liabilitas Imbalan Kerja','liabilitas','K','2-114','liabilitas_jangka_panjang',130,true),
  ('2-115','Surplus Akumulasian','ekuitas','K','2-115','aset_neto',140,true),
  ('4-114','Sumbangan','pendapatan','K','4-114','pendapatan',150,true),
  ('4-115','Jasa Layanan','pendapatan','K','4-115','pendapatan',160,true),
  ('4-116','Penghasilan Investasi Jangka Pendek','pendapatan','K','4-116','pendapatan',170,true),
  ('4-117','Penghasilan Investasi Jangka Panjang','pendapatan','K','4-117','pendapatan',180,true),
  ('4-118','Pendapatan Lain-lain','pendapatan','K','4-118','pendapatan',190,true),
  ('5-111','Beban Gaji dan Upah','beban','D','5-111','beban',200,true),
  ('5-112','Beban Listrik, Internet, Air','beban','D','5-112','beban',210,true),
  ('5-113','Beban Fotokopi','beban','D','5-113','beban',220,true),
  ('5-114','Beban Konsumsi','beban','D','5-114','beban',230,true),
  ('5-115','Beban Perbaikan','beban','D','5-115','beban',240,true),
  ('5-116','Beban Transport','beban','D','5-116','beban',250,true),
  ('5-117','Beban Jasa dan Profesional','beban','D','5-117','beban',260,true),
  ('5-118','Beban Kebersihan','beban','D','5-118','beban',270,true),
  ('5-119','Beban Administrasi dan Umum','beban','D','5-119','beban',280,true),
  ('5-120','Beban Depresiasi','beban','D','5-120','beban',290,true),
  ('5-121','Beban Lain-lain','beban','D','5-121','beban',300,true),
  ('5-122','Kerugian Akibat Kebakaran','beban','D','5-122','beban',310,true),
  ('4-119','Sumbangan (Terbatas)','pendapatan','K','4-119','pendapatan_terbatas',320,true),
  ('4-120','Penghasilan Investasi (Terbatas)','pendapatan','K','4-120','pendapatan_terbatas',330,true),
  ('5-123','Kerugian KAK (Terbatas)','beban','D','5-123','beban_terbatas',340,true),
  ('5-124','Penghasilan Komprehensif Lain','pendapatan','K','5-124','pkl',350,true)
ON CONFLICT (kode) DO UPDATE SET
  pos_isak35 = EXCLUDED.pos_isak35,
  urutan_isak35 = EXCLUDED.urutan_isak35,
  kode_isak35 = EXCLUDED.kode_isak35;
