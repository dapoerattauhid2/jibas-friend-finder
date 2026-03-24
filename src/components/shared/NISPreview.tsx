import { parseNISComponents } from "@/utils/nisGenerator";

interface NISPreviewProps {
  npsn: string;
  namaKelas: string;
  namaAngkatan: string;
  estimasiUrut: number;
}

export function NISPreview({ npsn, namaKelas, namaAngkatan, estimasiUrut }: NISPreviewProps) {
  if (!npsn || !namaKelas || !namaAngkatan) return null;

  const c = parseNISComponents(npsn, namaKelas, namaAngkatan, estimasiUrut);

  const segments = [
    { value: c.npsn4, label: "NPSN", color: "bg-primary/10 text-primary border-primary/30" },
    { value: c.nomorUrut, label: "Urut", color: "bg-accent/50 text-accent-foreground border-accent/30" },
    { value: c.kodeRombel, label: "Rombel", color: "bg-secondary text-secondary-foreground border-secondary/50" },
    { value: c.tahun2, label: "Tahun", color: "bg-muted text-muted-foreground border-border" },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Preview NIS (estimasi)</p>
      <div className="flex items-center gap-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex flex-col items-center gap-1">
            <span className={`px-2 py-1 rounded border text-sm font-mono font-bold ${seg.color}`}>
              {seg.value}
            </span>
            <span className="text-[10px] text-muted-foreground">{seg.label}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        NIS: <span className="font-mono font-semibold text-foreground">{c.npsn4}{c.nomorUrut}{c.kodeRombel}{c.tahun2}</span>
      </p>
    </div>
  );
}
