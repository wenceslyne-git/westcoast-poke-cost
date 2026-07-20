-- Security tab backend: list + force-end auth sessions.
-- Run in Supabase SQL Editor. Safe to re-run (create or replace).
-- Only the 3 owner emails may call these; everyone else gets an error.

create or replace function list_active_sessions()
returns table(session_id uuid, email text, created_at timestamptz, refreshed_at timestamptz, user_agent text)
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'email','') not in
     ('wenceslyne@elitelvlservices.com','sbgomez604@gmail.com','r_gomez_02@yahoo.com') then
    raise exception 'Not authorized';
  end if;
  return query
    select s.id::uuid, u.email::text, s.created_at::timestamptz, s.refreshed_at::timestamptz, s.user_agent::text
    from auth.sessions s
    join auth.users u on u.id = s.user_id
    order by coalesce(s.refreshed_at, s.created_at) desc;
end;
$$;

create or replace function end_session(sid uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'email','') not in
     ('wenceslyne@elitelvlservices.com','sbgomez604@gmail.com','r_gomez_02@yahoo.com') then
    raise exception 'Not authorized';
  end if;
  -- Refuse to end your own session from here (the app disables the button too)
  if sid::text = coalesce(auth.jwt()->>'session_id','') then
    raise exception 'Use Sign out to end your own session';
  end if;
  delete from auth.refresh_tokens where session_id = sid;
  delete from auth.sessions where id = sid;
end;
$$;

-- Lock down who may even attempt the call (the email check above is the real gate)
revoke all on function list_active_sessions() from public, anon;
revoke all on function end_session(uuid) from public, anon;
grant execute on function list_active_sessions() to authenticated;
grant execute on function end_session(uuid) to authenticated;
