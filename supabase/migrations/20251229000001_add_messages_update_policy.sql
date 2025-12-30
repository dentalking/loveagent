-- 메시지 읽음 표시 업데이트를 위한 RLS 정책 추가
create policy "Users can update read status in their matches"
  on public.messages for update
  using (
    exists (
      select 1 from public.matches
      where matches.id = messages.match_id
      and (matches.user_a_id = auth.uid() or matches.user_b_id = auth.uid())
      and matches.is_matched = true
    )
  )
  with check (
    -- 자신이 받은 메시지의 is_read만 업데이트 가능
    sender_id != auth.uid()
  );
