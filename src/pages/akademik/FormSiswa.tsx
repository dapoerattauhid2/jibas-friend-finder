import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useSiswaDetail, useSiswaDetailOrangtua, useCreateSiswa, useUpdateSiswa } from "@/hooks/useSiswa";
import { useAngkatan, useDepartemen, useTingkat, useKelas, useTahunAjaran } from "@/hooks/useAkademikData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FileUpload } from "@/components/shared/FileUpload";
import { FormSection } from "@/components/shared/FormSection";
import { ArrowLeft, CalendarIcon, Save, Wand2, Pencil, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const siswaSchema = z.object({
  nis: z.string().optional(),
  nama: z.string().min(2, "Nama minimal 2 karakter"),
  jenis_kelamin: z.enum(["L", "P"], { required_error: "Pilih jenis kelamin" }),
  tempat_lahir: z.string().optional(),
  tanggal_lahir: z.date().optional(),
  agama: z.string().optional(),
  alamat: z.string().optional(),
  telepon: z.string().optional(),
  email: z.string().email("Email tidak valid").optional().or(z.literal("")),
  foto_url: z.string().optional(),
  status: z.string().default("aktif"),
  angkatan_id: z.string().optional(),
  departemen_id: z.string().optional(),
  tingkat_id: z.string().optional(),
  kelas_id: z.string().optional(),
  tahun_ajaran_id: z.string().optional(),
  nama_ayah: z.string().optional(),
  nama_ibu: z.string().optional(),
  pekerjaan_ayah: z.string().optional(),
  pekerjaan_ibu: z.string().optional(),
  telepon_ortu: z.string().optional(),
  alamat_ortu: z.string().optional(),
});

type SiswaForm = z.infer<typeof siswaSchema>;

const agamaOptions = ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"];
const pekerjaanOptions = ["PNS", "TNI/Polri", "Wiraswasta", "Karyawan Swasta", "Petani", "Nelayan", "Buruh", "Guru/Dosen", "Dokter", "Lainnya"];

export default function FormSiswa() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createSiswa = useCreateSiswa();
  const updateSiswa = useUpdateSiswa();
  const { data: siswa } = useSiswaDetail(id || "");
  const { data: orangtua } = useSiswaDetailOrangtua(id || "");
  const { data: allAngkatanList = [] } = useAngkatan();
  const { data: departemenList = [] } = useDepartemen();
  const { data: tahunAjaranList = [] } = useTahunAjaran();

  const [nisMode, setNisMode] = useState<"otomatis" | "manual">(isEdit ? "manual" : "otomatis");
  const [savedSiswaId, setSavedSiswaId] = useState<string | null>(null);
  const [isGeneratingNis, setIsGeneratingNis] = useState(false);

  const form = useForm<SiswaForm>({
    resolver: zodResolver(siswaSchema),
    defaultValues: { status: "aktif" },
  });

  const watchDept = form.watch("departemen_id");
  const watchTingkat = form.watch("tingkat_id");
  const watchAngkatan = form.watch("angkatan_id");
  const watchKelas = form.watch("kelas_id");
  const { data: tingkatList = [] } = useTingkat(watchDept);
  const { data: kelasList = [] } = useKelas(watchTingkat);

  const nisParamsComplete = !!(watchDept && watchAngkatan && watchKelas);

  // Populate form on edit
  useEffect(() => {
    if (isEdit && siswa) {
      const activeKelas = siswa.kelas_siswa?.find((ks) => ks.aktif);
      form.reset({
        nis: siswa.nis || "",
        nama: siswa.nama,
        jenis_kelamin: (siswa.jenis_kelamin as "L" | "P") || undefined,
        tempat_lahir: siswa.tempat_lahir || "",
        tanggal_lahir: siswa.tanggal_lahir ? new Date(siswa.tanggal_lahir) : undefined,
        agama: siswa.agama || "",
        alamat: siswa.alamat || "",
        telepon: siswa.telepon || "",
        email: siswa.email || "",
        foto_url: siswa.foto_url || "",
        status: siswa.status || "aktif",
        angkatan_id: siswa.angkatan_id || "",
        departemen_id: activeKelas?.kelas?.departemen?.id || "",
        tingkat_id: activeKelas?.kelas?.tingkat?.id || "",
        kelas_id: activeKelas?.kelas?.id || "",
        tahun_ajaran_id: activeKelas?.tahun_ajaran?.id || "",
        nama_ayah: orangtua?.nama_ayah || "",
        nama_ibu: orangtua?.nama_ibu || "",
        pekerjaan_ayah: orangtua?.pekerjaan_ayah || "",
        pekerjaan_ibu: orangtua?.pekerjaan_ibu || "",
        telepon_ortu: orangtua?.telepon_ortu || "",
        alamat_ortu: orangtua?.alamat_ortu || "",
      });
    }
  }, [siswa, orangtua, isEdit]);

  const invokeGenerateNis = async (siswaId: string, deptId: string, angkatanId: string, kelasId: string) => {
    setIsGeneratingNis(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-nis", {
        body: { siswa_id: siswaId, departemen_id: deptId, angkatan_id: angkatanId, kelas_id: kelasId },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Gagal generate NIS");
      return data.nis as string;
    } finally {
      setIsGeneratingNis(false);
    }
  };

  const handleGenerateNisClick = async () => {
    const siswaId = isEdit ? id! : savedSiswaId;
    if (!siswaId || !watchDept || !watchAngkatan || !watchKelas) return;

    try {
      const nis = await invokeGenerateNis(siswaId, watchDept, watchAngkatan, watchKelas);
      form.setValue("nis", nis);
      toast.success("NIS berhasil dibuat: " + nis);
      queryClient.invalidateQueries({ queryKey: ["siswa"] });
      navigate("/akademik/siswa");
    } catch (err: any) {
      toast.error(err.message || "Gagal generate NIS");
    }
  };

  const onSubmit = async (values: SiswaForm) => {
    const siswaData: Record<string, unknown> = {
      nama: values.nama,
      nis: values.nis || null,
      jenis_kelamin: values.jenis_kelamin,
      tempat_lahir: values.tempat_lahir || null,
      tanggal_lahir: values.tanggal_lahir ? format(values.tanggal_lahir, "yyyy-MM-dd") : null,
      agama: values.agama || null,
      alamat: values.alamat || null,
      telepon: values.telepon || null,
      email: values.email || null,
      foto_url: values.foto_url || null,
      status: values.status,
      angkatan_id: values.angkatan_id || null,
    };

    const detailData: Record<string, unknown> = {
      nama_ayah: values.nama_ayah || null,
      nama_ibu: values.nama_ibu || null,
      pekerjaan_ayah: values.pekerjaan_ayah || null,
      pekerjaan_ibu: values.pekerjaan_ibu || null,
      telepon_ortu: values.telepon_ortu || null,
      alamat_ortu: values.alamat_ortu || null,
    };

    if (isEdit) {
      const kelasData = values.kelas_id && values.tahun_ajaran_id
        ? { kelas_id: values.kelas_id, tahun_ajaran_id: values.tahun_ajaran_id }
        : undefined;
      await updateSiswa.mutateAsync({ id: id!, siswa: siswaData, detail: detailData, kelas_siswa: kelasData });

      if (nisMode === "otomatis") {
        if (nisParamsComplete) {
          try {
            const nis = await invokeGenerateNis(id!, watchDept!, watchAngkatan!, watchKelas!);
            toast.success("Siswa disimpan. NIS: " + nis);
          } catch (err: any) {
            toast.warning("Siswa disimpan, tapi NIS gagal di-generate: " + (err.message || ""));
          }
        } else {
          toast.warning("Siswa disimpan tanpa NIS. Lengkapi departemen, angkatan, dan kelas untuk generate NIS.");
        }
      }

      navigate(`/akademik/siswa/${id}`);
    } else {
      const kelasData = values.kelas_id && values.tahun_ajaran_id
        ? { kelas_id: values.kelas_id, tahun_ajaran_id: values.tahun_ajaran_id, aktif: true }
        : undefined;
      const result = await createSiswa.mutateAsync({ siswa: siswaData, detail: detailData, kelas_siswa: kelasData });
      const newSiswaId = (result as any)?.id;

      if (nisMode === "otomatis") {
        if (nisParamsComplete && newSiswaId) {
          try {
            const nis = await invokeGenerateNis(newSiswaId, watchDept!, watchAngkatan!, watchKelas!);
            toast.success("Siswa disimpan. NIS: " + nis);
          } catch (err: any) {
            toast.warning("Siswa disimpan, tapi NIS gagal di-generate: " + (err.message || ""));
          }
        } else {
          toast.warning("Siswa disimpan tanpa NIS. Lengkapi departemen, angkatan, dan kelas untuk generate NIS.");
        }
        navigate("/akademik/siswa");
      } else {
        // Manual mode: stay on page, let user click "Buat NIS"
        if (newSiswaId) {
          setSavedSiswaId(newSiswaId);
          toast.success("Siswa disimpan! Klik 'Buat NIS' untuk generate NIS.");
        } else {
          toast.success("Siswa disimpan.");
          navigate("/akademik/siswa");
        }
      }
    }
  };

  const canGenerateManual = isEdit
    ? nisParamsComplete
    : !!(savedSiswaId && nisParamsComplete);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isEdit ? "Edit Siswa" : "Tambah Siswa Baru"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? `Mengedit data ${siswa?.nama || ""}` : "Isi data siswa baru"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Tabs defaultValue="pribadi" className="space-y-4">
            <TabsList>
              <TabsTrigger value="pribadi">Data Pribadi</TabsTrigger>
              <TabsTrigger value="akademik">Data Akademik</TabsTrigger>
              <TabsTrigger value="orangtua">Data Orang Tua</TabsTrigger>
            </TabsList>

            <TabsContent value="pribadi">
              <Card>
                <CardContent className="pt-6 space-y-6">
                  <FormSection title="Foto Siswa">
                    <FileUpload
                      bucket="avatars-siswa"
                      accept="image/*"
                      maxSize={2}
                      value={form.watch("foto_url")}
                      onChange={(url) => form.setValue("foto_url", url || "")}
                    />
                  </FormSection>

                  <FormSection title="Identitas">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Nama */}
                      <FormField control={form.control} name="nama" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Lengkap *</FormLabel>
                          <FormControl><Input placeholder="Nama lengkap siswa" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      {/* NIS Mode Toggle + Field */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium">Mode NIS</span>
                          <div className="flex gap-1 ml-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={nisMode === "otomatis" ? "default" : "outline"}
                              onClick={() => setNisMode("otomatis")}
                              className="h-7 text-xs px-2"
                            >
                              <Wand2 className="h-3 w-3 mr-1" />
                              Otomatis
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={nisMode === "manual" ? "default" : "outline"}
                              onClick={() => setNisMode("manual")}
                              className="h-7 text-xs px-2"
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Manual
                            </Button>
                          </div>
                        </div>

                        <FormField control={form.control} name="nis" render={({ field }) => (
                          <FormItem>
                            <FormLabel>NIS</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                disabled
                                placeholder={
                                  nisMode === "otomatis"
                                    ? "NIS akan di-generate otomatis saat simpan"
                                    : "Klik tombol untuk generate NIS"
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        {/* Mode Otomatis + Edit: tombol Generate Ulang */}
                        {nisMode === "otomatis" && isEdit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!nisParamsComplete || isGeneratingNis}
                            onClick={handleGenerateNisClick}
                          >
                            {isGeneratingNis ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                            Generate Ulang NIS
                          </Button>
                        )}

                        {/* Mode Manual: tombol Buat NIS */}
                        {nisMode === "manual" && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!canGenerateManual || isGeneratingNis}
                              onClick={handleGenerateNisClick}
                            >
                              {isGeneratingNis ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                              Buat NIS
                            </Button>
                            {!isEdit && !savedSiswaId && (
                              <p className="text-xs text-muted-foreground">Simpan siswa dulu sebelum generate NIS</p>
                            )}
                            {!nisParamsComplete && (savedSiswaId || isEdit) && (
                              <p className="text-xs text-muted-foreground">Lengkapi departemen, angkatan, dan kelas di tab Akademik</p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Jenis Kelamin */}
                      <FormField control={form.control} name="jenis_kelamin" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Jenis Kelamin *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="L">Laki-laki</SelectItem>
                              <SelectItem value="P">Perempuan</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="agama" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Agama</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih agama" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {agamaOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="tempat_lahir" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tempat Lahir</FormLabel>
                          <FormControl><Input placeholder="Kota kelahiran" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="tanggal_lahir" render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Tanggal Lahir</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                  {field.value ? format(field.value, "dd/MM/yyyy") : "Pilih tanggal"}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => date > new Date()}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </FormSection>

                  <FormSection title="Kontak">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="telepon" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telepon</FormLabel>
                          <FormControl><Input placeholder="08xxxxxxxxxx" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" placeholder="email@contoh.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="alamat" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alamat</FormLabel>
                        <FormControl><Textarea placeholder="Alamat lengkap" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </FormSection>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="akademik">
              <Card>
                <CardContent className="pt-6">
                  <FormSection title="Data Akademik">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="angkatan_id" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Angkatan</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih angkatan" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {angkatanList.map((a) => <SelectItem key={a.id} value={a.id}>{a.nama}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="status" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="aktif">Aktif</SelectItem>
                              <SelectItem value="alumni">Alumni</SelectItem>
                              <SelectItem value="pindah">Pindah</SelectItem>
                              <SelectItem value="keluar">Keluar</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="departemen_id" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Departemen</FormLabel>
                          <Select onValueChange={(v) => { field.onChange(v); form.setValue("tingkat_id", ""); form.setValue("kelas_id", ""); }} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih departemen" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {departemenList.map((d) => <SelectItem key={d.id} value={d.id}>{d.nama}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="tingkat_id" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tingkat</FormLabel>
                          <Select onValueChange={(v) => { field.onChange(v); form.setValue("kelas_id", ""); }} value={field.value} disabled={!watchDept}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih tingkat" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {tingkatList.map((t) => <SelectItem key={t.id} value={t.id}>{t.nama}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="kelas_id" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Kelas</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={!watchTingkat}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {kelasList.map((k) => <SelectItem key={k.id} value={k.id}>{k.nama}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="tahun_ajaran_id" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tahun Ajaran</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {tahunAjaranList.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.nama} {t.aktif ? "(Aktif)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </FormSection>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orangtua">
              <Card>
                <CardContent className="pt-6">
                  <FormSection title="Data Orang Tua / Wali">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField control={form.control} name="nama_ayah" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Ayah</FormLabel>
                          <FormControl><Input placeholder="Nama ayah" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="nama_ibu" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nama Ibu</FormLabel>
                          <FormControl><Input placeholder="Nama ibu" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="pekerjaan_ayah" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pekerjaan Ayah</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih pekerjaan" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {pekerjaanOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="pekerjaan_ibu" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pekerjaan Ibu</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Pilih pekerjaan" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {pekerjaanOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="telepon_ortu" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telepon Orang Tua</FormLabel>
                          <FormControl><Input placeholder="08xxxxxxxxxx" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="alamat_ortu" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Alamat Orang Tua</FormLabel>
                        <FormControl><Textarea placeholder="Alamat orang tua" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </FormSection>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Sticky save button */}
          <div className="sticky bottom-0 bg-background border-t py-4 mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Batal</Button>
            <Button type="submit" disabled={createSiswa.isPending || updateSiswa.isPending || isGeneratingNis}>
              <Save className="h-4 w-4 mr-2" />
              {isEdit ? "Simpan Perubahan" : "Simpan Siswa"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
