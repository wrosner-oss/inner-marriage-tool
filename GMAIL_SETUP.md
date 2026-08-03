# Gmail draft setup (Google Workspace)

The app creates **drafts** in Amelia's mailbox (it never sends). Because
`ameliaperkins.com` is Google Workspace, the cleanest path is a **service
account with domain-wide delegation** — no per-user consent screen, and no
refresh token that can expire. Scope is `gmail.compose` only, so the app can
create drafts but **cannot read her inbox**.

## One-time setup

1. **Google Cloud project → service account**
   - Google Cloud Console → create (or pick) a project.
   - APIs & Services → Library → enable **Gmail API**.
   - APIs & Services → Credentials → Create credentials → **Service account**.
   - Open the service account → **Keys** → Add key → **JSON**. Download it.
   - On the service account details, note its **Unique ID (Client ID)** — a long number.

2. **Authorize it in Workspace (domain-wide delegation)**
   - Google **Admin console** (admin.google.com) → Security → Access and data
     control → **API controls** → **Domain-wide delegation** → **Add new**.
   - Client ID: the service account's Unique ID from step 1.
   - OAuth scopes: `https://www.googleapis.com/auth/gmail.compose`
   - Authorize.

3. **Configure the app** (env vars — compose file or `.env`):
   ```
   GMAIL_SENDER=amelia@ameliaperkins.com
   GOOGLE_SERVICE_ACCOUNT_KEY=<the JSON key>
   # GMAIL_SUBJECT=Your Inner Marriage according to Shamanic Astrology   # optional
   ```
   `GOOGLE_SERVICE_ACCOUNT_KEY` accepts the **raw JSON**, a **base64** of it, or a
   **file path** to the JSON. For Docker/compose, base64 on one line is easiest:
   ```
   GOOGLE_SERVICE_ACCOUNT_KEY=$(base64 -w0 service-account.json)
   ```

That's it — restart the app and the "Create Gmail draft" button on the Review
screen will place a ready-to-send draft in Amelia's Drafts. Until these are set,
the button returns a friendly "not configured yet."

## Notes

- **Signature/links:** API drafts don't pull Amelia's Gmail signature, so her
  signature + links are part of the generated email instead (edit under
  Content → Structural → `signature`).
- If a draft fails, the app shows the Google error message. Most first-time
  failures are the delegation scope not matching exactly, or the Gmail API not
  being enabled on the project.
- Switching to real send later (if ever) is the same scope — but that reopens the
  auto-send decision, so leave it as drafts unless we revisit it together.
