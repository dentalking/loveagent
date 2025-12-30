-- ============================================
-- Users 테이블 RLS 정책 수정
-- UPDATE 정책에 with check 추가
-- ============================================

-- 기존 UPDATE 정책 삭제
drop policy if exists "Users can update own profile" on public.users;

-- UPDATE 정책 재생성 (with check 추가)
create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
