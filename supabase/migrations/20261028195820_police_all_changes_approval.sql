create table public.police_change_requests (
 id uuid primary key default gen_random_uuid(),
 action text not null,
 resource_key text not null,
 requested_by text not null,
 requested_by_name text not null,
 requested_at timestamptz not null default now(),
 payload jsonb not null,
 before_state jsonb not null,
 fingerprint text not null,
 status text not null default 'pending' check(status in ('pending','processing','approved','rejected','failed')),
 reviewed_by text,
 reviewed_by_name text,
 reviewed_at timestamptz,
 review_reason text,
 result_message text
);
create unique index police_change_request_pending on public.police_change_requests(action,resource_key) where status in ('pending','processing');
create index police_change_requests_status_date on public.police_change_requests(status,requested_at desc);
alter table public.police_change_requests enable row level security;
revoke all on public.police_change_requests from anon,authenticated;
grant select,insert,update on public.police_change_requests to service_role;
