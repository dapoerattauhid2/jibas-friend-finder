

## Analisis Masalah: Input Pembayaran Tidak Sesuai untuk Tipe "Sekali Bayar"

### Masalah Utama

Halaman `InputPembayaran.tsx` **tidak memeriksa field `tipe`** pada `jenis_pembayaran`. Meskipun database sudah memiliki kolom `tipe` (`bulanan` / `sekali`), UI selalu menampilkan grid 12 bulan untuk semua jenis pembayaran — termasuk Uang Pangkal yang seharusnya sekali bayar.

### Penyebab Teknis

1. **Grid 12 bulan selalu muncul** (baris 281-316): Kondisi render hanya mengecek `jenisId && bulanDibayar`, tanpa memeriksa `selectedJenis?.tipe === 'bulanan'`.

2. **Query tunggakan tidak membedakan tipe**: Query `cek_tunggakan` (baris 59-71) selalu mengambil `bulan` dari pembayaran, padahal untuk tipe `sekali`, field `bulan` tidak relevan.

3. **Submit selalu mengirim `bulan`** (baris 99): Untuk tipe `sekali`, seharusnya `bulan` dikirim sebagai `0` atau `null`.

4. **Kuitansi selalu menampilkan "Bulan"** (baris 390-391): Untuk pembayaran sekali bayar, baris bulan seharusnya disembunyikan.

### Rencana Perbaikan

#### 1. Kondisikan UI berdasarkan `selectedJenis?.tipe`
- Jika `tipe === 'bulanan'`: tampilkan grid 12 bulan seperti sekarang
- Jika `tipe === 'sekali'`: sembunyikan grid bulan, tampilkan status "Sudah Lunas" / "Belum Bayar" saja

#### 2. Perbaiki query tunggakan untuk tipe sekali
- Untuk `tipe === 'sekali'`: cek apakah sudah ada pembayaran (tanpa filter bulan), hitung total yang sudah dibayar vs nominal

#### 3. Perbaiki submit handler
- Untuk `tipe === 'sekali'`: kirim `bulan: 0` (konsisten dengan edge function `rekap-tunggakan`)

#### 4. Perbaiki kuitansi dialog
- Sembunyikan baris "Bulan" jika pembayaran bertipe sekali

#### 5. Perbaiki keterangan jurnal otomatis
- Untuk tipe sekali, hilangkan nama bulan dari keterangan jurnal

### File yang Diubah
- `src/pages/keuangan/InputPembayaran.tsx` — semua perubahan di atas

