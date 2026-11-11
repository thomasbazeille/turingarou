/** What a client packet may carry, read without trusting its shape: any socket can send anything. */

/** The longest room code accepted from a client: a typed private code or a public room id. */
export const ROOM_ID_MAX = 40;

/** A packet's fields, or none when it is not a plain object (null, a string, an array). */
export function fields(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

export function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** A room code as typed, trimmed; null when it is not text, empty, too long or carries control characters. */
export function roomIdOf(value: unknown): string | null {
  const id = text(value)?.trim() ?? '';
  return id && id.length <= ROOM_ID_MAX && !/[\u0000-\u001f\u007f]/.test(id) ? id : null;
}

export function languageOf(value: unknown): 'fr' | 'en' | undefined {
  return value === 'fr' || value === 'en' ? value : undefined;
}
