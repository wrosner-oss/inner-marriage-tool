/**
 * Creates Gmail *drafts* in Amelia's account (drafts, not auto-send — the
 * confirmed decision). Workspace path: a service account with domain-wide
 * delegation impersonates GMAIL_SENDER, so there's no per-user consent and no
 * refresh token to expire.
 *
 * Scope is gmail.compose only — this can create drafts but CANNOT read her inbox.
 *
 * Config (all optional; when absent the draft endpoint reports "not configured"):
 *   GMAIL_SENDER                 e.g. amelia@ameliaperkins.com  (the mailbox to impersonate)
 *   GOOGLE_SERVICE_ACCOUNT_KEY   the service-account JSON — raw JSON, base64 of it, or a file path
 *   GMAIL_SUBJECT                optional subject override
 */
import { readFileSync } from 'node:fs';
import { google } from 'googleapis';

const SENDER = process.env.GMAIL_SENDER?.trim() ?? '';
const KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim() ?? '';
const SCOPES = ['https://www.googleapis.com/auth/gmail.compose'];

export function gmailConfigured(): boolean {
  return Boolean(SENDER && KEY_RAW);
}

export const DEFAULT_SUBJECT =
  process.env.GMAIL_SUBJECT?.trim() || 'Your Inner Marriage according to Shamanic Astrology';

function loadServiceAccount(): { client_email: string; private_key: string } {
  let raw = KEY_RAW;
  // Accept raw JSON, base64-encoded JSON, or a path to a JSON file.
  if (!raw.startsWith('{')) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.trim().startsWith('{')) raw = decoded;
    } catch {
      /* not base64 */
    }
  }
  if (!raw.startsWith('{')) raw = readFileSync(raw, 'utf8');
  const json = JSON.parse(raw);
  if (!json.client_email || !json.private_key) throw new Error('Service account JSON missing client_email/private_key.');
  return { client_email: json.client_email, private_key: json.private_key };
}

async function gmailClient() {
  const sa = loadServiceAccount();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SCOPES,
    subject: SENDER, // impersonate Amelia's mailbox
  });
  await auth.authorize();
  return google.gmail({ version: 'v1', auth });
}

function buildMime(opts: { to: string; from: string; subject: string; html: string }): string {
  // RFC 2822 message; encode the subject for any non-ASCII characters.
  const subject = `=?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ].join('\r\n');
  return Buffer.from(`${headers}\r\n\r\n${opts.html}`).toString('base64url');
}

export interface DraftResult {
  draftId: string;
  url: string;
}

export async function createGmailDraft(opts: { to: string; subject: string; html: string }): Promise<DraftResult> {
  if (!gmailConfigured()) throw new Error('Gmail is not configured.');
  const gmail = await gmailClient();
  const raw = buildMime({ to: opts.to, from: SENDER, subject: opts.subject, html: opts.html });
  const res = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
  const draftId = res.data.id ?? '';
  // Gmail has no stable per-draft deep link; open her Drafts folder.
  return { draftId, url: 'https://mail.google.com/mail/u/0/#drafts' };
}
