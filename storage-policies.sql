-- =============================================================================
-- Supabase Storage RLS Policies
-- Phase 2 — Rooms Management
-- =============================================================================
-- Run this in the Supabase SQL Editor.
-- These policies live on the storage.objects table (built-in to Supabase).
-- =============================================================================


-- =============================================================================
-- BUCKET: room-photos  (public bucket)
-- =============================================================================
-- Reads are already public (because the bucket is configured as Public),
-- but writing/deleting requires authentication.

create policy "Anyone can view room photos"
on storage.objects for select
to public
using (bucket_id = 'room-photos');

create policy "Authenticated users can upload room photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'room-photos');

create policy "Authenticated users can update room photos"
on storage.objects for update
to authenticated
using (bucket_id = 'room-photos')
with check (bucket_id = 'room-photos');

create policy "Authenticated users can delete room photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'room-photos');


-- =============================================================================
-- BUCKET: guest-id-proofs  (private bucket)
-- =============================================================================
-- Only authenticated staff/admin can read or write here.
-- Note: anyone reading also needs a signed URL — RLS is the gate for the
-- direct API. Bucket Public toggle being OFF ensures URLs aren't guessable.

create policy "Authenticated users can view guest ID proofs"
on storage.objects for select
to authenticated
using (bucket_id = 'guest-id-proofs');

create policy "Authenticated users can upload guest ID proofs"
on storage.objects for insert
to authenticated
with check (bucket_id = 'guest-id-proofs');

create policy "Authenticated users can update guest ID proofs"
on storage.objects for update
to authenticated
using (bucket_id = 'guest-id-proofs')
with check (bucket_id = 'guest-id-proofs');

create policy "Authenticated users can delete guest ID proofs"
on storage.objects for delete
to authenticated
using (bucket_id = 'guest-id-proofs');


-- =============================================================================
-- DONE. Verify with:
--   select * from pg_policies where schemaname = 'storage' and tablename = 'objects';
-- =============================================================================
