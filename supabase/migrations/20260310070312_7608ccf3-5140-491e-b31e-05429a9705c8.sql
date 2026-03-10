-- Fix the view to also match payments where tahun_ajaran_id is NULL
CREATE OR REPLACE VIEW public.v_tagihan_belum_bayar AS
SELECT s.id AS siswa_id,
    s.nis,
    s.nama AS nama_siswa,
    s.jenis_kelamin,
    k.nama AS kelas_nama,
    d.id AS departemen_id,
    d.nama AS departemen_nama,
    d.kode AS departemen_kode,
    jp.id AS jenis_id,
    jp.nama AS jenis_nama,
    jp.nominal,
    ta.id AS tahun_ajaran_id,
    ta.nama AS tahun_ajaran_nama,
    bulan_series.bulan,
    CASE
        WHEN (p.id IS NOT NULL) THEN true
        ELSE false
    END AS sudah_bayar,
    p.id AS pembayaran_id,
    p.tanggal_bayar
FROM siswa s
    JOIN kelas_siswa ks ON ks.siswa_id = s.id AND ks.aktif = true
    JOIN kelas k ON k.id = ks.kelas_id
    JOIN departemen d ON d.id = k.departemen_id
    JOIN jenis_pembayaran jp ON jp.departemen_id = d.id AND jp.aktif = true
    JOIN tahun_ajaran ta ON ta.aktif = true
    CROSS JOIN LATERAL (
        SELECT b.bulan
        FROM generate_series(
            CASE WHEN jp.tipe = 'sekali' THEN 0 ELSE 1 END,
            CASE WHEN jp.tipe = 'sekali' THEN 0 ELSE 12 END
        ) b(bulan)
    ) bulan_series
    LEFT JOIN pembayaran p ON p.siswa_id = s.id 
        AND p.jenis_id = jp.id 
        AND p.bulan = bulan_series.bulan
        AND (p.tahun_ajaran_id = ta.id OR p.tahun_ajaran_id IS NULL)
WHERE s.status = 'aktif'
    AND (jp.tipe = 'sekali' OR bulan_series.bulan <= EXTRACT(month FROM CURRENT_DATE)::integer);