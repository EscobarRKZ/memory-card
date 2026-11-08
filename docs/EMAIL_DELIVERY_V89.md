# Memory Card v89 — production email sender setup

**Status:** templates prepared in repository, **NOT** installed or enabled in hosted Supabase. Never store SMTP passwords or API keys in GitHub or the PWA. Memory Card project ref is `nzcbapjgwqqafmacizqe`.

## Why this is a launch blocker

Supabase Free's built-in email provider is for testing; it sends to pre-authorized organization team addresses only, with a limit of 2 messages/hour per project. Memory Card is a hosted Free project created in September 2026. New Free projects created after June 3, 2026 cannot customize email templates while using Supabase's default email service; custom SMTP restores customization. Official documentation:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
- https://supabase.com/docs/guides/auth/auth-email-templates

## Setup checklist

1. Choose a domain you own and control. Example placeholders below are **not real Memory Card contacts**. Use a dedicated sender such as `no-reply@<owned-domain>` and create a valid private support mailbox before public launch.
2. Select an SMTP provider (for example, Resend, Amazon SES, Postmark or Brevo). Obtain its SMTP host, port, username and password privately. For Resend see https://resend.com/pricing — verify the plan at time of setup.
3. Verify the sending domain at that provider using its specific SPF, DKIM and DMARC DNS records. Avoid enabling email link tracking: it can break Supabase authentication links.
4. In https://supabase.com/dashboard/project/nzcbapjgwqqafmacizqe/auth/settings go to SMTP settings, enable **Custom SMTP** and enter sender display name **Memory Card**, your owned sender address, host, port and credentials. Do not put secrets in `backend-config.js` or any web script. Ensure "Confirm email" stays enabled for public registration.
5. In Supabase Authentication > Email Templates, paste the body of these versioned files after checking official template settings:
   - `emails/confirm-signup.html` — Confirmation
   - `emails/reset-password.html` — Reset Password
   - `emails/magic-link.html` — Magic Link
   - `emails/email-change.html` — Change Email Address
   Each uses the supported Go-template variable `{{ .ConfirmationURL }}` and has no remote images/tracking scripts. Select matching Russian subjects in the dashboard.
6. Check the Authentication **Site URL** and redirect allowlist so the actual hosted PWA origin and account-deletion page are accepted. The expected repository Pages path is `https://escobarrkz.github.io/memory-card/`; **real host accessibility must be independently checked**. Do not authorize wildcard domains beyond what the deployment needs.
7. Immediately after enabling custom SMTP, Supabase can enforce a low initial cap (documented 30 emails/hour); tune Authentication > Rate Limits to the verified provider quota and the project's expected onboarding volume. Provider limits still apply.
8. Test signup confirmation, password recovery, address change and mail headers with **disposable external accounts** (not organization team addresses), including Gmail/Outlook and phone browsers. Verify SPF/DKIM/DMARC alignment and that links return to the correct environment. Keep password-recovery and email-change protections enabled.

## Observability and failure cases

- Expected messages: address not authorized (default SMTP), rate limit exceeded, email unconfirmed, wrong credentials, CAPTCHA failure, network failure. v89 maps these to readable messages without logging user email/password.
- On a sudden viral traffic spike, require an email service that can scale; do not disable email confirmation to work around limits. Consider waitlisting and rate limiting.
- Never forward authentication/verification links through URL tracking services. Do not attach marketing consent to essential authentication messages.
- **An HTML template in this repository does not change hosted Supabase.** Activation requires provider credentials and dashboard verification.

## Safety verification

No SMTP configuration was changed during v89. No production email was sent, no existing Auth user was changed or deleted. Source templates are safe to inspect but are **not evidence of real deliverability**.
