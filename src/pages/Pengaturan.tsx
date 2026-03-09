import { useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { School, Users, Database, Info, UserCheck, Download, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ProfilYayasan from "./pengaturan/ProfilYayasan";
import ManajemenPengguna from "./pengaturan/ManajemenPengguna";

const quickLinks = [
  { title: "Profil Yayasan", desc: "Identitas yayasan dan data lembaga", icon: School, tab: "sekolah" },
  { title: "Manajemen Pengguna", desc: "Kelola akun dan hak akses pengguna", icon: Users, tab: "pengguna" },
  { title: "Kelola Orang Tua", desc: "Akun orang tua dan hubungan siswa", icon: UserCheck, tab: "ortu" },
  { title: "Notifikasi Gateway", desc: "Konfigurasi WhatsApp & Telegram", icon: Bell, tab: "notifikasi" },
  { title: "Backup & Export", desc: "Export seluruh data ke Excel", icon: Download, tab: "backup" },
  { title: "Referensi Data", desc: "Kelas, tingkat, angkatan, tahun ajaran", icon: Database, tab: "referensi" },
];

export default function Pengaturan() {
  const { tab } = useParams();
  const navigate = useNavigate();

  if (tab === "sekolah" || (!tab && false)) return <ProfilYayasan />;
  if (tab === "pengguna") return <ManajemenPengguna />;
  if (tab === "referensi") {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Referensi Data</h1>
          <p className="text-sm text-muted-foreground">Informasi pengelolaan data referensi</p>
        </div>
        <Card>
          <CardContent className="flex items-start gap-4 p-5">
            <Info className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Referensi data (kelas, tingkat, angkatan) dikelola di modul <strong>Akademik</strong>.</p>
              <p>Tahun Ajaran dikelola di <strong>Keuangan → Referensi</strong>.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default: show quick-links grid
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Konfigurasi sistem dan yayasan</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((s) => (
          <Card
            key={s.tab}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/pengaturan/${s.tab}`)}
          >
            <CardContent className="flex items-start gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
