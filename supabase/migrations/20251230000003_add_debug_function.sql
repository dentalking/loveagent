-- Debug function to check auth.uid()
create or replace function public.get_auth_uid()
returns uuid
language sql
security definer
as $$
  select auth.uid();
$$;
