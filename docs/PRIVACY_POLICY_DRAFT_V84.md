# Memory Card privacy policy — preparation draft (NOT PUBLICATION READY)

The following sections are grounded in current Memory Card repository behavior. A finalized policy still needs the developer's verified contact email/business identity, operational retention windows, processor agreements and any additional actual services. Do not publish this as a final compliance statement.

## Overview

Memory Card is a game library/log and optional social-profile service. Users may record game titles, platforms, completion states, ratings, notes, collections and display names. Supabase Auth/Postgres handles account registration, login and cloud library sync. A browser's IndexedDB stores account-local game data and snapshots for offline use.

## Categories of data

- Account authentication: email and authentication metadata processed by Supabase Auth.
- Account profile: display name and Memory Card ID.
- User-generated game data: titles, platforms, statuses, scores, dates, notes and collections.
- Social data: friendship requests and accepted friendship relationships; approved friends may view selected library information.
- Device-local data: offline game library, sync baselines, conflict archives, backup snapshots and locally selected appearance settings.
- Game cover images and title suggestions fetched from external catalog/artwork hosts. Review individual hosts, request patterns, licenses and provider privacy documents before finalizing.
- Cloudflare Turnstile is loaded on the sign-in/registration path as a bot-prevention provider.
- No analytics/tracking SDK is intentionally listed in the current primary HTML bundle, but the final audit must search every reachable network request and third-party script.

## Sharing and safeguards

User profiles are not advertised as publicly searchable. Friend access depends on mutual acceptance, while notes and backlog are intended to remain private. Verify deployed RPC authorization policies before making definitive disclosure claims.

## Deletion

An authenticated user may create a deletion request in the application or through the standalone account deletion webpage. This request currently queues a manual operation and **does not immediately remove the account**. Completion is subject to the human/secure-server processing workflow. Auth-user deletion cascades to linked game, profile, settings, friendship and collection tables after verification. Browser-stored copies on other devices must be cleared separately by the user.

## Still required before publication

- Real developer/legal entity and support contact (must not invent).
- Supabase/Cloudflare/cover providers' roles and data-sharing terms.
- Real operational deletion processing schedule and retention/backups policy.
- Cross-border hosting/transfers, applicable jurisdiction and minor-users/age policy.
- Final Data Safety answers using observed real app network behavior.
