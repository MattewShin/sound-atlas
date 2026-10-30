-- Independent cache. Keep unused on application rollback; never drop historical data.
create table public.concert_browser_cache (
  cache_key text primary key,
  cache_kind text not null check (cache_kind in ('list', 'detail')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  fetched_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint concert_browser_cache_key_check check (
    (cache_kind = 'list' and cache_key ~ '^list:v1:[a-f0-9]{64}$') or
    (cache_kind = 'detail' and cache_key ~ '^detail:v1:PF[0-9]{1,12}$')
  ),
  constraint concert_browser_cache_payload_shape_check check (
    (cache_kind = 'list' and jsonb_typeof(payload->'concerts') = 'array' and payload ? 'concerts') or
    (cache_kind = 'detail' and jsonb_typeof(payload->'concert') = 'object' and payload ? 'concert')
  )
);
alter table public.concert_browser_cache enable row level security;
revoke all on table public.concert_browser_cache from public, anon, authenticated, service_role;
grant select, insert, update on table public.concert_browser_cache to service_role;
comment on table public.concert_browser_cache is 'Server-only complete public KOPIS list/detail snapshots; no credentials, upstream queries or raw XML/logs.';
notify pgrst, 'reload schema';
