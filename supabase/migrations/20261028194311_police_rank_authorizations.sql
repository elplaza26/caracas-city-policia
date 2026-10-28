create table public.police_rank_authorizations (
 id uuid primary key default gen_random_uuid(),
 target_id text not null check(target_id ~ '^[0-9]{17,20}$'),
 requested_by text not null,
 full_name text not null,
 previous_role_id text,
 new_role_id text not null,
 new_rank_name text not null,
 operation text not null check(operation in ('register','change')),
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','approved','rejected','failed')),
 requested_at timestamptz not null default now(),
 reviewed_by text,
 reviewed_at timestamptz,
 review_reason text
);
create unique index police_one_pending_rank_authorization on public.police_rank_authorizations(target_id) where status in ('pending','processing');
create index police_rank_authorizations_status_date on public.police_rank_authorizations(status,requested_at desc);
alter table public.police_rank_authorizations enable row level security;
revoke all on public.police_rank_authorizations from anon, authenticated;
grant select,insert,update on public.police_rank_authorizations to service_role;

create table public.police_operation_locks (
 key text primary key,
 lease_id uuid not null,
 expires_at timestamptz not null
);
alter table public.police_operation_locks enable row level security;
revoke all on public.police_operation_locks from anon,authenticated;
grant select,insert,delete on public.police_operation_locks to service_role;

create table public.police_audit_events (
 id bigint generated always as identity primary key,
 action text not null,
 fields jsonb not null,
 created_at timestamptz not null default now()
);
create index police_audit_events_created on public.police_audit_events(created_at desc);
alter table public.police_audit_events enable row level security;
revoke all on public.police_audit_events from anon,authenticated;
grant select,insert on public.police_audit_events to service_role;
grant usage,select on sequence public.police_audit_events_id_seq to service_role;

create function public.police_duty_summary(p_from timestamptz,p_to timestamptz)
returns table(discord_user_id text,full_name text,plate text,unit text,rank_name text,rank_role_id text,shift_count bigint,service_seconds numeric,last_activity timestamptz,open_since timestamptz)
language sql stable security invoker set search_path=public
as $$
 select p.discord_user_id,p.full_name,p.plate,p.unit,p.rank_name,p.rank_role_id,
 count(s.id) filter(where s.started_at<p_to and coalesce(s.ended_at,now())>=p_from),
 coalesce(sum(greatest(0,extract(epoch from (least(coalesce(s.ended_at,now()),p_to)-greatest(s.started_at,p_from))))) filter(where s.started_at<p_to and coalesce(s.ended_at,now())>=p_from),0),
 max(coalesce(s.ended_at,case when s.id is not null then now() end)),min(s.started_at) filter(where s.id is not null and s.ended_at is null)
 from public.police_personnel p left join public.police_duty_shifts s on s.discord_user_id=p.discord_user_id
 where p.status='active' and p.unit in ('UCOP','CIC')
 group by p.discord_user_id,p.full_name,p.plate,p.unit,p.rank_name,p.rank_role_id;
$$;
revoke all on function public.police_duty_summary(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.police_duty_summary(timestamptz,timestamptz) to service_role;
create index police_duty_shifts_member_started on public.police_duty_shifts(discord_user_id,started_at desc) include(ended_at);
