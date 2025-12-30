-- ============================================
-- Fix matching function to bypass RLS
-- The function needs SECURITY DEFINER to insert into matches table
-- since there's no INSERT policy for regular users
-- ============================================

-- Recreate create_matches_for_user with SECURITY DEFINER
create or replace function create_matches_for_user(target_user_id uuid)
returns int as $$
declare
  target_user record;
  candidate record;
  new_matches int := 0;
  score float;
  reason text;
  ordered_ids uuid[];
begin
  -- Get target user info
  select * into target_user
  from users
  where id = target_user_id and is_profile_complete = true;

  if target_user is null then
    return 0;
  end if;

  -- Match with opposite gender users who have completed profiles
  for candidate in
    select u.id
    from users u
    where u.gender != target_user.gender
      and u.is_profile_complete = true
      and u.id != target_user_id
      -- Exclude already matched users
      and not exists (
        select 1 from matches m
        where (m.user_a_id = target_user_id and m.user_b_id = u.id)
           or (m.user_a_id = u.id and m.user_b_id = target_user_id)
      )
    limit 10
  loop
    -- Calculate compatibility score
    score := calculate_compatibility_score(target_user_id, candidate.id);

    -- Only create match if score is above minimum
    if score >= 50 then
      reason := generate_match_reason(target_user_id, candidate.id, score);

      -- Ensure user_a_id < user_b_id ordering
      if target_user_id < candidate.id then
        ordered_ids := array[target_user_id, candidate.id];
      else
        ordered_ids := array[candidate.id, target_user_id];
      end if;

      insert into matches (user_a_id, user_b_id, compatibility_score, match_reason)
      values (ordered_ids[1], ordered_ids[2], score, reason)
      on conflict (user_a_id, user_b_id) do nothing;

      new_matches := new_matches + 1;
    end if;
  end loop;

  return new_matches;
end;
$$ language plpgsql security definer;

-- Recreate trigger function with SECURITY DEFINER
create or replace function trigger_auto_matching()
returns trigger as $$
begin
  -- Only run when is_profile_complete changes from false to true
  if old.is_profile_complete = false and new.is_profile_complete = true then
    perform create_matches_for_user(new.id);
  end if;
  return new;
end;
$$ language plpgsql security definer;
