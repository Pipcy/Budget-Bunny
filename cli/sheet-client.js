require('dotenv').config();

const SHEET_URL = process.env.APPS_SCRIPT_URL;
const SHEET_TOKEN = process.env.APPS_SCRIPT_TOKEN;

async function callSheet(action, data) {
  if (!SHEET_URL || !SHEET_TOKEN) {
    throw new Error(
      'Missing APPS_SCRIPT_URL or APPS_SCRIPT_TOKEN in .env — see .env.example'
    );
  }

  const body = { token: SHEET_TOKEN, action };
  if (data !== undefined) body.data = data;

  const res = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    if (res.status === 401 || text.includes('<!DOCTYPE html')) {
      throw new Error(
        'Sheet API returned a Google sign-in page (not JSON). ' +
          'Redeploy the web app: Execute as Me, Who has access: Anyone. ' +
          'See sheets/README.md → Deploy web app.'
      );
    }
    throw new Error(`Sheet API returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (json.error) throw new Error(json.error);
  return json;
}

async function healthCheck() {
  if (!SHEET_URL) return null;
  const res = await fetch(SHEET_URL, { redirect: 'follow' });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.includes('<!DOCTYPE html') || res.url.includes('accounts.google.com')) {
      throw new Error(
        'Web app requires Google sign-in — set deployment access to Anyone (not Only myself)'
      );
    }
    throw new Error(`Health check failed (${res.status})`);
  }
}

module.exports = { callSheet, healthCheck };
