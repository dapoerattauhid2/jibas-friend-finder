
-- Storage policies for dokumen-buletin bucket
CREATE POLICY "Admin upload buletin" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dokumen-buletin' AND is_admin_or_kepala(auth.uid()));

CREATE POLICY "Auth download buletin" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dokumen-buletin');

CREATE POLICY "Admin delete buletin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dokumen-buletin' AND is_admin_or_kepala(auth.uid()));
