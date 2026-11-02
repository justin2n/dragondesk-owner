import crypto from 'crypto';

// Read-only Google Drive access as a service account. Clients share a folder
// with the service account's email, like sharing with a coworker; no Google
// sign-in or app review is involved. Configured with GOOGLE_SERVICE_ACCOUNT_JSON
// (the downloaded JSON key, as-is or base64-encoded).

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';

interface ServiceAccount { client_email: string; private_key: string }

export function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  for (const text of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
    try {
      const j = JSON.parse(text);
      if (j.client_email && j.private_key) return { client_email: j.client_email, private_key: j.private_key };
    } catch { /* try the next form */ }
  }
  return null;
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new DriveError('Google Drive is not set up on this server (GOOGLE_SERVICE_ACCOUNT_JSON).');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new DriveError(`Google sign-in failed: ${data.error_description || data.error || res.status}`);
  cached = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000 };
  return cached.token;
}

export class DriveError extends Error {}

async function drive(path: string, params: Record<string, string> = {}): Promise<Response> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries({ supportsAllDrives: 'true', ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (res.status === 404) {
    throw new DriveError(`Google Drive says it can't find that. Share the folder with ${serviceAccount()?.client_email} (Viewer is enough) and check the link.`);
  }
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    throw new DriveError(`Google Drive error: ${body?.error?.message || res.status}`);
  }
  return res;
}

// The folder id from a share link ("/folders/<id>", "?id=<id>") or a bare id.
export function parseFolderId(input: string): string | null {
  const s = String(input || '').trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{20,})$/);
  return m ? m[1] : null;
}

export interface DriveFile { id: string; name: string; mimeType: string; modifiedTime: string; size?: string; path: string }

export const FOLDER = 'application/vnd.google-apps.folder';

export async function folderName(folderId: string): Promise<string> {
  const res = await drive(`/files/${folderId}`, { fields: 'id,name,mimeType' });
  const f: any = await res.json();
  if (f.mimeType !== FOLDER) throw new DriveError('That link is a file, not a folder. Share and paste the folder that holds your documents.');
  return f.name;
}

// Every file under the folder, including subfolders (4 levels, 300 files).
export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  const queue: { id: string; path: string; depth: number }[] = [{ id: folderId, path: '', depth: 0 }];
  while (queue.length && out.length < 300) {
    const { id, path, depth } = queue.shift()!;
    let pageToken = '';
    do {
      const res = await drive('/files', {
        q: `'${id}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
        pageSize: '200',
        includeItemsFromAllDrives: 'true',
        ...(pageToken ? { pageToken } : {}),
      });
      const data: any = await res.json();
      for (const f of data.files || []) {
        if (f.mimeType === FOLDER) {
          if (depth < 4) queue.push({ id: f.id, path: path + f.name + '/', depth: depth + 1 });
        } else if (out.length < 300) {
          out.push({ ...f, path });
        }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken && out.length < 300);
  }
  return out;
}

// Google Docs/Slides as text, Sheets as CSV (first sheet), anything else raw.
export async function exportText(file: DriveFile): Promise<string> {
  const as = file.mimeType === 'application/vnd.google-apps.spreadsheet' ? 'text/csv' : 'text/plain';
  const res = await drive(`/files/${file.id}/export`, { mimeType: as });
  return res.text();
}

export async function download(file: DriveFile, maxBytes: number): Promise<Buffer> {
  if (file.size && Number(file.size) > maxBytes) throw new DriveError(`Too large (${Math.round(Number(file.size) / 1e6)} MB).`);
  const res = await drive(`/files/${file.id}`, { alt: 'media' });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new DriveError(`Too large (${Math.round(buf.length / 1e6)} MB).`);
  return buf;
}
