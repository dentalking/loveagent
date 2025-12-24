-- Push notification tokens table
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  device_type text check (device_type in ('ios', 'android', 'web')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(user_id, token)
);

create index idx_push_tokens_user on public.push_tokens(user_id);
create index idx_push_tokens_active on public.push_tokens(is_active) where is_active = true;

-- RLS for push_tokens
alter table public.push_tokens enable row level security;

create policy "Users can manage own push tokens"
  on public.push_tokens for all
  using (auth.uid() = user_id);

-- Notification log table (for tracking sent notifications)
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('new_match', 'match_accepted', 'new_message')),
  title text not null,
  body text not null,
  data jsonb,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index idx_notification_logs_user on public.notification_logs(user_id, created_at desc);

-- RLS for notification_logs
alter table public.notification_logs enable row level security;

create policy "Users can view own notifications"
  on public.notification_logs for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notification_logs for update
  using (auth.uid() = user_id);

-- Updated_at trigger for push_tokens
create trigger push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function update_updated_at();

-- Function to get user's active push tokens
create or replace function get_user_push_tokens(target_user_id uuid)
returns table(token text, device_type text) as $$
begin
  return query
  select pt.token, pt.device_type
  from push_tokens pt
  where pt.user_id = target_user_id
    and pt.is_active = true;
end;
$$ language plpgsql security definer;

-- Function to send notification (to be called from Edge Function)
create or replace function log_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  notification_data jsonb default null
) returns uuid as $$
declare
  log_id uuid;
begin
  insert into notification_logs (user_id, type, title, body, data)
  values (target_user_id, notification_type, notification_title, notification_body, notification_data)
  returning id into log_id;

  return log_id;
end;
$$ language plpgsql security definer;
