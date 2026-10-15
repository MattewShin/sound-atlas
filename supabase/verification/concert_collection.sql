-- Read-only. Run in Supabase SQL Editor after each real collection.
select id, kopis_id, title, venue, region, start_date, end_date,
       performance_status, poster_url, kopis_updated_at, synced_at, created_at, updated_at
from public.concerts
order by synced_at desc, kopis_id;

select c.kopis_id, i.id, i.source_url, i.image_type, i.sort_order,
       i.is_active, i.created_at, i.updated_at
from public.concert_program_images i
join public.concerts c on c.id = i.concert_id
order by c.kopis_id, i.image_type, i.sort_order, i.source_url;

-- Both queries should return zero rows (also enforced by UNIQUE constraints).
select kopis_id, count(*) from public.concerts
group by kopis_id having count(*) > 1;
select concert_id, source_url, count(*) from public.concert_program_images
group by concert_id, source_url having count(*) > 1;

select (select count(*) from public.concerts) as concerts,
       (select count(*) from public.concert_program_images) as all_images,
       (select count(*) from public.concert_program_images where is_active) as active_images;

select relname, relrowsecurity from pg_class
where oid in ('public.concerts'::regclass, 'public.concert_program_images'::regclass);
select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' and tablename in ('concerts', 'concert_program_images');
