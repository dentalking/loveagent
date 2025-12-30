-- ============================================
-- RLS 정책 버그 수정
-- user_scenario_responses UPDATE 정책에 with check 추가
-- ============================================

-- 기존 UPDATE 정책 삭제
drop policy if exists "Users can update own responses" on public.user_scenario_responses;

-- UPDATE 정책 재생성 (with check 추가)
create policy "Users can update own responses"
  on public.user_scenario_responses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Matches 테이블 UPDATE 정책도 수정
drop policy if exists "Users can update own match status" on public.matches;

create policy "Users can update own match status"
  on public.matches for update
  using (auth.uid() = user_a_id or auth.uid() = user_b_id)
  with check (auth.uid() = user_a_id or auth.uid() = user_b_id);
