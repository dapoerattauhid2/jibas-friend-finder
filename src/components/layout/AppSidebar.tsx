import {
  LayoutDashboard, GraduationCap, Wallet, Users,
  MonitorPlay, BookOpen, Megaphone, Settings,
  ChevronRight,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SubMenuItem {
  title: string;
  url: string;
  roles?: UserRole[];
}

interface MenuItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
  children?: SubMenuItem[];
}

const menuItems: MenuItem[] = [
  {
    title: "Dashboard", url: "/", icon: LayoutDashboard,
    roles: ["admin", "kepala_sekolah", "guru", "keuangan", "siswa", "pustakawan", "kasir"],
  },
  {
    title: "Akademik", url: "/akademik", icon: GraduationCap,
    roles: ["admin", "kepala_sekolah", "guru"],
    children: [
      { title: "Ringkasan", url: "/akademik" },
      { title: "Data Siswa", url: "/akademik/siswa" },
      { title: "PSB", url: "/akademik/psb" },
      { title: "Mutasi", url: "/akademik/mutasi" },
      { title: "Jadwal", url: "/akademik/jadwal" },
      { title: "Presensi", url: "/akademik/presensi" },
      { title: "Penilaian", url: "/akademik/penilaian" },
      { title: "Referensi", url: "/akademik/referensi" },
    ],
  },
  {
    title: "Keuangan", url: "/keuangan", icon: Wallet,
    roles: ["admin", "kepala_sekolah", "keuangan", "kasir"],
    children: [
      { title: "Pembayaran SPP", url: "/keuangan/pembayaran", roles: ["admin", "kepala_sekolah", "keuangan", "kasir"] },
      { title: "Tunggakan", url: "/keuangan/tunggakan", roles: ["admin", "kepala_sekolah", "keuangan", "kasir"] },
      { title: "Pengeluaran", url: "/keuangan/pengeluaran", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Tabungan Siswa", url: "/keuangan/tabungan", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Laporan Per Siswa", url: "/keuangan/laporan-siswa", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Laporan Per Kelas", url: "/keuangan/laporan-kelas", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Rekap Harian", url: "/keuangan/rekap-harian", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Pembayaran PSB", url: "/keuangan/pembayaran-psb", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Jurnal Umum", url: "/keuangan/jurnal", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Buku Besar", url: "/keuangan/buku-besar", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Laporan Keuangan", url: "/keuangan/laporan", roles: ["admin", "kepala_sekolah", "keuangan"] },
      { title: "Referensi", url: "/keuangan/referensi", roles: ["admin", "kepala_sekolah", "keuangan"] },
    ],
  },
  {
    title: "Kepegawaian", url: "/kepegawaian", icon: Users,
    roles: ["admin", "kepala_sekolah"],
    children: [
      { title: "Data Pegawai", url: "/kepegawaian/pegawai" },
      { title: "Presensi Pegawai", url: "/kepegawaian/presensi" },
    ],
  },
  {
    title: "CBE", url: "/cbe", icon: MonitorPlay,
    roles: ["admin", "kepala_sekolah", "guru"],
  },
  {
    title: "SIMTAKA", url: "/simtaka", icon: BookOpen,
    roles: ["admin", "kepala_sekolah", "pustakawan"],
  },
  {
    title: "Buletin", url: "/buletin", icon: Megaphone,
    roles: ["admin", "kepala_sekolah"],
  },
  {
    title: "Pengaturan", url: "/pengaturan", icon: Settings,
    roles: ["admin"],
    children: [
      { title: "Identitas Sekolah", url: "/pengaturan/sekolah" },
      { title: "Manajemen Pengguna", url: "/pengaturan/pengguna" },
      { title: "Manajemen Ortu", url: "/pengaturan/ortu" },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role } = useAuth();

  const visibleItems = menuItems.filter(
    (item) => !role || item.roles.includes(role)
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-bold text-sidebar-primary-foreground text-sm">
            J
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground">JIBAS</span>
              <span className="text-[10px] text-sidebar-foreground/60 leading-tight">
                Sistem Informasi Sekolah
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive =
                  item.url === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.url);

                if (item.children && !collapsed) {
                  return (
                    <Collapsible key={item.title} defaultOpen={isActive} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            isActive={isActive}
                            tooltip={item.title}
                            className="justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </div>
                            <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.filter((sub) => !sub.roles || !role || sub.roles.includes(role)).map((sub) => {
                              const subActive = location.pathname === sub.url;
                              return (
                                <SidebarMenuSubItem key={sub.url}>
                                  <SidebarMenuSubButton asChild isActive={subActive}>
                                    <NavLink
                                      to={sub.url}
                                      className="hover:bg-sidebar-accent/50"
                                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                    >
                                      {sub.title}
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
