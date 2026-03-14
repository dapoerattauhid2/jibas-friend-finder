
ALTER TABLE public.departemen
  ADD COLUMN IF NOT EXISTS alamat text,
  ADD COLUMN IF NOT EXISTS kota text,
  ADD COLUMN IF NOT EXISTS telepon text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS kepala_sekolah text,
  ADD COLUMN IF NOT EXISTS npsn text,
  ADD COLUMN IF NOT EXISTS akreditasi text,
  ADD COLUMN IF NOT EXISTS logo_url text;
