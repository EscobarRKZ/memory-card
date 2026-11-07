# Memory Card — account deletion operations (v84)

**Status (v85): request intake is implemented; an authenticated password-verified self-service hard-delete endpoint is deployed. Manual queue processing is still required for pending requests not completed by the user.** This document is a runbook for the operator, not a claim that deletion has been completed.

## What is live

- Database migration version **20261107131531** installed table public.account_deletion_requests with a unique user_id.
- RLS permits authenticated users to create **only their own** pending request and read only their own request. They cannot edit, cancel, or delete requests.
- New v84 UI exposes "Настройки → Аккаунт → Удаление аккаунта" and a standalone public webpage at `/memory-card/delete-account.html`.
- A request **does not delete accounts or data**. The application says so plainly and prevents duplicate submissions.
- The public webpage requires Supabase Auth sign-in and the configured Cloudflare Turnstile challenge when signing in. Users who uninstalled the PWA can still use that webpage.

The user-facing permanent deletion flow is documented in [ACCOUNT_SELF_DELETION_V85.md](ACCOUNT_SELF_DELETION_V85.md). It performs irreversible deletion only after the user submits a pending request and explicitly confirms with their password. Do not describe an unprocessed pending request as deleted.

## Manual handling (must be staffed before public release)

1. Monitor `public.account_deletion_requests` for new rows with `status = 'pending'`. Do not publicize a processing SLA until an operator can meet it.
2. Use the authenticated request user_id, not a user-provided email, as the deletion target. If extra verification is necessary, do it without collecting unnecessary secrets.
3. Allow the user to export their library before deletion. Never email them their password, session tokens, Supabase keys, or private notes.
4. Check whether the account owns Supabase Storage objects; deleting the auth user may fail until owned objects are deleted. Check any future service tables and third-party processors.
5. Perform permanent deletion **only after reviewing the specific submitted request**, through Supabase Auth admin API (`auth.admin.deleteUser(user_id)`) or an equivalent privileged Auth management path. Keep the service-role key server-side only.
6. The project's foreign keys from profile, games, collections, settings and friendships to auth.users currently have ON DELETE CASCADE. Verify that each applicable row disappears when the Auth user is deleted, including requests.
7. An Auth user's already-issued JWT can remain valid until expiration; enforce appropriate session revocation / expiry for sensitive endpoints and confirm the old user cannot create a new session.
8. Audit the outcome without retaining unnecessary email addresses, notes or user identifiers in an unprotected log. If legal retention is required, document its purpose and duration in the privacy policy.
9. The browser's per-account IndexedDB data and offline snapshots on other devices cannot be remotely erased by this request. Provide clear user instructions for clearing app/browser storage.
10. Do not represent a pending request as successful deletion. The existing requested status should only be described as pending review/processing.

### Operational query (read-only)

```sql
select id, user_id, status, requested_at, reviewed_at
from public.account_deletion_requests
where status = 'pending'
order by requested_at asc;
```

Restricted to an operator with authorized database privileges. Do not copy this output into publicly shared channels.

## Remaining Google Play gate

- Publish an accurate privacy policy on a publicly accessible URL with a real developer contact, retention details and account deletion procedure.
- Put the verified reachable account-deletion webpage URL into the Google Play Console form. The Github Pages URL is configured in repository documentation but its deployment must be verified independently.
- The separate self-service hard-deletion function is deployed, but **manual queue monitoring is still needed** for users who submit requests without completing password reauthentication. A pending request without a reachable processing mechanism is not enough for public release.
- Test the request flow with disposable accounts and the actual hosted website. **Do not delete the sole real account as a test.**
