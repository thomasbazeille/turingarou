function stripCodeFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : s.trim();
}

export type ParsedDecision =
  | { ok: true; shouldRespond: false }
  | { ok: true; shouldRespond: true; message: string }
  | { ok: false; error: string };

/** Strict reading of a decision: never turns prose or a broken JSON into a chat message. */
export function parseDecision(text: string, finishReason: string | null): ParsedDecision {
  if (finishReason === 'length' || finishReason === 'max_tokens') return { ok: false, error: 'truncated' };
  const body = stripCodeFences(text);
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false, error: 'no_json' };
  let parsed: any;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return { ok: false, error: 'bad_json' };
  }
  if (typeof parsed.shouldRespond !== 'boolean') return { ok: false, error: 'no_shouldRespond' };
  if (!parsed.shouldRespond) return { ok: true, shouldRespond: false };
  const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
  if (message.length < 1 || message.length > 240) return { ok: false, error: `message_length_${message.length}` };
  return { ok: true, shouldRespond: true, message };
}

/** Plain-text answer: drop fences, surrounding quotes and a leading "name:" label. */
export function cleanPlain(text: string, speakerName?: string): string {
  let s = stripCodeFences(text).trim();
  if (speakerName) {
    const label = new RegExp(`^\\[?${speakerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?\\s*:\\s*`, 'i');
    s = s.replace(label, '');
  }
  const quoted = s.match(/^["«“'](.*)["»”']$/s);
  return (quoted ? quoted[1] : s).trim();
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Finds which player a model meant: exact, then prefix, then whole word inside the answer, then edit distance ≤ 2. */
export function matchPlayerName<T extends { username: string }>(raw: string, candidates: T[]): T | null {
  const answer = norm(cleanPlain(raw));
  if (!answer) return null;
  const named = candidates.map((c) => ({ c, n: norm(c.username) })).filter((x) => x.n);
  const exact = named.find((x) => x.n === answer);
  if (exact) return exact.c;
  const prefix = named.filter((x) => answer.startsWith(x.n) || x.n.startsWith(answer));
  if (prefix.length === 1) return prefix[0].c;
  const words = new Set(answer.split(' '));
  const inside = named.filter((x) => x.n.split(' ').every((w) => words.has(w)));
  if (inside.length === 1) return inside[0].c;
  const close = named.filter((x) => levenshtein(x.n, answer) <= 2);
  if (close.length === 1) return close[0].c;
  return null;
}
