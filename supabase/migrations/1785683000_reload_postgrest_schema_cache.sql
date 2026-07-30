-- The 'notes' column on customers already exists (added by
-- customers_notes_column.sql) but PostgREST kept returning "Could not find
-- the 'notes' column ... in the schema cache" — a stale PostgREST schema
-- cache, not a real missing column. Supabase is supposed to auto-notify
-- PostgREST after DDL changes, but that notification isn't always firing
-- reliably for every migration path. Force a reload directly.
NOTIFY pgrst, 'reload schema';
