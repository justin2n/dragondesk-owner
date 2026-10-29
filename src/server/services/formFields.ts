// What a website's signup form requires, as read by the chat widget, cleaned
// up before the agent sees it. The widget runs on the public internet, so a
// report could be forged: everything is length-limited, stripped to plain
// characters, and only ever shown to the agent as a list of choices.

export const KNOWN_REQUIRED = ['lastName', 'phone', 'company', 'program', 'location'] as const;
export type KnownRequired = typeof KNOWN_REQUIRED[number];

export interface ExtraField {
  alias: string;        // stable tool-safe name (f1, f2, ...) the agent fills in
  key: string;          // the form field's name or id
  label: string;        // what the form calls it
  kind: 'select' | 'checkbox' | 'text';
  options: string[];    // choices for selects and radio groups
}

export interface FormFields {
  required: KnownRequired[];
  options: Partial<Record<'program' | 'location', string[]>>;
  extras: ExtraField[];
}

const text = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v.replace(/[\u0000-\u001f<>{}\[\]`\\]/g, ' ').replace(/\s+/g, ' ').replace(/\*/g, '').trim().slice(0, max)
    : '';

const optionList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map(o => text(o, 80)).filter(Boolean))].slice(0, 40) : [];

export function sanitizeFormFields(raw: any): FormFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const required = (Array.isArray(raw.required) ? raw.required : [])
    .filter((k: unknown): k is KnownRequired => (KNOWN_REQUIRED as readonly string[]).includes(String(k)));
  const options: FormFields['options'] = {};
  for (const k of ['program', 'location'] as const) {
    const list = optionList(raw.options?.[k]);
    if (list.length) options[k] = list;
  }
  const extras: ExtraField[] = [];
  for (const e of (Array.isArray(raw.extras) ? raw.extras : []).slice(0, 8)) {
    const key = typeof e?.key === 'string' && /^[\w.\-\[\]:]{1,80}$/.test(e.key) ? e.key : '';
    const kind = e?.kind === 'select' || e?.kind === 'checkbox' ? e.kind : 'text';
    const label = text(e?.label, 80) || key;
    if (!key || extras.some(x => x.key === key)) continue;
    const opts = kind === 'select' ? optionList(e?.options) : [];
    if (kind === 'select' && !opts.length) continue;
    extras.push({ alias: `f${extras.length + 1}`, key, label, kind, options: opts });
  }
  if (!required.length && !Object.keys(options).length && !extras.length) return null;
  return { required: [...new Set(required)] as KnownRequired[], options, extras };
}

export function parseStoredFormFields(v: unknown): FormFields | null {
  if (!v) return null;
  try { return sanitizeFormFields(typeof v === 'string' ? JSON.parse(v) : v); } catch { return null; }
}

const LABELS: Record<KnownRequired, string> = {
  lastName: 'last name', phone: 'phone number', company: 'business name', program: 'program', location: 'location',
};
export const requiredLabel = (k: KnownRequired) => LABELS[k];
