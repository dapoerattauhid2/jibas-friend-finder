import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, MessageCircle, Phone } from "lucide-react";

export default function NotifikasiGateway() {
  const { user } = useAuth();
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramMessage, setTelegramMessage] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const sendTelegram = async () => {
    if (!telegramChatId || !telegramMessage) {
      toast.warning("Chat ID dan pesan wajib diisi");
      return;
    }

    setSending(true);
    setTestResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sesi habis, login ulang");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-telegram`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            chat_id: telegramChatId,
            message: telegramMessage,
          }),
        }
      );

      const result = await res.json();
      if (result.success) {
        toast.success(`Pesan terkirim! (${result.sent} berhasil)`);
        setTestResult(`✅ Berhasil: ${result.sent} pesan terkirim`);
      } else {
        toast.error(result.error || "Gagal mengirim pesan");
        setTestResult(`❌ Gagal: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(err.message);
      setTestResult(`❌ Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const sendWhatsApp = async () => {
    if (!whatsappPhone || !whatsappMessage) {
      toast.warning("Nomor HP dan pesan wajib diisi");
      return;
    }

    setSending(true);
    setTestResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sesi habis, login ulang");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            phone: whatsappPhone,
            message: whatsappMessage,
          }),
        }
      );

      const result = await res.json();
      if (result.success) {
        toast.success(`Pesan terkirim! (${result.sent} berhasil)`);
        setTestResult(`✅ Berhasil: ${result.sent} pesan terkirim`);
      } else {
        toast.error(result.error || "Gagal mengirim pesan");
        setTestResult(`❌ Gagal: ${result.error}`);
      }
    } catch (err: any) {
      toast.error(err.message);
      setTestResult(`❌ Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notifikasi Gateway</h1>
        <p className="text-sm text-muted-foreground">Kirim notifikasi ke orang tua via Telegram</p>
      </div>

      <Tabs defaultValue="telegram">
        <TabsList>
          <TabsTrigger value="telegram">
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Telegram
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <Phone className="h-4 w-4 mr-1.5" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="telegram" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Kirim Pesan Telegram
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                <p className="font-medium">Cara Setup Telegram Bot:</p>
                <ol className="list-decimal ml-4 space-y-1 text-muted-foreground">
                  <li>Buat bot via <code>@BotFather</code> di Telegram</li>
                  <li>Simpan token bot sebagai secret <code>TELEGRAM_BOT_TOKEN</code> di Supabase</li>
                  <li>Orang tua harus /start bot tersebut dan catat Chat ID mereka</li>
                  <li>Simpan Chat ID orang tua di profil mereka untuk broadcast</li>
                </ol>
              </div>

              <div>
                <Label>Chat ID</Label>
                <Input
                  placeholder="Contoh: 123456789"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Gunakan <code>@userinfobot</code> untuk mendapatkan Chat ID
                </p>
              </div>

              <div>
                <Label>Pesan</Label>
                <Textarea
                  placeholder="Tulis pesan yang akan dikirim..."
                  value={telegramMessage}
                  onChange={(e) => setTelegramMessage(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Mendukung HTML: <code>&lt;b&gt;bold&lt;/b&gt;</code>, <code>&lt;i&gt;italic&lt;/i&gt;</code>
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={sendTelegram}
                  disabled={sending}
                  className="bg-[#0088cc] hover:bg-[#006daa]"
                >
                  {sending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Kirim Pesan
                </Button>
              </div>

              {testResult && (
                <div className={`rounded-lg p-3 text-sm ${testResult.startsWith("✅") ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                  {testResult}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Kirim Pesan WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                <p className="font-medium">Cara Setup WA-Gateway (Baileys):</p>
                <ol className="list-decimal ml-4 space-y-1 text-muted-foreground">
                  <li>Deploy WA-Gateway di VPS (mis: <code>https://github.com/WhatsApp-Gateway/WA-Gateway</code>)</li>
                  <li>Scan QR code dengan nomor WhatsApp Anda</li>
                  <li>Simpan URL gateway sebagai secret <code>WA_GATEWAY_URL</code> di Supabase</li>
                  <li>Jika ada token, simpan sebagai <code>WA_GATEWAY_TOKEN</code></li>
                  <li>Pastikan endpoint <code>/send-message</code> berfungsi</li>
                </ol>
              </div>

              <div>
                <Label>Nomor WhatsApp</Label>
                <Input
                  placeholder="Contoh: 628123456789 (tanpa +)"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: 628xxx (kode negara + nomor tanpa +)
                </p>
              </div>

              <div>
                <Label>Pesan</Label>
                <Textarea
                  placeholder="Tulis pesan yang akan dikirim..."
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Pesan teks biasa (emoji ✅ didukung)
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={sendWhatsApp}
                  disabled={sending}
                  className="bg-[#25D366] hover:bg-[#1da851]"
                >
                  {sending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Kirim Pesan
                </Button>
              </div>

              {testResult && (
                <div className={`rounded-lg p-3 text-sm ${testResult.startsWith("✅") ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                  {testResult}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
