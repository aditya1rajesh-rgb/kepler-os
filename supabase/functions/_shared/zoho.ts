// Shared Zoho CRM helpers (Self Client OAuth) — used by connector-proxy
// (connect/test/push/fetch), send-scheduler (send_mail), and inbox-monitor
// (contact email threads).
//
// NOTE ("the browser never sends email", ROADMAP-HANDOFF §9): sendMail is
// deliberately NOT exposed as a connector-proxy action. Only the scheduled
// send-scheduler function may call it, after enforcing the §9.5 invariants.
//
// Required Self Client scopes (connect help text in src/lib/connectors.js):
//   ZohoCRM.modules.contacts.ALL, ZohoCRM.modules.leads.ALL,
//   ZohoCRM.modules.deals.READ, ZohoCRM.modules.tasks.ALL,
//   ZohoCRM.modules.emails.READ, ZohoCRM.send_mail.all.CREATE, ZohoCRM.users.READ
//   (leads.ALL: Leads are pushed/read for attribution; deals.READ: won-deal revenue)

export type Creds = Record<string, string>;

// Zoho is regional: the accounts (token) host and API host differ per data center.
export const ZOHO_DC: Record<string, { accounts: string; api: string }> = {
  us: { accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com" },
  eu: { accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu" },
  in: { accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in" },
  au: { accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au" },
  jp: { accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp" },
  ca: { accounts: "https://accounts.zohocloud.ca", api: "https://www.zohoapis.ca" },
};

// Token endpoint requires params in the QUERY STRING (not a JSON/body object).
export const zohoToken = async (accounts: string, params: Record<string, string>) => {
  const res = await fetch(`${accounts}/oauth/v2/token?${new URLSearchParams(params).toString()}`, { method: "POST" });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  return { res, data: data as Record<string, unknown> };
};

export interface ZohoSession { token: string; api: string; }

// Mint a fresh access token from the stored refresh token. Prefers the api_domain
// Zoho returns (authoritative per account) over the DC default.
export const zohoAccessToken = async (
  creds: Creds,
): Promise<{ ok: boolean; token?: string; api?: string; error?: string }> => {
  const dc = String(creds?.dc ?? "us").toLowerCase();
  const conf = ZOHO_DC[dc] ?? ZOHO_DC.us;
  const { res, data } = await zohoToken(conf.accounts, {
    grant_type: "refresh_token",
    client_id: String(creds?.clientId ?? ""),
    client_secret: String(creds?.clientSecret ?? ""),
    refresh_token: String(creds?.refreshToken ?? ""),
  });
  const token = data?.access_token as string | undefined;
  if (!res.ok || !token) return { ok: false, error: `Zoho token refresh failed${data?.error ? ` (${data.error})` : ""}.` };
  return { ok: true, token, api: (data?.api_domain as string) || conf.api };
};

const authHeaders = (s: ZohoSession) => ({
  Authorization: `Zoho-oauthtoken ${s.token}`,
  "Content-Type": "application/json",
});

// The connected Zoho user — the "from" identity for CRM-native sends (E1.1:
// warm messages go from the operator's system of record, as the operator).
export const zohoCurrentUser = async (
  s: ZohoSession,
): Promise<{ ok: boolean; user?: { id: string; email: string; fullName: string }; error?: string }> => {
  const res = await fetch(`${s.api}/crm/v7/users?type=CurrentUser`, { headers: authHeaders(s) });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const u = ((data as { users?: Array<Record<string, unknown>> })?.users ?? [])[0];
  if (!res.ok || !u?.email) {
    return {
      ok: false,
      error: `Could not read the Zoho user (${res.status}). Reconnect Zoho with the ZohoCRM.users.READ scope.`,
    };
  }
  return {
    ok: true,
    user: { id: String(u.id ?? ""), email: String(u.email), fullName: String(u.full_name ?? "") },
  };
};

// Upsert a Contact by email (idempotent — duplicate_check_fields) and return its id.
export const zohoUpsertContact = async (
  s: ZohoSession,
  contact: { firstName?: string; lastName?: string; email: string; description?: string },
): Promise<{ ok: boolean; contactId?: string; error?: string }> => {
  const email = String(contact.email ?? "").trim();
  const lastName = String(contact.lastName ?? "").trim()
    || String(contact.firstName ?? "").trim()
    || (email ? email.split("@")[0] : "");
  if (!email || !lastName) return { ok: false, error: "A recipient email is required." };
  const record: Record<string, unknown> = { Last_Name: lastName, Email: email };
  if (contact.firstName) record.First_Name = String(contact.firstName).trim();
  if (contact.description) record.Description = String(contact.description).slice(0, 200);
  const res = await fetch(`${s.api}/crm/v7/Contacts/upsert`, {
    method: "POST",
    headers: authHeaders(s),
    body: JSON.stringify({ data: [record], duplicate_check_fields: ["Email"] }),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const rec = (data?.data as Array<Record<string, unknown>> | undefined)?.[0];
  const contactId = (rec?.details as Record<string, unknown> | undefined)?.id as string | undefined;
  if (!res.ok || rec?.status !== "success" || !contactId) {
    return { ok: false, error: `Zoho contact upsert failed${rec?.message ? `: ${rec.message}` : ` (${res.status})`}.` };
  }
  return { ok: true, contactId };
};

// Send an email from the connected Zoho user to a Contact, logged by Zoho
// against that contact record. Scope: ZohoCRM.send_mail.all.CREATE.
export const zohoSendMail = async (
  s: ZohoSession,
  args: {
    contactId: string;
    from: { email: string; name?: string };
    to: { email: string; name?: string };
    subject: string;
    content: string;
  },
): Promise<{ ok: boolean; providerMessageId?: string; error?: string; authError?: boolean }> => {
  const body = {
    data: [{
      from: { user_name: args.from.name || args.from.email, email: args.from.email },
      to: [{ user_name: args.to.name || args.to.email, email: args.to.email }],
      subject: args.subject,
      content: args.content,
      mail_format: "html",
    }],
  };
  const res = await fetch(`${s.api}/crm/v7/Contacts/${args.contactId}/actions/send_mail`, {
    method: "POST",
    headers: authHeaders(s),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      authError: true,
      error: "Zoho rejected the send (auth/scope). Reconnect Zoho with the ZohoCRM.send_mail.all.CREATE scope.",
    };
  }
  const rec = (data?.data as Array<Record<string, unknown>> | undefined)?.[0];
  if (!res.ok || (rec?.status && rec.status !== "success")) {
    const msg = (rec?.message as string) || (data?.message as string) || `HTTP ${res.status}`;
    return { ok: false, error: `Zoho send failed: ${msg}` };
  }
  const details = rec?.details as Record<string, unknown> | undefined;
  return { ok: true, providerMessageId: String(details?.message_id ?? "") };
};

export interface ZohoEmailEntry {
  providerEmailId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  time: string; // ISO-ish timestamp from Zoho
}

// Email thread of a Contact (Emails related list). Includes mails sent from the
// CRM and — when the user's mailbox is linked in Zoho — inbound replies.
// Scope: ZohoCRM.modules.emails.READ.
export const zohoContactEmails = async (
  s: ZohoSession,
  contactId: string,
): Promise<{ ok: boolean; emails?: ZohoEmailEntry[]; error?: string }> => {
  const res = await fetch(`${s.api}/crm/v7/Contacts/${contactId}/Emails`, { headers: authHeaders(s) });
  if (res.status === 204) return { ok: true, emails: [] };
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    return { ok: false, error: `Zoho email list failed (${res.status}). The connection may be missing ZohoCRM.modules.emails.READ.` };
  }
  const rows = ((data as { Emails?: Array<Record<string, unknown>> })?.Emails ?? []);
  const emails = rows.map((e) => {
    const from = (e.from ?? {}) as Record<string, unknown>;
    const toArr = (Array.isArray(e.to) ? e.to : []) as Array<Record<string, unknown>>;
    return {
      providerEmailId: String(e.message_id ?? e.id ?? ""),
      fromEmail: String(from.email ?? "").toLowerCase(),
      toEmail: String(toArr[0]?.email ?? "").toLowerCase(),
      subject: String(e.subject ?? ""),
      time: String(e.time ?? e.sent_time ?? ""),
    };
  }).filter((e) => e.providerEmailId);
  return { ok: true, emails };
};
