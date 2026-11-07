-- Deployed in the Memory Card production Supabase project on 2026-11-07
-- Migration version 20261107173126.
-- Current public tables received overly broad default Postgres privileges.
-- TRUNCATE and REFERENCES are not governed by row-level-security policies.
-- This preserves all existing SELECT/INSERT/UPDATE/DELETE grants intentionally:
-- the legacy-game-write phase-B lockdown is an independent, gated change.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;
