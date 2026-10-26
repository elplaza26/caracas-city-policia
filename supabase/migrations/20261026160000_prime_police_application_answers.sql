alter table public.police_applications
  add column if not exists answers jsonb not null default '{}'::jsonb;

comment on column public.police_applications.answers is
  'PRIME POLICE application answers collected through the Discord form';
