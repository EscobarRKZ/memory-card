# Memory Card v98 — Nintendo Switch rotation placement

**Date:** 13 November 2026. **Scope:** a user preference and rotation UI, not a database migration.

## Usage

Open **Настройки → Ротация**. In **Nintendo Switch · тип устройства**, choose **Портативная** or **Домашняя**. The change applies immediately; it does not require manually editing games, moving existing saved games, or changing any console IDs.

The switch moves between the two rotation queues, the `Сейчас играю` groups, supported platform selectors and platform category labels. The order of other consoles is kept. If Switch was selected as the current console in its former group, that group's next available device is selected. The destination group's current selection is preserved if it remains valid.

The setting is **reversible**. All existing game IDs, play sessions, review notes, statuses, timestamps and ratings are untouched.

## Data / migration

`switchGroup` accepts only `'handheld'` or `'desktop'`, with `'desktop'` as the default for existing accounts and invalid values. Each user's settings migrate independently; no global mutation of the static `PLATFORMS` list is performed.

The setting is persisted locally in IndexedDB with other settings, and it is **included in the existing settings payload sent through Supabase**. No new table, grant, Auth change or SQL migration is needed. The older Sheets settings payload also includes the group. The receiving client migrates incoming settings using their own `switchGroup` value rather than a previous active user's state.

With first-run onboarding, owned-device and rotation filters use this same group. Unowned Switch devices do not suddenly become owned by choosing a rotation.

## Validation

`tests/test_switch_rotation_v98.cjs` evaluates the application's core settings/grouping functions plus profile-core and onboarding migration wrappers with a miniature game library. It checks the default desktop classification, handheld migration from an existing desktop rotation, moving back, no duplicate Switch in the queues, preservation of unrelated current consoles, a rejected local save, account-specific remote settings and PWA version wiring.

Real-phone user-journey and actual two-device cloud propagation have not been verified by these isolated tests.
