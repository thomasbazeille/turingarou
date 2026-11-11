import { randomInt } from 'node:crypto';
import type { TableOptions } from './GameRoom.js';

/** After the first "play again with this group" click, the rest of the group may follow this long. */
export const REMATCH_WINDOW_MS = 30_000;

/** Code of a private room, as typed or shared in a ?room= link: no 0/O nor 1/I to misread. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function newRoomCode(taken: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    if (!taken(code)) return code;
  }
}

/** The rematch room opened from a finished one. */
export interface RematchLink {
  roomId: string;
  openedAt: number;
}

export type RematchRoute = { kind: 'create' } | { kind: 'join'; roomId: string } | { kind: 'closed'; reason: 'window' | 'started' };

/**
 * Where a click on "play again with this group" sends a player of a finished game: the first click opens a new room,
 * the next ones within REMATCH_WINDOW_MS join it. A rematch room that emptied and was forgotten opens anew.
 */
export function routeRematch(link: RematchLink | null, now: number, linked: { joinable: boolean } | null): RematchRoute {
  if (!link || !linked) return { kind: 'create' };
  if (now - link.openedAt >= REMATCH_WINDOW_MS) return { kind: 'closed', reason: 'window' };
  if (!linked.joinable) return { kind: 'closed', reason: 'started' };
  return { kind: 'join', roomId: link.roomId };
}

/** A rematch is a private room where nobody keeps a name from the game just revealed, AIs included. */
export function rematchTable(previousNames: string[]): TableOptions {
  return { hostLaunch: true, freshNames: { reserved: [...previousNames] } };
}
