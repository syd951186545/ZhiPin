# Browser Guardrails Skill

## Goal
Stabilize long-lived browser automation in OpenClaw for recruiter account binding, verification, and logout workflows.

## Required operating rules
1. Use a single browser writer per account session key. If a lock already exists and is fresh, stop and report busy instead of interleaving actions.
2. Keep a single working tab. Close unrelated extra tabs before interacting with the page.
3. Before every critical click after a navigation or modal transition, refresh page understanding from the current DOM or screenshot context.
4. Retry selector drift or stale-page issues at most 3 times. After that, stop and report failure.
5. Do not brute-force login flows. If SMS, QR, slider, password-2FA, or explicit user action is required, stop in place and return the matching structured state.

## Structured login contract
For platform account tasks, always end with exactly one of:
- `[LOGIN_STATE:LOGGED_IN]`
- `[LOGIN_STATE:AWAIT_SMS]`
- `[LOGIN_STATE:AWAIT_QR]`
- `[LOGIN_STATE:AWAIT_PASSWORD_2FA]`
- `[LOGIN_STATE:FAILED]`

And also emit:
- `[LOGIN_STEP:STEP_KEY]`
- `[LOGIN_REASON:short reason]`
- `[LOGIN_IDENTIFIER:masked identifier]` when available

If a screenshot is available, capture the current page and output the full screenshot path.

## Binding-specific rules
1. Phone login is first choice when supported.
2. QR login is second choice and must stop with the freshest QR screenshot.
3. Password login is last choice; if it triggers 2FA, stop and wait.
4. Verification workflows must only check whether the existing persistent session is still logged in. They must not silently rebind the account.
5. Unbind workflows should log out when possible, then stop. If logout cannot be confirmed, report failure explicitly so the caller can rotate the session key.
