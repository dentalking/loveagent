-- 닉네임 중복 체크 함수
-- 프로필 수정 시 자신의 닉네임은 제외하고 체크

create or replace function check_nickname_available(
  check_nickname text,
  exclude_user_id uuid default null
) returns boolean as $$
declare
  nickname_exists boolean;
begin
  if exclude_user_id is null then
    -- 회원가입 시: 모든 사용자 대상 체크
    select exists(
      select 1 from users 
      where lower(nickname) = lower(check_nickname)
    ) into nickname_exists;
  else
    -- 프로필 수정 시: 자신 제외하고 체크
    select exists(
      select 1 from users 
      where lower(nickname) = lower(check_nickname)
      and id != exclude_user_id
    ) into nickname_exists;
  end if;
  
  -- true면 사용 가능, false면 이미 존재
  return not nickname_exists;
end;
$$ language plpgsql security definer;

-- 닉네임 인덱스 추가 (대소문자 무시 검색 최적화)
create index if not exists idx_users_nickname_lower on public.users(lower(nickname));
