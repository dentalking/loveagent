-- LoveAgent MVP Schema
-- "Love First, Know Later" - Critical Events 기반 매칭 서비스

-- ============================================
-- 1. USERS 테이블
-- ============================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  gender text not null check (gender in ('male', 'female')),
  birth_year int not null check (birth_year >= 1960 and birth_year <= 2010),
  location text not null,
  bio text,
  profile_image_url text,
  is_profile_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 인덱스
create index idx_users_gender on public.users(gender);
create index idx_users_location on public.users(location);

-- ============================================
-- 2. SCENARIOS 테이블 (Critical Events 시나리오)
-- ============================================
create table public.scenarios (
  id serial primary key,
  title text not null,
  description text not null,
  category text not null check (category in ('conflict', 'values', 'lifestyle', 'future', 'trust')),
  is_active boolean default true,
  display_order int not null,
  created_at timestamptz default now()
);

-- ============================================
-- 3. SCENARIO_OPTIONS 테이블 (각 시나리오의 선택지)
-- ============================================
create table public.scenario_options (
  id serial primary key,
  scenario_id int not null references public.scenarios(id) on delete cascade,
  option_text text not null,
  option_code text not null, -- 'A', 'B', 'C', 'D'
  personality_vector jsonb, -- 성향 벡터 (추후 매칭에 활용)
  display_order int not null,
  created_at timestamptz default now()
);

create index idx_scenario_options_scenario on public.scenario_options(scenario_id);

-- ============================================
-- 4. USER_SCENARIO_RESPONSES 테이블 (사용자 응답)
-- ============================================
create table public.user_scenario_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  scenario_id int not null references public.scenarios(id) on delete cascade,
  selected_option_id int not null references public.scenario_options(id) on delete cascade,
  response_time_seconds int, -- 응답 시간 (고민 정도 측정)
  created_at timestamptz default now(),

  unique(user_id, scenario_id) -- 한 시나리오당 하나의 응답만
);

create index idx_user_responses_user on public.user_scenario_responses(user_id);

-- ============================================
-- 5. MATCHES 테이블 (매칭 결과)
-- ============================================
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.users(id) on delete cascade,
  user_b_id uuid not null references public.users(id) on delete cascade,
  compatibility_score float not null check (compatibility_score >= 0 and compatibility_score <= 100),
  match_reason text, -- AI가 생성한 매칭 이유

  -- 양측 수락 상태
  user_a_status text default 'pending' check (user_a_status in ('pending', 'accepted', 'rejected')),
  user_b_status text default 'pending' check (user_b_status in ('pending', 'accepted', 'rejected')),

  -- 매칭 완료 여부 (양측 모두 수락 시)
  is_matched boolean default false,
  matched_at timestamptz,

  created_at timestamptz default now(),

  -- 중복 매칭 방지
  unique(user_a_id, user_b_id),
  check (user_a_id < user_b_id) -- 순서 강제로 중복 방지
);

create index idx_matches_user_a on public.matches(user_a_id);
create index idx_matches_user_b on public.matches(user_b_id);
create index idx_matches_is_matched on public.matches(is_matched);

-- ============================================
-- 6. MESSAGES 테이블 (채팅)
-- ============================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index idx_messages_match on public.messages(match_id, created_at);
create index idx_messages_sender on public.messages(sender_id);

-- ============================================
-- 7. UPDATED_AT 자동 갱신 트리거
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

-- ============================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Users 테이블
alter table public.users enable row level security;

create policy "Users can view other users"
  on public.users for select
  using (true);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = id);

-- Scenarios 테이블 (모든 사용자 조회 가능)
alter table public.scenarios enable row level security;

create policy "Anyone can view scenarios"
  on public.scenarios for select
  using (true);

-- Scenario Options 테이블
alter table public.scenario_options enable row level security;

create policy "Anyone can view scenario options"
  on public.scenario_options for select
  using (true);

-- User Scenario Responses 테이블
alter table public.user_scenario_responses enable row level security;

create policy "Users can view own responses"
  on public.user_scenario_responses for select
  using (auth.uid() = user_id);

create policy "Users can insert own responses"
  on public.user_scenario_responses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own responses"
  on public.user_scenario_responses for update
  using (auth.uid() = user_id);

-- Matches 테이블
alter table public.matches enable row level security;

create policy "Users can view own matches"
  on public.matches for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

create policy "Users can update own match status"
  on public.matches for update
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- Messages 테이블
alter table public.messages enable row level security;

create policy "Users can view messages in their matches"
  on public.messages for select
  using (
    exists (
      select 1 from public.matches
      where matches.id = messages.match_id
      and (matches.user_a_id = auth.uid() or matches.user_b_id = auth.uid())
      and matches.is_matched = true
    )
  );

create policy "Users can send messages in their matches"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches
      where matches.id = match_id
      and (matches.user_a_id = auth.uid() or matches.user_b_id = auth.uid())
      and matches.is_matched = true
    )
  );
