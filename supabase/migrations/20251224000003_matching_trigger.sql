-- 프로필 완료 시 자동 매칭 실행을 위한 함수
-- Edge Function을 직접 호출하는 대신 DB에서 매칭 로직 실행

-- 매칭 점수 계산 함수
create or replace function calculate_compatibility_score(
  user_a_id uuid,
  user_b_id uuid
) returns float as $$
declare
  score float := 0;
  same_choices int := 0;
  total_scenarios int := 0;
  user_a_responses record;
  user_b_option int;
begin
  -- 두 사용자의 시나리오 응답 비교
  for user_a_responses in
    select scenario_id, selected_option_id
    from user_scenario_responses
    where user_id = user_a_id
  loop
    total_scenarios := total_scenarios + 1;

    select selected_option_id into user_b_option
    from user_scenario_responses
    where user_id = user_b_id and scenario_id = user_a_responses.scenario_id;

    if user_b_option = user_a_responses.selected_option_id then
      same_choices := same_choices + 1;
    end if;
  end loop;

  if total_scenarios = 0 then
    return 50.0; -- 기본값
  end if;

  -- 기본 점수: 같은 선택 비율 (50-100 범위)
  score := 50.0 + (same_choices::float / total_scenarios::float) * 50.0;

  -- 약간의 랜덤성 추가 (±5)
  score := score + (random() * 10 - 5);

  -- 범위 제한
  return greatest(0, least(100, score));
end;
$$ language plpgsql;

-- 매칭 이유 생성 함수
create or replace function generate_match_reason(
  user_a_id uuid,
  user_b_id uuid,
  compatibility_score float
) returns text as $$
declare
  same_choices int := 0;
  total_scenarios int := 0;
  reason text := '';
begin
  -- 같은 선택 개수 계산
  select count(*) into same_choices
  from user_scenario_responses a
  join user_scenario_responses b
    on a.scenario_id = b.scenario_id
    and a.selected_option_id = b.selected_option_id
  where a.user_id = user_a_id and b.user_id = user_b_id;

  select count(*) into total_scenarios
  from user_scenario_responses
  where user_id = user_a_id;

  -- 이유 생성
  if same_choices >= 4 then
    reason := '가치관이 매우 잘 맞아요! ';
  elsif same_choices >= 3 then
    reason := '중요한 가치관이 비슷해요. ';
  elsif same_choices >= 2 then
    reason := '몇 가지 공통점이 있어요. ';
  else
    reason := '새로운 관점을 배울 수 있어요. ';
  end if;

  if compatibility_score >= 80 then
    reason := reason || '좋은 인연이 될 가능성이 높아요.';
  elsif compatibility_score >= 65 then
    reason := reason || '대화가 잘 통할 것 같아요.';
  else
    reason := reason || '서로에게 새로운 시각을 줄 수 있어요.';
  end if;

  return reason;
end;
$$ language plpgsql;

-- 새 사용자를 위한 매칭 생성 함수
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
  -- 대상 사용자 정보 조회
  select * into target_user
  from users
  where id = target_user_id and is_profile_complete = true;

  if target_user is null then
    return 0;
  end if;

  -- 반대 성별의 프로필 완료된 사용자들과 매칭
  for candidate in
    select u.id
    from users u
    where u.gender != target_user.gender
      and u.is_profile_complete = true
      and u.id != target_user_id
      -- 이미 매칭된 사용자 제외
      and not exists (
        select 1 from matches m
        where (m.user_a_id = target_user_id and m.user_b_id = u.id)
           or (m.user_a_id = u.id and m.user_b_id = target_user_id)
      )
    limit 10 -- 최대 10명까지만 매칭
  loop
    -- 호환성 점수 계산
    score := calculate_compatibility_score(target_user_id, candidate.id);

    -- 최소 점수 이상인 경우만 매칭
    if score >= 50 then
      reason := generate_match_reason(target_user_id, candidate.id, score);

      -- user_a_id < user_b_id 순서 보장
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
$$ language plpgsql;

-- 프로필 완료 시 자동 매칭 트리거
create or replace function trigger_auto_matching()
returns trigger as $$
begin
  -- is_profile_complete가 false에서 true로 변경될 때만 실행
  if old.is_profile_complete = false and new.is_profile_complete = true then
    perform create_matches_for_user(new.id);
  end if;
  return new;
end;
$$ language plpgsql;

-- 트리거 생성
drop trigger if exists on_profile_complete on users;
create trigger on_profile_complete
  after update on users
  for each row
  execute function trigger_auto_matching();

-- 양측 수락 시 is_matched 자동 업데이트 트리거
create or replace function update_match_status()
returns trigger as $$
begin
  if new.user_a_status = 'accepted' and new.user_b_status = 'accepted' then
    new.is_matched := true;
    new.matched_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_match_status_change on matches;
create trigger on_match_status_change
  before update on matches
  for each row
  execute function update_match_status();
