alter table public.police_rank_requests add column if not exists steam_username text not null default '';
alter table public.police_personnel add column if not exists steam_username text not null default '';
