import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function CetakBiodata() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: pegawai, isLoading: loadP } = useQuery({
    queryKey: ["pegawai_biodata", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("pegawai").select("*, departemen:departemen_id(nama, kode)").eq("id", id!).single();
      return data;
    },
  });

  const { data: pendidikan } = useQuery({
    queryKey: ["riwayat_pendidikan_bio", id],
    enabled: !!id,
    queryFn: async () => { const { data } = await supabase.from("riwayat_pendidikan").select("*").eq("pegawai_id", id!).order("tahun_lulus", { ascending: false }); return data || []; },
  });

  const { data: jabatan } = useQuery({
    queryKey: ["riwayat_jabatan_bio", id],
    enabled: !!id,
    queryFn: async () => { const { data } = await supabase.from("riwayat_jabatan").select("*").eq("pegawai_id", id!).order("tmt", { ascending: false }); return data || []; },
  });

  const { data: golongan } = useQuery({
    queryKey: ["riwayat_golongan_bio", id],
    enabled: !!id,
    queryFn: async () => { const { data } = await supabase.from("riwayat_golongan").select("*").eq("pegawai_id", id!).order("tmt", { ascending: false }); return data || []; },
  });

  const { data: keluarga } = useQuery({
    queryKey: ["keluarga_bio", id],
    enabled: !!id,
    queryFn: async () => { const { data } = await supabase.from("keluarga_pegawai").select("*").eq("pegawai_id", id!).order("hubungan"); return data || []; },
  });

  const { data: sertifikasi } = useQuery({
    queryKey: ["sertifikasi_bio", id],
    enabled: !!id,
    queryFn: async () => { const { data } = await supabase.from("sertifikasi_guru").select("*").eq("pegawai_id", id!).order("tanggal_terbit", { ascending: false }); return data || []; },
  });

  const { data: sekolah } = useQuery({
    queryKey: ["sekolah_info"],
    queryFn: async () => { const { data } = await supabase.from("sekolah").select("*").limit(1).maybeSingle(); return data; },
  });

  if (loadP) return <Skeleton className="h-96" />;
  if (!pegawai) return <p className="text-center py-8 text-muted-foreground">Pegawai tidak ditemukan</p>;

  const fmtDate = (d: string | null) => d ? format(new Date(d), "dd MMMM yyyy", { locale: idLocale }) : "-";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-2" />Kembali</Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Cetak</Button>
      </div>

      <div id="biodata-print" className="bg-background text-foreground p-6 max-w-[210mm] mx-auto print:!block print:p-4 text-sm space-y-5">
        {/* Kop */}
        <div className="text-center border-b-2 border-foreground pb-3 mb-4">
          <h1 className="text-lg font-bold uppercase">{sekolah?.nama || "Yayasan"}</h1>
          <p className="text-xs">{sekolah?.alamat}</p>
        </div>

        <h2 className="text-center font-bold text-base underline mb-4">BIODATA PEGAWAI</h2>

        {/* Data Pribadi */}
        <table className="w-full">
          <tbody>
            <tr><td className="py-1 w-40 font-semibold">Nama</td><td className="py-1">: {pegawai.nama}</td></tr>
            <tr><td className="py-1 font-semibold">NIP</td><td className="py-1">: {pegawai.nip || "-"}</td></tr>
            <tr><td className="py-1 font-semibold">Jabatan</td><td className="py-1">: {pegawai.jabatan || "-"}</td></tr>
            <tr><td className="py-1 font-semibold">Golongan</td><td className="py-1">: {pegawai.golongan_terakhir || "-"}</td></tr>
            <tr><td className="py-1 font-semibold">Lembaga</td><td className="py-1">: {(pegawai.departemen as any)?.nama || "Yayasan"}</td></tr>
            <tr><td className="py-1 font-semibold">Jenis Kelamin</td><td className="py-1">: {pegawai.jenis_kelamin === "L" ? "Laki-laki" : pegawai.jenis_kelamin === "P" ? "Perempuan" : "-"}</td></tr>
            <tr><td className="py-1 font-semibold">TTL</td><td className="py-1">: {pegawai.tempat_lahir || "-"}, {fmtDate(pegawai.tanggal_lahir)}</td></tr>
            <tr><td className="py-1 font-semibold">Agama</td><td className="py-1">: {pegawai.agama || "-"}</td></tr>
            <tr><td className="py-1 font-semibold">Alamat</td><td className="py-1">: {pegawai.alamat || "-"}</td></tr>
            <tr><td className="py-1 font-semibold">Telepon</td><td className="py-1">: {pegawai.telepon || "-"}</td></tr>
            <tr><td className="py-1 font-semibold">Email</td><td className="py-1">: {pegawai.email || "-"}</td></tr>
            <tr><td className="py-1 font-semibold">Tanggal Masuk</td><td className="py-1">: {fmtDate(pegawai.tanggal_masuk)}</td></tr>
            <tr><td className="py-1 font-semibold">Status</td><td className="py-1">: {pegawai.status}</td></tr>
          </tbody>
        </table>

        {/* Riwayat Pendidikan */}
        {pendidikan && pendidikan.length > 0 && (
          <div>
            <h3 className="font-bold mt-4 mb-2">Riwayat Pendidikan</h3>
            <table className="w-full border border-foreground/20 text-xs">
              <thead><tr className="bg-muted"><th className="border border-foreground/20 p-1">Jenjang</th><th className="border border-foreground/20 p-1">Institusi</th><th className="border border-foreground/20 p-1">Jurusan</th><th className="border border-foreground/20 p-1">Lulus</th></tr></thead>
              <tbody>
                {pendidikan.map((p: any) => (
                  <tr key={p.id}><td className="border border-foreground/20 p-1">{p.jenjang}</td><td className="border border-foreground/20 p-1">{p.nama_institusi}</td><td className="border border-foreground/20 p-1">{p.jurusan || "-"}</td><td className="border border-foreground/20 p-1">{p.tahun_lulus || "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Riwayat Golongan */}
        {golongan && golongan.length > 0 && (
          <div>
            <h3 className="font-bold mt-4 mb-2">Riwayat Golongan/Pangkat</h3>
            <table className="w-full border border-foreground/20 text-xs">
              <thead><tr className="bg-muted"><th className="border border-foreground/20 p-1">Golongan</th><th className="border border-foreground/20 p-1">Pangkat</th><th className="border border-foreground/20 p-1">TMT</th><th className="border border-foreground/20 p-1">No SK</th></tr></thead>
              <tbody>
                {golongan.map((g: any) => (
                  <tr key={g.id}><td className="border border-foreground/20 p-1">{g.golongan}</td><td className="border border-foreground/20 p-1">{g.pangkat || "-"}</td><td className="border border-foreground/20 p-1">{fmtDate(g.tmt)}</td><td className="border border-foreground/20 p-1">{g.sk_nomor || "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Riwayat Jabatan */}
        {jabatan && jabatan.length > 0 && (
          <div>
            <h3 className="font-bold mt-4 mb-2">Riwayat Jabatan</h3>
            <table className="w-full border border-foreground/20 text-xs">
              <thead><tr className="bg-muted"><th className="border border-foreground/20 p-1">Jabatan</th><th className="border border-foreground/20 p-1">Unit</th><th className="border border-foreground/20 p-1">TMT</th><th className="border border-foreground/20 p-1">Sampai</th></tr></thead>
              <tbody>
                {jabatan.map((j: any) => (
                  <tr key={j.id}><td className="border border-foreground/20 p-1">{j.jabatan}</td><td className="border border-foreground/20 p-1">{j.unit_kerja || "-"}</td><td className="border border-foreground/20 p-1">{fmtDate(j.tmt)}</td><td className="border border-foreground/20 p-1">{j.sampai ? fmtDate(j.sampai) : "Sekarang"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Keluarga */}
        {keluarga && keluarga.length > 0 && (
          <div>
            <h3 className="font-bold mt-4 mb-2">Data Keluarga</h3>
            <table className="w-full border border-foreground/20 text-xs">
              <thead><tr className="bg-muted"><th className="border border-foreground/20 p-1">Nama</th><th className="border border-foreground/20 p-1">Hubungan</th><th className="border border-foreground/20 p-1">JK</th><th className="border border-foreground/20 p-1">Tgl Lahir</th><th className="border border-foreground/20 p-1">Pekerjaan</th></tr></thead>
              <tbody>
                {keluarga.map((k: any) => (
                  <tr key={k.id}><td className="border border-foreground/20 p-1">{k.nama}</td><td className="border border-foreground/20 p-1">{k.hubungan}</td><td className="border border-foreground/20 p-1">{k.jenis_kelamin || "-"}</td><td className="border border-foreground/20 p-1">{fmtDate(k.tanggal_lahir)}</td><td className="border border-foreground/20 p-1">{k.pekerjaan || "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sertifikasi */}
        {sertifikasi && sertifikasi.length > 0 && (
          <div>
            <h3 className="font-bold mt-4 mb-2">Sertifikasi</h3>
            <table className="w-full border border-foreground/20 text-xs">
              <thead><tr className="bg-muted"><th className="border border-foreground/20 p-1">Jenis</th><th className="border border-foreground/20 p-1">Nomor</th><th className="border border-foreground/20 p-1">Penerbit</th><th className="border border-foreground/20 p-1">Tanggal</th></tr></thead>
              <tbody>
                {sertifikasi.map((s: any) => (
                  <tr key={s.id}><td className="border border-foreground/20 p-1">{s.jenis}</td><td className="border border-foreground/20 p-1">{s.nomor_sertifikat || "-"}</td><td className="border border-foreground/20 p-1">{s.penerbit || "-"}</td><td className="border border-foreground/20 p-1">{fmtDate(s.tanggal_terbit)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
