# Memory Card v88 — confidential report queue operating procedure

**Status: preparation only. The moderation queue exists, but no human has been assigned to monitor it. Do not advertise guaranteed review times or a staffed moderation service.**

## Where reports go

Authenticated users can send reports by exact Memory Card ID. The server resolves the reporter from `auth.uid()`; the client cannot choose a reporter UID. Reasons: `spam`, `harassment`, `privacy`, `inappropriate`, `other`. Optional descriptions are limited to 1000 characters.

The server limits new complaints to three per account over a rolling 24 hours, serializing concurrent submissions. A repeat complaint against the same target with the same reason within 24 hours returns the original report ID without generating another row.

The table `mc_private.user_reports` is outside the exposed `public` schema, has RLS enabled and has no direct privileges for `anon` or `authenticated`. This table holds reporter and target account IDs, reason, free-text detail, timestamp and status (`open`, `reviewing`, `closed`). Rows refer to both Auth identities through `ON DELETE CASCADE`; deletion of either linked account removes the row. **All free-text details must be handled as private, potentially sensitive submissions.**

## Steps for an appointed operator

1. Assign a responsible human, a private support address, expected response cadence, urgent safety escalations and an appeal process. This has not yet been done.
2. Review reports in the authorized Supabase dashboard. Use an authorized database role, not a client API or a public web page. Start with counts without personal information:

```sql
select status, count(*) as reports
from mc_private.user_reports
group by status
order by status;
```

3. For actual review, inspect only the required minimum information. Do not copy raw descriptions or account IDs into GitHub issues, logs, public dashboards or automated reports:

```sql
select id, created_at, reason, reporter_id, target_id, details
from mc_private.user_reports
where status = 'open'
order by created_at
limit 50;
```

4. Verify evidence and context before taking any action. False or retaliatory reports are possible. Blocking, suspension and account deletion must remain separate decisions; reporting itself has **no** sanction effects.
5. Mark the selected item under the operator role after review and record an appropriate private case note through an approved system (not yet implemented). Avoid putting staff notes in the user's game library. Do not invent an automated decision process.
6. For urgent credible threats, use a documented emergency escalation path once the operating team establishes one.

## Release tests still missing

- Two throwaway Supabase Auth accounts, with no real user's data: valid complaint, idempotent repeat, invalid reason, self-report, unknown ID, fourth new complaint in 24h, and simultaneous submissions.
- Prove client roles cannot select, insert or update the table; verify complaints never leak through `social_state` or `get_friend_profile`.
- Confirm account deletion cascades to reports while leaving unrelated users' reports intact.
- Exercise the report form on Android Chrome, iOS Safari and the installed PWA.
- Verify operators can actually access the queue and a real contact/support process is established before public registration.

**There is currently no recurring queue monitor, no staffed inbox, no automated notification and no guaranteed response SLA.**
