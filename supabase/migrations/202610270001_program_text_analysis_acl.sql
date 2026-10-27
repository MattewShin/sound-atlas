-- Scoped repair for already-created official text tables. No data/role/default ACL changes.
begin;

revoke all on table public.concert_program_text_analyses,public.concert_program_text_candidates
  from public,anon,authenticated,service_role;
grant select,insert,update on table public.concert_program_text_analyses,public.concert_program_text_candidates
  to service_role;

alter table public.concert_program_text_analyses enable row level security;
alter table public.concert_program_text_candidates enable row level security;

commit;
