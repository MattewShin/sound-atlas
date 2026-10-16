-- Read-only checks after migration 202610150001 and `analyze --save`.
select analysis.concert_id, concert.kopis_id, analysis.matcher_version, analysis.catalog_hash,
  analysis.is_current, count(candidate.id) as candidates
from public.concert_program_analyses analysis
join public.concerts concert on concert.id = analysis.concert_id
left join public.concert_program_candidates candidate on candidate.analysis_id = analysis.id
group by analysis.id, concert.kopis_id
order by concert.kopis_id, analysis.created_at;

select id, kopis_id, track_id, relation, outcome, review_status, effective_status,
  stale_reason, is_effectively_confirmed, source_url, evidence
from public.concert_program_candidate_status
where analysis_is_current
order by kopis_id, id;

-- A current application must ALSO filter the exact local matcher_version and catalog_hash.
-- This stage does not expose an application/browser query endpoint.
select * from public.concert_program_reviews order by reviewed_at desc;

select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in (
  'concert_program_catalogs', 'concert_program_analyses', 'concert_program_candidates', 'concert_program_reviews'
);
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in (
  'concert_program_catalogs', 'concert_program_analyses', 'concert_program_candidates', 'concert_program_reviews'
);
