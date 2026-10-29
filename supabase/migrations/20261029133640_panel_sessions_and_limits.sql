create table public.police_panel_sessions (
 id uuid primary key, discord_user_id text not null, device_label text not null default '',
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz
);
create index police_panel_sessions_member on public.police_panel_sessions(discord_user_id,created_at desc);
alter table public.police_panel_sessions enable row level security;
revoke all on public.police_panel_sessions from anon,authenticated;
grant select,insert,update,delete on public.police_panel_sessions to service_role;
create function public.panel_touch_session(p_id uuid,p_user text) returns boolean language sql security invoker set search_path=public as $$
 with touched as (update public.police_panel_sessions set last_seen_at=now() where id=p_id and discord_user_id=p_user and revoked_at is null and expires_at>now() and last_seen_at>now()-interval '30 minutes' returning id) select exists(select from touched);
$$;
revoke all on function public.panel_touch_session(uuid,text) from public,anon,authenticated;
grant execute on function public.panel_touch_session(uuid,text) to service_role;
create table public.police_panel_rate_limits (bucket_key text primary key, hits integer not null, expires_at timestamptz not null);
create index police_panel_rate_expiry on public.police_panel_rate_limits(expires_at);
alter table public.police_panel_rate_limits enable row level security;
revoke all on public.police_panel_rate_limits from anon,authenticated;
grant select,insert,update,delete on public.police_panel_rate_limits to service_role;
create function public.panel_consume_limit(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security invoker set search_path=public as $$
declare used integer;
begin
 if p_limit<1 or p_seconds<1 or length(p_key)>160 then return false; end if;
 delete from public.police_panel_rate_limits where expires_at<now()-interval '1 hour';
 insert into public.police_panel_rate_limits(bucket_key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(bucket_key) do update set hits=case when police_panel_rate_limits.expires_at<=now() then 1 else police_panel_rate_limits.hits+1 end,expires_at=case when police_panel_rate_limits.expires_at<=now() then now()+make_interval(secs=>p_seconds) else police_panel_rate_limits.expires_at end returning hits into used;
 return used<=p_limit;
end $$;
revoke all on function public.panel_consume_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.panel_consume_limit(text,integer,integer) to service_role;
