-- QA 2026-11-03: "Not for us" gets its own activity event. Added alone, because a new enum value
-- can't be used in the transaction that adds it.
alter type public.activity_event_type add value if not exists 'item_passed';
