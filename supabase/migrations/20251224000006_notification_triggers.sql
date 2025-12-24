-- Notification triggers for automatic push notifications
-- Uses pg_net extension to call Edge Functions

-- Enable pg_net extension (for HTTP calls from triggers)
create extension if not exists pg_net with schema extensions;

-- Helper function to call send-notification Edge Function
create or replace function call_send_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  notification_data jsonb default '{}'::jsonb
) returns void as $$
declare
  supabase_url text;
  service_role_key text;
begin
  -- Get Supabase URL from environment (set in Supabase dashboard)
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);

  -- If settings not available, skip (will be set in production)
  if supabase_url is null or service_role_key is null then
    return;
  end if;

  -- Call Edge Function via pg_net
  perform net.http_post(
    url := supabase_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'user_id', target_user_id,
      'type', notification_type,
      'title', notification_title,
      'body', notification_body,
      'data', notification_data
    )
  );
end;
$$ language plpgsql security definer;

-- Trigger function: New message notification
create or replace function notify_new_message()
returns trigger as $$
declare
  match_record record;
  sender_name text;
  recipient_id uuid;
begin
  -- Get match details
  select * into match_record
  from matches
  where id = new.match_id;

  -- Determine recipient (the other user)
  if match_record.user_a_id = new.sender_id then
    recipient_id := match_record.user_b_id;
  else
    recipient_id := match_record.user_a_id;
  end if;

  -- Get sender name
  select nickname into sender_name
  from users
  where id = new.sender_id;

  -- Send notification
  perform call_send_notification(
    recipient_id,
    'new_message',
    sender_name || '님의 메시지',
    new.content,
    jsonb_build_object(
      'matchId', new.match_id,
      'partnerName', sender_name
    )
  );

  return new;
end;
$$ language plpgsql security definer;

-- Trigger: New message
drop trigger if exists on_new_message on messages;
create trigger on_new_message
  after insert on messages
  for each row
  execute function notify_new_message();

-- Trigger function: New match notification
create or replace function notify_new_match()
returns trigger as $$
declare
  user_a_name text;
  user_b_name text;
begin
  -- Get user names
  select nickname into user_a_name from users where id = new.user_a_id;
  select nickname into user_b_name from users where id = new.user_b_id;

  -- Notify both users
  perform call_send_notification(
    new.user_a_id,
    'new_match',
    '새로운 매칭!',
    '새로운 인연이 도착했어요. 확인해보세요!',
    jsonb_build_object('matchId', new.id)
  );

  perform call_send_notification(
    new.user_b_id,
    'new_match',
    '새로운 매칭!',
    '새로운 인연이 도착했어요. 확인해보세요!',
    jsonb_build_object('matchId', new.id)
  );

  return new;
end;
$$ language plpgsql security definer;

-- Trigger: New match created
drop trigger if exists on_new_match_notify on matches;
create trigger on_new_match_notify
  after insert on matches
  for each row
  execute function notify_new_match();

-- Trigger function: Match accepted notification
create or replace function notify_match_accepted()
returns trigger as $$
declare
  accepter_name text;
  other_user_id uuid;
begin
  -- Check if match just became mutual (both accepted)
  if new.is_matched = true and old.is_matched = false then
    -- Get names
    select nickname into accepter_name from users
    where id = case
      when old.user_a_status = 'pending' and new.user_a_status = 'accepted' then new.user_a_id
      else new.user_b_id
    end;

    -- Notify both users
    perform call_send_notification(
      new.user_a_id,
      'match_accepted',
      '매칭 성사!',
      '축하해요! 이제 대화를 시작해보세요.',
      jsonb_build_object('matchId', new.id)
    );

    perform call_send_notification(
      new.user_b_id,
      'match_accepted',
      '매칭 성사!',
      '축하해요! 이제 대화를 시작해보세요.',
      jsonb_build_object('matchId', new.id)
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Trigger: Match accepted
drop trigger if exists on_match_accepted_notify on matches;
create trigger on_match_accepted_notify
  after update on matches
  for each row
  execute function notify_match_accepted();
