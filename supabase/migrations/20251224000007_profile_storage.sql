-- Create storage bucket for profile images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profiles',
  'profiles',
  true,  -- public bucket for profile images
  5242880,  -- 5MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Storage policies for profile images

-- Anyone can view profile images (public bucket)
create policy "Public can view profile images"
  on storage.objects for select
  using (bucket_id = 'profiles');

-- Users can upload their own profile image
create policy "Users can upload own profile image"
  on storage.objects for insert
  with check (
    bucket_id = 'profiles'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can update their own profile image
create policy "Users can update own profile image"
  on storage.objects for update
  using (
    bucket_id = 'profiles'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own profile image
create policy "Users can delete own profile image"
  on storage.objects for delete
  using (
    bucket_id = 'profiles'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
