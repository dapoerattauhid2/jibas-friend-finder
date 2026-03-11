import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TagihanItem {
  siswa_id: string;
  nama_siswa: string;
  jenis_id: string;
  jenis_nama: string;
  bulan: number;
  jumlah: number;
  departemen_id?: string;
  tahun_ajaran_id?: string;
  departemen_nama?: string;
}

interface CreatePaymentBody {
  items: TagihanItem[];
  customer: {
    user_id: string;
    email: string;
    nama: string;
    telepon?: string;
  };
}

const NAMA_BULAN = [
  "",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Validasi JWT user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized: no auth header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user with anon key client
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || ""
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized: invalid token");

    // 2. Parse body
    const body: CreatePaymentBody = await req.json();
    const { items, customer } = body;

    if (!items || items.length === 0) {
      throw new Error("Tidak ada tagihan yang dipilih");
    }

    // 3. Validasi: cek semua siswa_id memang anak dari user ini
    const siswaIds = [...new Set(items.map((i) => i.siswa_id))];
    const { data: ortuData, error: ortuError } = await supabase
      .from("ortu_siswa")
      .select("siswa_id")
      .eq("user_id", user.id)
      .in("siswa_id", siswaIds);

    if (ortuError) throw ortuError;
    if (!ortuData || ortuData.length !== siswaIds.length) {
      throw new Error("Akses ditolak: beberapa siswa bukan anak Anda");
    }

    // 4. Validasi: cek tagihan belum dibayar (anti double payment)
    for (const item of items) {
      const { data: existingPayment } = await supabase
        .from("pembayaran")
        .select("id")
        .eq("siswa_id", item.siswa_id)
        .eq("jenis_id", item.jenis_id)
        .eq("bulan", item.bulan)
        .maybeSingle();

      if (existingPayment) {
        throw new Error(
          `Tagihan ${item.jenis_nama} bulan ke-${item.bulan} untuk ${item.nama_siswa} sudah dibayar`
        );
      }
    }

    // 5. Re-fetch nominal dari database (JANGAN percaya frontend)
    // Ambil kelas_siswa aktif untuk setiap siswa
    const { data: kelasSiswaData } = await supabase
      .from("kelas_siswa")
      .select("siswa_id, kelas_id, tahun_ajaran_id")
      .in("siswa_id", siswaIds)
      .eq("aktif", true);

    const kelasMap = new Map<string, { kelas_id: string | null; tahun_ajaran_id: string | null }>();
    (kelasSiswaData || []).forEach((ks: any) => {
      kelasMap.set(ks.siswa_id, { kelas_id: ks.kelas_id, tahun_ajaran_id: ks.tahun_ajaran_id });
    });

    // Hitung nominal dari DB untuk setiap item
    const validatedItems = [];
    for (const item of items) {
      const kelasInfo = kelasMap.get(item.siswa_id);
      const { data: tarifNominal } = await supabase.rpc("get_tarif_siswa", {
        p_jenis_id: item.jenis_id,
        p_siswa_id: item.siswa_id,
        p_kelas_id: kelasInfo?.kelas_id || null,
        p_tahun_ajaran_id: kelasInfo?.tahun_ajaran_id || item.tahun_ajaran_id || null,
      });

      const nominalDB = Number(tarifNominal) || 0;
      if (nominalDB <= 0) {
        throw new Error(`Tarif tidak ditemukan untuk ${item.jenis_nama} - ${item.nama_siswa}`);
      }

      validatedItems.push({
        ...item,
        jumlah: nominalDB, // Override dengan nominal dari DB
        departemen_id: item.departemen_id || null,
        tahun_ajaran_id: kelasInfo?.tahun_ajaran_id || item.tahun_ajaran_id || null,
      });
    }

    const totalAmount = validatedItems.reduce((sum, item) => sum + item.jumlah, 0);

    // 6. Generate order_id unik
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `JIBAS-${dateStr}-${random}`;

    // 7. Simpan ke transaksi_midtrans (status: pending)
    const { data: transaksi, error: txError } = await supabase
      .from("transaksi_midtrans")
      .insert({
        order_id: orderId,
        user_id: user.id,
        total_amount: totalAmount,
        status: "pending",
        expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (txError) throw txError;

    // 8. Simpan detail item
    const itemsToInsert = validatedItems.map((item) => ({
      transaksi_id: transaksi.id,
      siswa_id: item.siswa_id,
      jenis_id: item.jenis_id,
      bulan: item.bulan,
      jumlah: item.jumlah,
      nama_item: `${item.jenis_nama} - ${item.nama_siswa} - ${NAMA_BULAN[item.bulan]}`,
      departemen_id: item.departemen_id || null,
      tahun_ajaran_id: item.tahun_ajaran_id || null,
    }));

    const { error: itemError } = await supabase
      .from("transaksi_midtrans_item")
      .insert(itemsToInsert);

    if (itemError) throw itemError;

    // 9. Panggil Midtrans Snap API
    const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;
    const MIDTRANS_BASE_URL = MIDTRANS_SERVER_KEY.startsWith("SB-")
      ? "https://app.sandbox.midtrans.com"
      : "https://app.midtrans.com";

    const authString = btoa(`${MIDTRANS_SERVER_KEY}:`);

    const midtransPayload = {
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(totalAmount),
      },
      customer_details: {
        first_name: customer.nama,
        email: customer.email,
        phone: customer.telepon || "",
      },
      item_details: items.map((item, idx) => ({
        id: `ITEM-${idx + 1}-${item.bulan}`,
        price: Math.round(item.jumlah),
        quantity: 1,
        name: `${item.jenis_nama} ${NAMA_BULAN[item.bulan]} - ${item.nama_siswa}`.substring(0, 50),
      })),
      callbacks: {
        finish: `${req.headers.get("origin") || "http://localhost:5173"}/portal/pembayaran?order=${orderId}`,
        unfinish: `${req.headers.get("origin") || "http://localhost:5173"}/portal/tagihan`,
        error: `${req.headers.get("origin") || "http://localhost:5173"}/portal/tagihan`,
      },
      expiry: {
        unit: "hours",
        duration: 24,
      },
      enabled_payments: [
        "credit_card",
        "bca_va", "bni_va", "bri_va", "permata_va", "other_va",
        "gopay", "shopeepay", "qris",
        "indomaret", "alfamart",
      ],
    };

    const midtransRes = await fetch(
      `${MIDTRANS_BASE_URL}/snap/v1/transactions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${authString}`,
        },
        body: JSON.stringify(midtransPayload),
      }
    );

    const midtransData = await midtransRes.json();

    if (!midtransRes.ok || !midtransData.token) {
      console.error("Midtrans error:", midtransData);
      // Rollback
      await supabase
        .from("transaksi_midtrans")
        .delete()
        .eq("id", transaksi.id);
      throw new Error(
        midtransData.error_messages?.[0] || "Gagal membuat transaksi Midtrans"
      );
    }

    // 10. Simpan snap_token
    await supabase
      .from("transaksi_midtrans")
      .update({ snap_token: midtransData.token })
      .eq("id", transaksi.id);

    // 11. Return snap_token ke frontend
    return new Response(
      JSON.stringify({
        success: true,
        snap_token: midtransData.token,
        order_id: orderId,
        transaksi_id: transaksi.id,
        total_amount: totalAmount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("create-payment error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.message.includes("Unauthorized") ? 401 : 400,
      }
    );
  }
});
