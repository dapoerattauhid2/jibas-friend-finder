
-- 1. Add kategori column to departemen
ALTER TABLE departemen
  ADD COLUMN IF NOT EXISTS kategori text;

-- 2. Create program_dana table
CREATE TABLE IF NOT EXISTS program_dana (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode          text NOT NULL UNIQUE,
  nama          text NOT NULL,
  jenis_dana    text NOT NULL,
  keterangan    text,
  aktif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE program_dana ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_program_dana"
  ON program_dana FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_keuangan_manage_program_dana"
  ON program_dana FOR ALL
  TO authenticated
  USING (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'::text))
  WITH CHECK (is_admin_or_kepala(auth.uid()) OR has_role(auth.uid(), 'keuangan'::text));

-- 3. Add program_dana_id to jurnal
ALTER TABLE jurnal
  ADD COLUMN IF NOT EXISTS program_dana_id uuid REFERENCES program_dana(id) ON DELETE SET NULL;

-- 4. Validation trigger for kategori
CREATE OR REPLACE FUNCTION public.validate_departemen_kategori()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kategori IS NOT NULL AND NEW.kategori NOT IN (
    'unit_pendidikan', 'unit_usaha', 'unit_dana_terikat', 'unit_yayasan'
  ) THEN
    RAISE EXCEPTION 'kategori tidak valid: %', NEW.kategori;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_departemen_kategori
  BEFORE INSERT OR UPDATE ON departemen
  FOR EACH ROW EXECUTE FUNCTION validate_departemen_kategori();

-- 5. Validation trigger for jenis_dana
CREATE OR REPLACE FUNCTION public.validate_program_dana_jenis()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.jenis_dana NOT IN ('terikat_temporer', 'terikat_permanen', 'lintas_unit') THEN
    RAISE EXCEPTION 'jenis_dana tidak valid: %', NEW.jenis_dana;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_program_dana_jenis
  BEFORE INSERT OR UPDATE ON program_dana
  FOR EACH ROW EXECUTE FUNCTION validate_program_dana_jenis();
