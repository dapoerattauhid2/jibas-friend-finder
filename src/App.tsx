import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import ProtectedPortalRoute from "@/components/auth/ProtectedPortalRoute";
import PortalLayout from "@/components/layout/PortalLayout";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import Dashboard from "./pages/Dashboard";
import Akademik from "./pages/Akademik";
import DaftarSiswa from "./pages/akademik/DaftarSiswa";
import FormSiswa from "./pages/akademik/FormSiswa";
import DetailSiswa from "./pages/akademik/DetailSiswa";
import MutasiSiswa from "./pages/akademik/MutasiSiswa";
import PSB from "./pages/akademik/PSB";
import JadwalPelajaran from "./pages/akademik/JadwalPelajaran";
import PresensiSiswa from "./pages/akademik/PresensiSiswa";
import Penilaian from "./pages/akademik/Penilaian";
import ReferensiAkademik from "./pages/akademik/ReferensiAkademik";
import Keuangan from "./pages/Keuangan";
import InputPembayaran from "./pages/keuangan/InputPembayaran";
import TunggakanPembayaran from "./pages/keuangan/TunggakanPembayaran";
import InputPengeluaran from "./pages/keuangan/InputPengeluaran";
import TabunganSiswa from "./pages/keuangan/TabunganSiswa";
import LaporanKeuangan from "./pages/keuangan/LaporanKeuangan";
import ReferensiKeuangan from "./pages/keuangan/ReferensiKeuangan";
import JurnalUmum from "./pages/keuangan/JurnalUmum";
import BukuBesar from "./pages/keuangan/BukuBesar";
import Kepegawaian from "./pages/Kepegawaian";
import DataPegawai from "./pages/kepegawaian/DataPegawai";
import PresensiPegawai from "./pages/kepegawaian/PresensiPegawai";
import JadwalPegawai from "./pages/kepegawaian/JadwalPegawai";
import StatistikPegawai from "./pages/kepegawaian/StatistikPegawai";
import CBE from "./pages/CBE";
import Simtaka from "./pages/Simtaka";
import Buletin from "./pages/Buletin";
import Pengaturan from "./pages/Pengaturan";
import DetailPegawai from "./pages/kepegawaian/DetailPegawai";
import LaporanBayarSiswa from "./pages/keuangan/LaporanBayarSiswa";
import LaporanBayarKelas from "./pages/keuangan/LaporanBayarKelas";
import RekapHarian from "./pages/keuangan/RekapHarian";
import PembayaranPSB from "./pages/keuangan/PembayaranPSB";
import TutupBuku from "./pages/keuangan/TutupBuku";
import LaporanPengeluaran from "./pages/keuangan/LaporanPengeluaran";
import LaporanPenerimaanLain from "./pages/keuangan/LaporanPenerimaanLain";
import AuditTrail from "./pages/keuangan/AuditTrail";
import ProfilYayasan from "./pages/pengaturan/ProfilYayasan";
import ManajemenPengguna from "./pages/pengaturan/ManajemenPengguna";
import ManajemenOrtu from "./pages/pengaturan/ManajemenOrtu";
import NotFound from "./pages/NotFound";
// Portal Orang Tua
import PortalLogin from "./pages/portal/PortalLogin";
import PortalDashboard from "./pages/portal/PortalDashboard";
import PortalTagihan from "./pages/portal/PortalTagihan";
import PortalCheckout from "./pages/portal/PortalCheckout";
import PortalRiwayat from "./pages/portal/PortalRiwayat";
import PortalProfil from "./pages/portal/PortalProfil";
import PortalPresensi from "./pages/portal/PortalPresensi";
import PortalNilai from "./pages/portal/PortalNilai";
// Public pages
import InfoGuru from "./pages/InfoGuru";
import Anjungan from "./pages/Anjungan";
// Pengaturan
import NotifikasiGateway from "./pages/pengaturan/NotifikasiGateway";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            {/* Public pages */}
            <Route path="/infoguru" element={<InfoGuru />} />
            <Route path="/anjungan" element={<Anjungan />} />
            {/* Portal Orang Tua */}
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route element={<ProtectedPortalRoute />}>
              <Route element={<PortalLayout />}>
                <Route path="/portal" element={<PortalDashboard />} />
                <Route path="/portal/tagihan" element={<PortalTagihan />} />
                <Route path="/portal/checkout" element={<PortalCheckout />} />
                <Route path="/portal/pembayaran" element={<PortalRiwayat />} />
                <Route path="/portal/presensi" element={<PortalPresensi />} />
                <Route path="/portal/nilai" element={<PortalNilai />} />
                <Route path="/portal/profil" element={<PortalProfil />} />
              </Route>
            </Route>
            {/* Admin */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                {/* Akademik */}
                <Route path="/akademik" element={<Akademik />} />
                <Route path="/akademik/siswa" element={<DaftarSiswa />} />
                <Route path="/akademik/siswa/tambah" element={<FormSiswa />} />
                <Route path="/akademik/siswa/:id" element={<DetailSiswa />} />
                <Route path="/akademik/siswa/:id/edit" element={<FormSiswa />} />
                <Route path="/akademik/mutasi" element={<MutasiSiswa />} />
                <Route path="/akademik/psb" element={<PSB />} />
                <Route path="/akademik/jadwal" element={<JadwalPelajaran />} />
                <Route path="/akademik/presensi" element={<PresensiSiswa />} />
                <Route path="/akademik/penilaian" element={<Penilaian />} />
                <Route path="/akademik/referensi" element={<ReferensiAkademik />} />
                {/* Keuangan - accessible by kasir */}
                <Route path="/keuangan" element={<Keuangan />} />
                <Route path="/keuangan/pembayaran" element={<InputPembayaran />} />
                <Route path="/keuangan/tunggakan" element={<TunggakanPembayaran />} />
                {/* Keuangan - NOT accessible by kasir */}
                <Route element={<ProtectedRoute allowedRoles={["admin", "kepala_sekolah", "keuangan"]} />}>
                  <Route path="/keuangan/pengeluaran" element={<InputPengeluaran />} />
                  <Route path="/keuangan/tabungan" element={<TabunganSiswa />} />
                  <Route path="/keuangan/laporan" element={<LaporanKeuangan />} />
                  <Route path="/keuangan/laporan-siswa" element={<LaporanBayarSiswa />} />
                  <Route path="/keuangan/laporan-kelas" element={<LaporanBayarKelas />} />
                  <Route path="/keuangan/rekap-harian" element={<RekapHarian />} />
                  <Route path="/keuangan/pembayaran-psb" element={<PembayaranPSB />} />
                  <Route path="/keuangan/tutup-buku" element={<TutupBuku />} />
                  <Route path="/keuangan/referensi" element={<ReferensiKeuangan />} />
                  <Route path="/keuangan/jurnal" element={<JurnalUmum />} />
                  <Route path="/keuangan/buku-besar" element={<BukuBesar />} />
                  <Route path="/keuangan/laporan-pengeluaran" element={<LaporanPengeluaran />} />
                  <Route path="/keuangan/penerimaan-lain" element={<LaporanPenerimaanLain />} />
                  <Route path="/keuangan/audit-trail" element={<AuditTrail />} />
                </Route>
                {/* Kepegawaian */}
                <Route path="/kepegawaian" element={<Kepegawaian />} />
                <Route path="/kepegawaian/pegawai" element={<DataPegawai />} />
                <Route path="/kepegawaian/pegawai/:id" element={<DetailPegawai />} />
                <Route path="/kepegawaian/presensi" element={<PresensiPegawai />} />
                <Route path="/kepegawaian/jadwal" element={<JadwalPegawai />} />
                <Route path="/kepegawaian/statistik" element={<StatistikPegawai />} />
                {/* CBE */}
                <Route path="/cbe" element={<CBE />} />
                <Route path="/cbe/:tab" element={<CBE />} />
                {/* SIMTAKA */}
                <Route path="/simtaka" element={<Simtaka />} />
                <Route path="/simtaka/:tab" element={<Simtaka />} />
                {/* Buletin */}
                <Route path="/buletin" element={<Buletin />} />
                {/* Pengaturan */}
                <Route path="/pengaturan" element={<Pengaturan />} />
                <Route path="/pengaturan/sekolah" element={<ProfilYayasan />} />
                <Route path="/pengaturan/pengguna" element={<ManajemenPengguna />} />
                <Route path="/pengaturan/ortu" element={<ManajemenOrtu />} />
                <Route path="/pengaturan/notifikasi" element={<NotifikasiGateway />} />
                <Route path="/pengaturan/:tab" element={<Pengaturan />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
