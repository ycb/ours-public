-- QA 2026-11-03 (quick add): a title is enough. The description may be empty, on the idea and in
-- its revisions. Still never null and never untrimmed; the title stays required.
alter table public.items drop constraint items_description_check;
alter table public.items add constraint items_description_check check (
  description = btrim(description)
  and char_length(description) <= 4000
);

alter table public.item_revisions drop constraint item_revisions_description_check;
alter table public.item_revisions add constraint item_revisions_description_check check (
  description = btrim(description)
  and char_length(description) <= 4000
);
