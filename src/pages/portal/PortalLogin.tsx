import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { LogIn, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function PortalLogin() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (signInError) {
      const messages: Record<string, string> = {
        "Invalid login credentials": "Email atau password salah",
        "Email not confirmed": "Email belum dikonfirmasi. Periksa inbox Anda.",
      };
      setError(messages[signInError.message] || signInError.message);
      setLoading(false);
      return;
    }

    // Check role
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Gagal mendapatkan data user");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users_profile")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "ortu") {
      await supabase.auth.signOut();
      setError(
        "Akun ini bukan akun orang tua. Silakan gunakan halaman login admin."
      );
      setLoading(false);
      return;
    }

    navigate("/portal", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 font-bold text-white text-2xl shadow-lg">
            H
          </div>
          <h1 className="text-2xl font-bold text-emerald-800">
            Portal Orang Tua
          </h1>
          <p className="mt-1 text-sm text-emerald-600/80">
            Hijrah At-Tauhid — Sistem Manajemen Sekolah Islam
          </p>
        </div>

        <Card className="shadow-lg border-emerald-200">
          <CardHeader className="pb-4 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              Masuk ke Portal
            </h2>
            <p className="text-xs text-muted-foreground">
              Gunakan akun orang tua yang terdaftar
            </p>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="email@contoh.com"
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Masukkan password"
                            type={showPassword ? "text" : "password"}
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Masuk
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Belum terdaftar?{" "}
          <Link to="/psb" className="text-emerald-700 underline font-medium">
            Daftarkan anak Anda
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Untuk login admin,{" "}
          <Link to="/login" className="text-emerald-700 underline font-medium">
            klik di sini
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          © 2025 Hijrah At-Tauhid — Portal Orang Tua
        </p>
      </div>
    </div>
  );
}
