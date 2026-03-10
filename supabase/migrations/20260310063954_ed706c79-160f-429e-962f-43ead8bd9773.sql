-- Allow ortu to read their children's data from siswa table
CREATE POLICY "ortu_siswa_select"
ON public.siswa
FOR SELECT
TO authenticated
USING (
  is_ortu_of(auth.uid(), id)
);
