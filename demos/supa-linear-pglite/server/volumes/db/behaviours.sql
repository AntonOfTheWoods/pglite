ALTER PUBLICATION supabase_realtime ADD TABLE tasks, deals;

CREATE POLICY allow_authenticated_uploads
ON storage.objects
FOR ALL
TO AUTHENTICATED
USING (bucket_id = 'uploads')
WITH CHECK (bucket_id = 'uploads');

CREATE POLICY allow_logo_uploads
ON storage.objects
FOR ALL
TO AUTHENTICATED
USING (bucket_id = 'logos')
WITH CHECK (bucket_id = 'logos');
