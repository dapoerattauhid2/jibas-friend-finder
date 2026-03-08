import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, BookOpen, Calendar, ClipboardList,
  UserPlus, ArrowRightLeft, Clock, Database,
} from "lucide-react";

const subModules = [
  { title: "Data Siswa", desc: "Kelola data siswa dan orang tua", icon: GraduationCap, url: "/akademik/siswa" },
  { title: "Penerimaan Siswa Baru", desc: "Proses pendaftaran siswa baru (PSB)", icon: UserPlus, url: "/akademik/psb" },
  { title: "Mutasi Siswa", desc: "Pindah masuk/keluar dan status siswa", icon: ArrowRightLeft, url: "/akademik/mutasi" },
  { title: "Jadwal Pelajaran", desc: "Atur jadwal kelas dan guru", icon: Calendar, url: "/akademik/jadwal" },
  { title: "Presensi Siswa", desc: "Input dan rekap kehadiran harian", icon: Clock, url: "/akademik/presensi" },
  { title: "Penilaian & Nilai", desc: "Input nilai dan cetak legger", icon: ClipboardList, url: "/akademik/penilaian" },
  { title: "Referensi Akademik", desc: "Mata pelajaran, kelas, tingkat", icon: Database, url: "/akademik/referensi" },
];

export default function Akademik() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Akademik</h1>
        <p className="text-sm text-muted-foreground">Manajemen data akademik sekolah</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subModules.map((m) => (
          <Card
            key={m.title}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(m.url)}
          >
            <CardContent className="flex items-start gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <m.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{m.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{m.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
