ALTER TABLE public.jurnal
  ADD COLUMN IF NOT EXISTS tipe text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS jurnal_asal_id uuid REFERENCES public.jurnal(id);

COMMENT ON COLUMN public.jurnal.tipe IS 'normal=jurnal biasa, pembalik=jurnal koreksi pembalik, pengganti=jurnal koreksi pengganti';
COMMENT ON COLUMN public.jurnal.jurnal_asal_id IS 'ID jurnal asli yang menjadi dasar koreksi';

CREATE INDEX IF NOT EXISTS idx_jurnal_jurnal_asal_id ON public.jurnal(jurnal_asal_id);
CREATE INDEX IF NOT EXISTS idx_jurnal_tipe ON public.jurnal(tipe);