-- Read-only; raw OCR is not a confirmed program/work match.
select c.kopis_id, c.title, i.source_url, i.is_active, r.id, r.pipeline_version,
       r.content_sha256, r.engine_version, r.torch_version, r.mean_confidence,
       r.width, r.height, length(r.raw_text) as characters,
       jsonb_array_length(r.detections) as detections, r.processed_at, r.raw_text
from public.concert_image_ocr_results r
join public.concert_program_images i on i.id = r.image_id
join public.concerts c on c.id = i.concert_id
order by r.processed_at desc;

select a.id, c.kopis_id, a.image_id, a.status, a.error_code, a.result_id,
       a.duration_ms, a.started_at, a.finished_at
from public.concert_image_ocr_attempts a
join public.concert_program_images i on i.id = a.image_id
join public.concerts c on c.id = i.concert_id
order by a.finished_at desc;

-- Should return zero rows (also enforced by UNIQUE).
select image_id, content_sha256, pipeline_version, count(*)
from public.concert_image_ocr_results
group by image_id, content_sha256, pipeline_version having count(*) > 1;
