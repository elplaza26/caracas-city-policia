-- Longer administrative sessions; keep ownership, revocation and hard expiry checks.
create or replace function public.panel_touch_session(p_id uuid,p_user text)
returns boolean language sql security invoker set search_path=public as $$
 with touched as (
  update public.police_panel_sessions set last_seen_at=now()
  where id=p_id and discord_user_id=p_user and revoked_at is null
    and expires_at>now() and last_seen_at>now()-interval '24 hours'
  returning id
 ) select exists(select from touched);
$$;
revoke all on function public.panel_touch_session(uuid,text) from public,anon,authenticated;
grant execute on function public.panel_touch_session(uuid,text) to service_role;
