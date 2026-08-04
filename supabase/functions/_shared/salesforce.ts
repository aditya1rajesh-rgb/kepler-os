// Shared Salesforce helpers — used by the connector-proxy salesforce adapter
// (connect/test/push/fetch). Self-serve username-password OAuth flow (the
// pasteable one, matching the Zoho/HubSpot connector UX): the user makes a
// Connected App and pastes its Consumer Key/Secret + their login + security
// token. This flow returns NO refresh token, so we mint a fresh access token
// (+ instance_url) on every operation — same shape as zohoAccessToken.
//
// The org must enable "Allow OAuth Username-Password Flows" (Setup → OAuth and
// OpenID Connect Settings). If auth fails with that disabled, the error says so.

import type { Creds } from "./zoho.ts";

const API_VERSION = "v60.0";

// Login host: production, sandbox, or a My Domain URL. Blank → production.
const loginHost = (creds: Creds): string => {
  const raw = String(creds?.loginUrl ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "https://login.salesforce.com";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

export interface SfSession { token: string; instanceUrl: string; }

/**
 * Username-password OAuth grant → { token, instanceUrl }. Minted fresh each call
 * (no refresh token in this flow). Mirrors zohoAccessToken.
 */
export const salesforceAccessToken = async (
  creds: Creds,
): Promise<{ ok: boolean; token?: string; instanceUrl?: string; error?: string }> => {
  const clientId = String(creds?.clientId ?? "").trim();
  const clientSecret = String(creds?.clientSecret ?? "").trim();
  const username = String(creds?.username ?? "").trim();
  const password = String(creds?.password ?? "");
  const securityToken = String(creds?.securityToken ?? "");
  if (!clientId || !clientSecret || !username || !password) {
    return { ok: false, error: "Salesforce Consumer Key/Secret, username, and password are all required." };
  }
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: clientId,
    client_secret: clientSecret,
    username,
    password: `${password}${securityToken}`, // security token is appended to the password
  });
  const res = await fetch(`${loginHost(creds)}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const token = data?.access_token as string | undefined;
  const instanceUrl = data?.instance_url as string | undefined;
  if (!res.ok || !token || !instanceUrl) {
    const desc = (data?.error_description as string) || (data?.error as string) || `HTTP ${res.status}`;
    return {
      ok: false,
      error: `Salesforce auth failed: ${desc}. Check the credentials, and ensure the Connected App + org allow the username-password flow.`,
    };
  }
  return { ok: true, token, instanceUrl };
};

const authHeaders = (s: SfSession) => ({ Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" });

const errorOf = (data: unknown, status: number): string => {
  if (Array.isArray(data)) return String((data[0] as { message?: unknown })?.message ?? `HTTP ${status}`);
  return String((data as { message?: unknown })?.message ?? `HTTP ${status}`);
};

/** Run a SOQL query. */
export const sfQuery = async (
  s: SfSession,
  soql: string,
): Promise<{ ok: boolean; records?: Array<Record<string, unknown>>; error?: string }> => {
  const res = await fetch(`${s.instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`, {
    headers: authHeaders(s),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Salesforce query failed: ${errorOf(data, res.status)}` };
  return { ok: true, records: ((data as { records?: unknown[] })?.records ?? []) as Array<Record<string, unknown>> };
};

/** Create an sObject record; returns its id. */
export const sfCreate = async (
  s: SfSession,
  sobject: string,
  record: Record<string, unknown>,
): Promise<{ ok: boolean; id?: string; error?: string }> => {
  const res = await fetch(`${s.instanceUrl}/services/data/${API_VERSION}/sobjects/${sobject}`, {
    method: "POST",
    headers: authHeaders(s),
    body: JSON.stringify(record),
  });
  const data = await res.json().catch(() => ({}));
  const id = (data as { id?: string })?.id;
  if (!res.ok || !id) return { ok: false, error: `Salesforce ${sobject} create failed: ${errorOf(data, res.status)}` };
  return { ok: true, id };
};
