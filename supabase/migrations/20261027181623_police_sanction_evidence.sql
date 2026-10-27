alter table public.police_sanctions
  add column if not exists evidence_url text not null default '';
