-- A flagged version renders with the repository's diagram settings as they
-- were when it was flagged, on the public share page too — which has no
-- GitHub access to read the live file.
alter table public.versions add column if not exists settings_json jsonb;
