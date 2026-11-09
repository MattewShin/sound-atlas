-- Run after migration 202610160001. READ ONLY; never invokes the delete RPC.
begin read only;
select public.plan_expired_concert_cleanup(100);
select operation_id, run_id, concert_id, kopis_id, deleted_at, cutoff_date, counts
from public.concert_cleanup_events order by deleted_at desc limit 20;
-- Actual FK actions, including NO ACTION cross references intentionally retained.
select c.conrelid::regclass as child, c.confrelid::regclass as parent,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.contype='f' and c.confrelid = any(array[
  'public.concerts'::regclass,'public.concert_program_images'::regclass,
  'public.concert_image_ocr_results'::regclass,'public.concert_image_ocr_attempts'::regclass,
  'public.concert_program_analyses'::regclass,'public.concert_program_candidates'::regclass])
order by c.conrelid::regclass::text, c.confrelid::regclass::text;
commit;
