import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { getTarifBatch } from "@/hooks/useTarifTagihan";

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

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

interface TagihanItem {
  siswa_id: string;
  nama_siswa: string;
  nis: string;
  kelas_nama: string;
  departemen_nama: string;
  departemen_kode: string;
  departemen_id: string;
  jenis_id: string;
  jenis_nama: string;
  nominal: number;
  bulan: number;
  tahun_ajaran_id: string;
  tahun_ajaran_nama: string;
}

export default function PortalTagihan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Get anak IDs
  const { data: anakIds = [] } = useQuery({
    queryKey: ["portal-anak-ids", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ortu_siswa")
        .select("siswa_id")
        .eq("user_id", user!.id);
      return (data || []).map((d: any) => d.siswa_id);
    },
    enabled: !!user,
  });

  // Get tagihan belum bayar
  const { data: tagihan = [], isLoading } = useQuery({
    queryKey: ["portal-tagihan", anakIds],
    queryFn: async () => {
      if (anakIds.length === 0) return [];
      const { data } = await supabase
        .from("v_tagihan_belum_bayar")
        .select("*")
        .in("siswa_id", anakIds)
        .eq("sudah_bayar", false)
        .order("nama_siswa")
        .order("bulan");
      
      const items = (data || []) as TagihanItem[];
      
      // Get unique jenis_ids and apply per-student tarif
      const jenisIds = [...new Set(items.map(t => t.jenis_id))];
      for (const jId of jenisIds) {
        const relevantItems = items.filter(t => t.jenis_id === jId);
        const siswaIds = [...new Set(relevantItems.map(t => t.siswa_id))];
        const tarifMap = await getTarifBatch(jId, siswaIds);
        relevantItems.forEach(t => {
          const tarif = tarifMap.get(t.siswa_id);
          if (tarif != null) t.nominal = tarif;
        });
      }
      
      return items;
    },
    enabled: anakIds.length > 0,
  });

  // Group by siswa
  const grouped = useMemo(() => {
    const map = new Map<string, TagihanItem[]>();
    tagihan.forEach((t) => {
      const list = map.get(t.siswa_id) || [];
      list.push(t);
      map.set(t.siswa_id, list);
    });
    return map;
  }, [tagihan]);

  const getKey = (t: TagihanItem) =>
    `${t.siswa_id}-${t.jenis_id}-${t.bulan}`;

  const toggleItem = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllForSiswa = (siswaId: string) => {
    const items = grouped.get(siswaId) || [];
    const keys = items.map(getKey);
    const allSelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const selectedItems = tagihan.filter((t) => selected.has(getKey(t)));
  const totalSelected = selectedItems.reduce(
    (sum, t) => sum + (t.nominal || 0),
    0
  );

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      toast.warning("Pilih minimal satu tagihan");
      return;
    }
    sessionStorage.setItem(
      "keranjang_tagihan",
      JSON.stringify(
        selectedItems.map((t) => ({
          siswa_id: t.siswa_id,
          nama_siswa: t.nama_siswa,
          jenis_id: t.jenis_id,
          jenis_nama: t.jenis_nama,
          bulan: t.bulan,
          jumlah: t.nominal,
          departemen_id: t.departemen_id,
          departemen_nama: t.departemen_nama,
          tahun_ajaran_id: t.tahun_ajaran_id,
          kelas_nama: t.kelas_nama,
        }))
      )
    );
    navigate("/portal/checkout");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tagihan</h1>
          <p className="text-sm text-muted-foreground">
            Pilih tagihan yang ingin dibayar
          </p>
        </div>
        {selectedItems.length > 0 && (
          <Button
            onClick={handleCheckout}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Bayar {selectedItems.length} item — {formatRupiah(totalSelected)}
          </Button>
        )}
      </div>

      {tagihan.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            🎉 Tidak ada tagihan yang belum dibayar
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([siswaId, items]) => {
          const first = items[0];
          const allKeys = items.map(getKey);
          const allChecked = allKeys.every((k) => selected.has(k));
          const subtotal = items
            .filter((t) => selected.has(getKey(t)))
            .reduce((s, t) => s + (t.nominal || 0), 0);

          return (
            <Card key={siswaId}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={() => selectAllForSiswa(siswaId)}
                  />
                  <div>
                    <CardTitle className="text-base">
                      {first.nama_siswa}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {first.departemen_nama} — {first.kelas_nama} • NIS:{" "}
                      {first.nis || "-"}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {items.map((t) => {
                    const key = getKey(t);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-muted/30 px-1 rounded"
                        onClick={() => toggleItem(key)}
                      >
                        <Checkbox checked={selected.has(key)} />
                        <div className="flex-1">
                          <span className="text-sm font-medium">
                            {t.jenis_nama}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {NAMA_BULAN[t.bulan]}
                          </span>
                        </div>
                        <span className="text-sm font-semibold">
                          {formatRupiah(t.nominal || 0)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {subtotal > 0 && (
                  <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Subtotal {first.nama_siswa}
                    </span>
                    <span className="font-bold text-emerald-700">
                      {formatRupiah(subtotal)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Floating checkout button mobile */}
      {selectedItems.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:hidden z-40">
          <Button
            onClick={handleCheckout}
            className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-lg h-12 text-base"
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            Bayar {selectedItems.length} item — {formatRupiah(totalSelected)}
          </Button>
        </div>
      )}
    </div>
  );
}
