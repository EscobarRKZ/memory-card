# Memory Card — future monetization roadmap (v89 proposal)

**No payments, subscriptions, advertisements or paid feature flags are active. This is an unapproved product/business hypothesis, not a commitment or a release feature.**

## Product positioning

Memory Card is a local-first gaming journal: personal game library, current games, backlog, notes, ratings, covers, collections, custom themes and consensual friend profiles. Keep data portability and privacy as permanent trust promises.

## Proposed tiers (USD, test willingness-to-pay later)

| Plan | Suggested price | Audience | Added value |
|---|---:|---|---|
| Free | $0 | Everyone | Unlimited core logging, ratings, notes, basic stats, local export/import, basic cloud synchronization |
| Plus | $2.99/month or $24.99/year | Enthusiasts | Rich analytics, yearly wrap-up, collection workflows, more themes/profile appearance, history views |
| Duo | $4.99/month or $39.99/year for two | Households/couples | Two accounts, co-op backlog and planning, shared recommendations, aggregate stats, plus features |

Duo features are **not currently built**; never advertise them as available. Avoid permanent unlimited-cloud lifetime licenses before calculating long-term hosting costs.

## Potential secondary revenue

- Optional supporter tier without pay-to-win/status pressure.
- Affiliate links to *legitimate* video game retailers only with disclosure and store-policy review; users control whether links appear.
- Nonintrusive cosmetic packs or annual recap exports.
- Avoid intrusive full-screen ads in library pages, selling personal gaming data, or holding user backups and account deletion behind a paywall.

## Staged plan

1. Launch a reliable Free PWA and Android app with tested account safety, real SMTP and incident response.
2. Instrument privacy-conscious **aggregate** activation/retention and weekly engagement; avoid exporting individual titles, private notes, emails or identifiers into analytics tools. Secure consent where required.
3. Conduct qualitative interviews and A/B pricing interest tests without charging users.
4. Only after observing retention and willingness to pay, implement server-verified entitlements, fraud resistance, refund/expiry handling and a source of truth. The local IndexedDB must never be the sole authority for paid access.
5. For Google Play-distributed digital features, follow current Google Play Billing/payment rules; subscriptions, external payments and commissions vary by region and distribution policy. A web checkout must be designed separately and cannot be used to evade store rules.

References:
- https://support.google.com/googleplay/android-developer/answer/9858738
- https://support.google.com/googleplay/android-developer/answer/112622
- https://supabase.com/pricing

## Hypothetical revenue illustration

10,000 monthly active users × 2% subscribers = 200 paying users. If all choose $24.99/year, annual *gross* revenue is $4,998 before refunds, platform/payment fees, VAT/taxes, infrastructure, support and churn. This is **not a projection**. Actual payment conversion is unmeasured.

## Paid release gate

Do not start charging before: clear terms/privacy & refund process, purchased entitlements that restore across devices, a tested cancellation path, compliance with store billing, sustainable data storage and account deletion, and a support address.
