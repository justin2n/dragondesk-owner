import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../models/database';
import { DriveError, DriveFile, download, exportText, folderName, listFiles } from './googleDrive';

// Keeps each chat agent's knowledge in step with its Google Drive folder:
// reads new and changed documents, forgets removed ones. Runs on demand
// ("Sync now", or when the folder changes) and hourly in the background.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PER_FILE_CHARS = 200_000;
// Everything the agent reads goes into its instructions; this keeps that
// to roughly 150k tokens. Documents past it are listed as left out.
export const KNOWLEDGE_LIMIT_CHARS = 600_000;

const GOOGLE_TEXT = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
]);
const isPlainText = (m: string) => m.startsWith('text/') || m === 'application/json';

async function readFile(f: DriveFile): Promise<{ content: string } | { skip: string }> {
  if (GOOGLE_TEXT.has(f.mimeType)) return { content: await exportText(f) };
  if (isPlainText(f.mimeType)) return { content: (await download(f, 2_000_000)).toString('utf8') };
  if (f.mimeType === 'application/pdf') {
    // Claude reads the PDF once, when it's new or changed, and the text is kept.
    const pdf = await download(f, 20_000_000);
    const msg = await anthropic.messages.stream({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          { type: 'text', text: 'Transcribe all of the text in this document as plain text, in reading order. Keep tables as one row per line with cells separated by " | ". Output only the document text.' },
        ],
      }],
    }).finalMessage();
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n');
    return { content: text };
  }
  if (f.mimeType.startsWith('application/vnd.google-apps.')) return { skip: 'This kind of Google file has no text to read.' };
  if (/officedocument|msword|ms-excel|ms-powerpoint/.test(f.mimeType)) {
    return { skip: 'Office files are not read directly. Open it in Drive and use File > Save as Google Docs (or Sheets/Slides).' };
  }
  return { skip: 'Not a document type the agent can read (Google Docs, Sheets, Slides, PDF, or text).' };
}

const running = new Set<number>();
export const isSyncing = (agentId: number) => running.has(agentId);

export async function syncAgentKnowledge(agentId: number): Promise<void> {
  if (running.has(agentId)) return;
  running.add(agentId);
  try {
    const agent = (await pool.query(`SELECT id, "driveFolderId" FROM inbound_agent_config WHERE id = $1`, [agentId])).rows[0];
    if (!agent) return;
    if (!agent.driveFolderId) {
      await pool.query(`DELETE FROM agent_knowledge_files WHERE "agentId" = $1`, [agentId]);
      await pool.query(`UPDATE inbound_agent_config SET "knowledgeSyncedAt" = NULL, "knowledgeError" = NULL WHERE id = $1`, [agentId]);
      return;
    }
    await folderName(agent.driveFolderId); // clear error if it isn't shared
    const files = await listFiles(agent.driveFolderId);
    const existing = new Map((await pool.query(
      `SELECT "driveFileId", "modifiedTime", status FROM agent_knowledge_files WHERE "agentId" = $1`, [agentId]
    )).rows.map((r: any) => [r.driveFileId, r]));

    for (const f of files) {
      const prev = existing.get(f.id);
      if (prev && prev.modifiedTime === f.modifiedTime && prev.status !== 'error') continue; // unchanged
      let status = 'ok', detail: string | null = null, content: string | null = null;
      try {
        const r = await readFile(f);
        if ('skip' in r) { status = 'skipped'; detail = r.skip; }
        else {
          content = r.content.replace(/\u0000/g, '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
          if (content.length > PER_FILE_CHARS) { content = content.slice(0, PER_FILE_CHARS); detail = 'Only the first part is used (the document is very long).'; }
          if (!content) { status = 'skipped'; detail = 'No text found in this file.'; content = null; }
        }
      } catch (err: any) {
        status = 'error';
        detail = err instanceof DriveError ? err.message : `Could not read it: ${err?.message || err}`;
      }
      await pool.query(
        `INSERT INTO agent_knowledge_files ("agentId", "driveFileId", name, path, "mimeType", "modifiedTime", content, chars, status, detail, "syncedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT ("agentId", "driveFileId") DO UPDATE SET name=EXCLUDED.name, path=EXCLUDED.path, "mimeType"=EXCLUDED."mimeType",
           "modifiedTime"=EXCLUDED."modifiedTime", content=EXCLUDED.content, chars=EXCLUDED.chars, status=EXCLUDED.status,
           detail=EXCLUDED.detail, "syncedAt"=NOW()`,
        [agentId, f.id, f.name, f.path, f.mimeType, f.modifiedTime, content, content?.length || 0, status, detail]
      );
    }
    // Forget documents that were removed from the folder.
    await pool.query(
      `DELETE FROM agent_knowledge_files WHERE "agentId" = $1 AND NOT ("driveFileId" = ANY($2::text[]))`,
      [agentId, files.map(f => f.id)]
    );
    await pool.query(`UPDATE inbound_agent_config SET "knowledgeSyncedAt" = NOW(), "knowledgeError" = NULL WHERE id = $1`, [agentId]);
  } catch (err: any) {
    const message = err instanceof DriveError ? err.message : `Sync failed: ${err?.message || err}`;
    console.error(`[knowledge] agent ${agentId}:`, message);
    await pool.query(`UPDATE inbound_agent_config SET "knowledgeError" = $1 WHERE id = $2`, [message, agentId]).catch(() => {});
  } finally {
    running.delete(agentId);
  }
}

// The agent's documents for its instructions, newest sync first-come, up to
// the size limit. Cached per sync so chats don't reload them every message.
const cache = new Map<number, { key: string; text: string }>();
export async function knowledgeText(agentId: number, syncedAt: string | null): Promise<string> {
  if (!syncedAt) return '';
  const hit = cache.get(agentId);
  if (hit && hit.key === syncedAt) return hit.text;
  const rows = (await pool.query(
    `SELECT name, path, content FROM agent_knowledge_files WHERE "agentId" = $1 AND status = 'ok' AND content IS NOT NULL ORDER BY path, name`,
    [agentId]
  )).rows;
  let total = 0;
  const parts: string[] = [];
  for (const r of rows) {
    const doc = `<document name="${(r.path + r.name).replace(/"/g, "'")}">\n${r.content}\n</document>`;
    if (total + doc.length > KNOWLEDGE_LIMIT_CHARS) break;
    parts.push(doc);
    total += doc.length;
  }
  const text = parts.join('\n\n');
  cache.set(agentId, { key: syncedAt, text });
  return text;
}

// Hourly background sync for every agent with a folder.
export function startKnowledgeSync(): void {
  const tick = async () => {
    try {
      const rows = (await pool.query(`SELECT id FROM inbound_agent_config WHERE "driveFolderId" IS NOT NULL`)).rows;
      for (const r of rows) await syncAgentKnowledge(r.id);
    } catch (err) {
      console.error('[knowledge] background sync failed:', err);
    }
  };
  setTimeout(tick, 2 * 60_000);
  setInterval(tick, 60 * 60_000);
}
