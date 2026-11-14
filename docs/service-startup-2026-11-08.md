# API availability incident — 2026-11-08

All times below use Asia/Saigon (UTC+7).

## Observations

- Around 12:44, the Firebase-hosted homepage returned HTTP 200 in about one second. The Render API completed its TLS connection but returned no HTTP response within 45 seconds.
- Render listed revision `7440e18666fa7f3281fdbebd5d6a86fd5a0efb24` as live. There were no new application logs. Restarting the service did not restore access.
- Redeploying the same revision restored the API at 12:50. Firestore restoration completed, health returned HTTP 200, and the authenticated Mailboxes page loaded messages.
- Application logs continued to report healthy requests until 13:13, approximately 15 minutes after the final client activity.
- Around 18:45, the API again returned no HTTP response. Requests to `/`, `/api/me`, and `/api/health` all timed out, including probes with 60-second deadlines. Both DNS-provided IPv4 addresses were checked. No current application logs appeared.
- Billing showed 3.43 of 750 free instance hours used, so the free-hours allowance was not exhausted. The Events view showed no new failed deployment.
- Redeploying the same revision restored access again at 18:48. Health returned HTTP 200 in approximately 0.52 seconds with persistent mailbox storage enabled.

The recurrence after inactivity is consistent with a Render Free spin-up or routing problem. It does not establish the precise internal Render failure. No Firestore restoration exception or application crash was observed during these outages. Redeployment is a temporary recovery procedure, not a permanent fix.

## Web changes deployed

- `/api/health` uses a public GET without waiting for Firebase or adding headers that require a CORS preflight.
- The signed-in workspace also sends this warm-up request; restored sessions can bypass the login page.
- Health, profile and account-list requests have a 60-second deadline covering authentication, fetch and response parsing. Timed-out fetches are aborted and late authentication cannot initiate a request.
- Profile and account-list queries do not silently repeat this minute-long wait through automatic retries. The existing retry button remains available.
- Long-running mailbox mutations retain their existing request behavior.

Validation: 56 web tests passed; TypeScript/Vite production build and `git diff --check` passed. Firebase Hosting deployment succeeded for project/site `ommimail`. The public domain served the new `index-B7C3Aa0-.js` entry asset.

## Remaining hosting decision

Render documents that Free web services sleep after 15 minutes of inactivity and normally take about a minute to start again: https://render.com/docs/free#spinning-down-on-idle

An always-on service removes that idle-sleep mechanism. The dashboard offered a $7/month, 0.5 CPU, 512 MB service compute option at inspection time. No paid plan was selected or purchased. Changing the workspace plan alone does not remove Free service limitations.

If retaining Free, allow for cold starts and possible recurrence. If the problem continues, provide Render support with the service ID `srv-d9qpe6dbedkc73fgtrsg`, the above timestamps and the successful same-revision redeploys. Never include mailbox credentials or secret environment values.
