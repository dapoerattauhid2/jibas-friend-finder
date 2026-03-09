ALTER TABLE public.jenis_pembayaran ADD COLUMN tipe text NOT NULL DEFAULT 'bulanan';
COMMENT ON COLUMN public.jenis_pembayaran.tipe IS 'bulanan = monthly payment (12x), sekali = one-time payment';