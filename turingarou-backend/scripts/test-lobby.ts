/**
 * Filling a table: host launch of a private room (refused below 3 humans and to a non-host), AI count by table size,
 * lobby states that show each human only their own seat, the ?room= invite link of the client page, and the rematch
 * (30 s window, fresh names for every seat, old tokens refused).
 *
 *   npx tsx scripts/test-lobby.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { GameRoom, MIN_LAUNCH_HUMANS, RoomEmitter, TableOptions, USERNAME_MAX, aiCountFor, cleanUsername, parseTableChoice } from '../src/game/GameRoom.js';
import type { GameLogData } from '../src/game/GameLogger.js';
import { REMATCH_WINDOW_MS, ROOM_CODE_ALPHABET, newRoomCode, rematchTable, routeRematch } from '../src/game/rematch.js';
import type { ChatProvider } from '../src/llm/chatClient.js';
import { makeSeededRng } from '../src/game/humanTiming.js';

let failures = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failures++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
};

const clock = {
  now: () => 1_800_000_000_000,
  setTimeout: () => 0,
  clearTimeout: () => {},
};

const quietModel: ChatProvider = {
  name: 'Fake/quiet',
  model: 'quiet',
  supportsJson: true,
  chat: async () => ({ text: 'SKIP', finishReason: 'stop', latencyMs: 1, provider: 'Fake/quiet', model: 'quiet' }),
};

type Emit = { target: string; payload: Record<string, any> };

function makeRoom(roomId: string, table: TableOptions = {}) {
  const emits: Emit[] = [];
  const io: RoomEmitter = { to: (target) => ({ emit: (event: string, payload: unknown) => (event === 'gameState' ? emits.push({ target, payload: JSON.parse(JSON.stringify(payload)) }) : 0) }) };
  const pool = ['ana', 'ben', 'cleo', 'dan', 'eva', 'fred', 'gina', 'hugo', 'ivy', 'jo', 'kim', 'lou', 'max', 'nina', 'otto', 'pia', 'quin', 'rita'];
  const used = new Set<string>();
  const picks: string[][] = [];
  const saved: GameLogData[] = [];
  const rng = makeSeededRng(11);
  const room = new GameRoom(
    roomId,
    io,
    [quietModel],
    3,
    {
      clock,
      rng,
      names: {
        add: (n) => used.add(n),
        pick: (ex) => {
          picks.push([...ex]);
          const free = pool.filter((n) => !used.has(n) && !ex.includes(n));
          return free[Math.floor(rng() * free.length)] ?? 'zed';
        },
      },
      strategies: { aiPlayer: async () => ({ name: 'test', content: 'play' }), inspector: async () => 'inspect' },
      persistence: { saveGameLog: async (d) => void saved.push(d), updateHumanProfiles: async () => {}, saveMessageFlag: async () => {}, saveGameFeedback: async () => {}, getRandomHumanProfile: async () => null },
      log: () => {},
    },
    table
  );
  const sockets: string[] = [];
  const join = async (name: string) => {
    const socket = `${roomId}-sock-${sockets.length}`;
    sockets.push(socket);
    assert.equal(await room.addHumanPlayer(socket, name, 'fr'), true, `${name} could not join`);
    return socket;
  };
  return { room, emits, sockets, join, picks, saved };
}

const lastTo = (emits: Emit[], target: string) => [...emits].reverse().find((e) => e.target === target)?.payload;

console.log('host launch');

await check(`private room: refused below ${MIN_LAUNCH_HUMANS} humans, refused to a non-host, then 3 humans + 2 AIs`, async () => {
  const { room, join } = makeRoom('P1', { hostLaunch: true });
  const host = await join('h0');
  const second = await join('h1');
  assert.equal(await room.launch(host), 'too_few');
  const third = await join('h2');
  assert.equal(await room.launch(second), 'not_host');
  assert.equal(await room.launch(third), 'not_host');
  assert.equal(await room.launch('stranger'), 'not_host');
  assert.equal(room.getState().phase, 'waiting', 'a refused launch started the game');
  assert.equal(await room.launch(host), null);
  const s = room.getState();
  assert.equal(s.phase, 'question');
  assert.equal(s.aiCount, 2);
  assert.equal(s.maxPlayers, 5);
  assert.equal(s.players.length, 5);
  assert.equal(s.players.filter((p) => p.type === 'ai').length, 2);
  assert.deepEqual(room.getGameFormat().humanCount, 3);
  assert.equal(await room.launch(host), 'not_waiting', 'launched twice');
});

await check('scale: 3 → 2 AIs, 4 → 3 AIs, 5 → 3 AIs; 4 humans launch a table of 7', async () => {
  assert.deepEqual([3, 4, 5].map(aiCountFor), [2, 3, 3]);
  const { room, join } = makeRoom('P2', { hostLaunch: true });
  const host = await join('h0');
  for (let i = 1; i < 4; i++) await join(`h${i}`);
  assert.equal(await room.launch(host), null);
  assert.equal(room.getState().players.length, 7);
  assert.equal(room.getState().players.filter((p) => p.type === 'ai').length, 3);
});

await check('private room with 5 humans starts by itself with 3 AIs, as the public room does', async () => {
  const { room, join } = makeRoom('P3', { hostLaunch: true });
  for (let i = 0; i < 5; i++) await join(`h${i}`);
  assert.equal(room.getState().phase, 'question');
  assert.equal(room.getState().players.length, 8);
  assert.equal(room.getState().aiCount, 3);
});

await check('public room: no host launch', async () => {
  const { room, join } = makeRoom('public-1');
  const first = await join('h0');
  for (let i = 1; i < 4; i++) await join(`h${i}`);
  assert.equal(await room.launch(first), 'not_private');
  assert.equal(room.getState().phase, 'waiting');
});

await check('the host leaves the lobby: the next human in becomes host', async () => {
  const { room, join } = makeRoom('P4', { hostLaunch: true });
  const host = await join('h0');
  const next = await join('h1');
  await join('h2');
  await join('h3');
  room.leave(host);
  assert.equal(await room.launch(next), null);
  assert.equal(room.getState().players.length, 5, '3 humans left should launch with 2 AIs');
});

console.log('lobby states');

await check('each socket gets its own seat only; the room channel hears nothing before the start', async () => {
  const { room, emits, join, sockets } = makeRoom('L1', { hostLaunch: true });
  for (let i = 0; i < 3; i++) await join(`h${i}`);
  assert.equal(emits.filter((e) => e.target === 'L1').length, 0, 'a lobby state was broadcast to the room');
  for (const [i, socket] of sockets.entries()) {
    const st = lastTo(emits, socket)!;
    assert.equal(st.phase, 'waiting');
    assert.equal(st.players.length, 3);
    const shown = st.players.filter((p: any) => p.id !== '' || p.username !== '' || p.color !== '');
    assert.equal(shown.length, 1, `${socket} sees ${shown.length} seats`);
    assert.equal(shown[0].username, `h${i}`);
    assert.equal(shown[0].id, room.playerIdBySocket(socket));
    assert.equal(st.lobby.host, i === 0);
    assert.equal(st.lobby.canLaunch, i === 0);
    assert.equal(st.lobby.launchAIs, 2);
    assert.deepEqual(room.publicState(socket), st, 'publicState(socket) differs from what the socket was sent');
  }
  assert.ok((room.publicState().players as { id: string }[]).every((p) => p.id === ''), 'publicState() without a socket shows a seat');
  await room.launch(sockets[0]);
  const started = emits.filter((e) => e.target === 'L1');
  assert.ok(started.length > 0 && started.every((e) => e.payload.phase !== 'waiting' && !('lobby' in e.payload)));
});

console.log('invite link');

const html = readFileSync(new URL('../../turingarou-online.html', import.meta.url), 'utf8');
const clientFn = (name: string) => {
  const m = new RegExp(`function ${name}\\(([^)]*)\\) \\{[\\s\\S]*?\\n\\}`).exec(html);
  assert.ok(m, `${name} not found in turingarou-online.html`);
  return m[0];
};

await check('?room= pre-fills the code: upper case, letters and digits only; the client alphabet is the server one', () => {
  const parse = new Function(`${clientFn('roomCodeFromSearch')}; return roomCodeFromSearch;`)() as (s: string) => string;
  assert.equal(parse('?room=q7kx9p'), 'Q7KX9P');
  assert.equal(parse('?lang=fr&room=AB-C%2012'), 'ABC12');
  assert.equal(parse('?room=' + 'X'.repeat(40)), 'X'.repeat(12));
  assert.equal(parse(''), '');
  assert.equal(parse('?other=1'), '');
  const alphabet = /const ROOM_CODE_ALPHABET = '([A-Z0-9]+)';/.exec(html)?.[1];
  assert.equal(alphabet, ROOM_CODE_ALPHABET);
  const code = newRoomCode(() => false);
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal(parse('?room=' + encodeURIComponent(code)), code, 'a server code does not survive the link');
  const clientCode = new Function('crypto', `const ROOM_CODE_ALPHABET = '${alphabet}'; ${clientFn('newRoomCode')}; return newRoomCode();`)(webcrypto) as string;
  assert.equal(parse('?room=' + clientCode), clientCode, 'a client code does not survive the link');
});

await check('QR code of the link: right size, the three finders, null past 106 bytes', () => {
  const qr = new Function(`${clientFn('qrMatrix')}; return qrMatrix;`)() as (text: string) => boolean[][] | null;
  const link = 'https://turingarou.example.app/?room=Q7KX9P';
  const m = qr(link);
  assert.ok(m, 'no matrix for a short link');
  assert.equal(m.length, 33, 'a 43-byte link needs version 4 (33 modules): version 3 holds 42 bytes at level M');
  assert.ok(m.every((row) => row.length === 33));
  assert.equal(qr(link.slice(0, 42))?.length, 29);
  const finder = (x0: number, y0: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        assert.equal(m[y0 + y][x0 + x], d !== 2, `finder at ${x0},${y0} wrong at ${x},${y}`);
      }
    }
  };
  finder(0, 0);
  finder(26, 0);
  finder(0, 26);
  assert.equal(m[25][8], true, 'dark module');
  assert.deepEqual(qr(link), m, 'not deterministic');
  const bits = m.map((row) => row.map((d) => (d ? '1' : '0')).join('')).join('\n');
  // This exact matrix was decoded back to the link by OpenCV (QRCodeDetectorAruco) on 2026-11-11: any change to the encoder must be decoded again.
  assert.equal(createHash('sha256').update(bits).digest('hex'), '9da1f63ee4851181a41dcd19b3adf9b96a3c765c105739fcdc0c4f646b9fd7ed');
  assert.equal(qr('x'.repeat(106))?.length, 41);
  assert.equal(qr('x'.repeat(107)), null);
});

await check('a code already taken is never handed out', () => {
  const seen = new Set<string>();
  let calls = 0;
  const code = newRoomCode((c) => {
    calls++;
    if (calls < 4) {
      seen.add(c);
      return true;
    }
    return seen.has(c);
  });
  assert.ok(calls >= 4 && !seen.has(code));
});

console.log('rematch');

await check(`window: the first click opens a room, the next ones join it for ${REMATCH_WINDOW_MS} ms, not after`, () => {
  assert.equal(REMATCH_WINDOW_MS, 30_000);
  const t0 = 1_000_000;
  const link = { roomId: 'R1', openedAt: t0 };
  assert.deepEqual(routeRematch(null, t0, null), { kind: 'create' });
  assert.deepEqual(routeRematch(link, t0 + REMATCH_WINDOW_MS - 1, { joinable: true }), { kind: 'join', roomId: 'R1' });
  assert.deepEqual(routeRematch(link, t0 + REMATCH_WINDOW_MS, { joinable: true }), { kind: 'closed', reason: 'window' });
  assert.deepEqual(routeRematch(link, t0 + 1000, { joinable: false }), { kind: 'closed', reason: 'started' });
  assert.deepEqual(routeRematch(link, t0 + 1000, null), { kind: 'create' }, 'a rematch room that emptied should open anew');
});

await check('fresh names: no seat keeps a name of the finished game, drawn by the same picker as the AIs', async () => {
  const first = makeRoom('G1');
  for (let i = 0; i < 5; i++) await first.join(`me${i}`);
  const finished = first.room.getState().players.map((p) => p.username);
  const tokens = first.sockets.map((s) => first.room.sessionToken(first.room.playerIdBySocket(s)!)!);

  const again = makeRoom('G2', rematchTable(finished));
  const sockets: string[] = [];
  for (let i = 0; i < 3; i++) {
    first.room.leave(first.sockets[i]);
    sockets.push(await again.join(`me${i}`));
  }
  const humans = again.room.getState().players;
  for (const [i, p] of humans.entries()) {
    assert.notEqual(p.username, `me${i}`, 'kept the name typed in the finished game');
    assert.ok(!finished.includes(p.username), `${p.username} was in the finished game`);
  }
  for (const [i, s] of sockets.entries()) {
    const own = lastTo(again.emits, s)!;
    assert.equal(own.lobby.freshName, true);
    const named = own.players.filter((p: any) => p.username !== '');
    assert.deepEqual(named.map((p: any) => p.username), [humans[i].username], `socket ${i} sees other names`);
  }
  assert.equal(await again.room.launch(sockets[0]), null);
  const all = again.room.getState().players;
  assert.equal(all.length, 5);
  assert.ok(all.every((p) => !finished.includes(p.username)), 'an AI took a name of the finished game');
  assert.equal(new Set(all.map((p) => p.username)).size, 5, 'two seats share a name');
  assert.ok(again.picks.every((ex) => finished.every((n) => ex.includes(n))), 'a draw did not exclude the finished game');
  assert.equal(again.picks.length, 5, 'humans and AIs were not all drawn by the same picker');
  for (const t of tokens) assert.equal(again.room.resume('G2-x', t), null, 'an old token opened the rematch');
  for (const t of tokens.slice(0, 3)) assert.equal(first.room.resume('G1-x', t), null, 'a token reopened the finished game after the rematch');
});

console.log('typed names');

await check('a typed name loses markup, control and direction characters, and stops at USERNAME_MAX', () => {
  assert.equal(cleanUsername('<img src=x onerror=alert(1)>'), 'img src=x onerr');
  assert.equal(cleanUsername('  Zoé   l\'ours\n '), "Zoé l'ours");
  assert.equal(cleanUsername('a\u202Eb\u200Bc\u0007'), 'abc');
  assert.equal(Array.from(cleanUsername('é'.repeat(40))).length, USERNAME_MAX);
  assert.equal(cleanUsername('🦊'.repeat(20)), '🦊'.repeat(USERNAME_MAX));
  for (const raw of [undefined, null, 42, { toString: () => '<b>' }, ['x'], '', '   ', '<>']) assert.equal(cleanUsername(raw), '');
});

await check('a name sent past the page is cleaned by the room; one left empty gets a drawn name', async () => {
  const { room, join } = makeRoom('N1');
  await join('<script>x</script>');
  assert.equal(await room.addHumanPlayer('N1-raw', { evil: 1 } as unknown as string, 'fr'), true);
  const [typed, drawn] = room.getState().players;
  assert.equal(typed.username, 'scriptx/script');
  assert.ok(drawn.username.length > 0 && !/[<>]/.test(drawn.username), `drawn name "${drawn.username}"`);
});

console.log('table chosen on the home page');

await check('a choice is whole numbers, 1 human and 1 AI at least, 3 to 8 seats', () => {
  assert.deepEqual(parseTableChoice({ humans: 1, ais: 2 }), { humans: 1, ais: 2 });
  assert.deepEqual(parseTableChoice({ humans: 6, ais: 2 }), { humans: 6, ais: 2 });
  for (const bad of [null, undefined, 'x', {}, { humans: 1, ais: 1 }, { humans: 0, ais: 3 }, { humans: 3, ais: 0 }, { humans: 5, ais: 4 }, { humans: 2.5, ais: 2 }, { humans: '3', ais: 2 }, { humans: NaN, ais: 2 }])
    assert.equal(parseTableChoice(bad), null, JSON.stringify(bad));
});

await check('2 humans + 3 AIs: starts by itself when the second human sits, a third is refused', async () => {
  const { room, join } = makeRoom('C1', { hostLaunch: true, chosen: { humans: 2, ais: 3 } });
  await join('h0');
  assert.equal(room.getState().phase, 'waiting');
  await join('h1');
  const s = room.getState();
  assert.equal(s.phase, 'question');
  assert.equal(s.players.length, 5);
  assert.equal(s.players.filter((p) => p.type === 'ai').length, 3);
  assert.equal(await room.addHumanPlayer('C1-late', 'h2', 'fr'), false);
});

await check('1 human + 2 AIs: the host plays alone at once', async () => {
  const { room, join } = makeRoom('C2', { hostLaunch: true, chosen: { humans: 1, ais: 2 } });
  await join('solo');
  assert.equal(room.getState().phase, 'question');
  assert.equal(room.getState().players.length, 3);
});

await check('5 humans + 1 AI launched at 3 humans keeps its 1 AI, and the lobby says so', async () => {
  const { room, join, emits } = makeRoom('C3', { hostLaunch: true, chosen: { humans: 5, ais: 1 } });
  const host = await join('h0');
  await join('h1');
  await join('h2');
  const lobby = lastTo(emits, host)?.lobby;
  assert.equal(lobby.launchAIs, 1);
  assert.deepEqual(lobby.table, { humans: 5, ais: 1 });
  assert.equal(await room.launch(host), null);
  assert.equal(room.getState().players.length, 4);
  assert.equal(room.getState().players.filter((p) => p.type === 'ai').length, 1);
});

await check('the rematch keeps the chosen table', () => {
  assert.deepEqual(rematchTable(['a'], { humans: 2, ais: 2 }).chosen, { humans: 2, ais: 2 });
  assert.equal(rematchTable(['a']).chosen, undefined);
});

await check('a stop mid-game writes it as aborted with every line and its ids; a lobby writes nothing', async () => {
  const { room, join, saved } = makeRoom('C4', { hostLaunch: true, chosen: { humans: 1, ais: 2 } });
  const solo = await join('solo');
  assert.equal(room.getState().phase, 'question');
  const waiting = makeRoom('C5', { hostLaunch: true });
  await waiting.join('h0');
  await waiting.room.shutdown();
  assert.equal(waiting.saved.length, 0, 'a lobby was written');
  (room as any).state.phase = 'discussion';
  const me = room.playerIdBySocket(solo)!;
  assert.equal(room.addMessage(me, 'premiere ligne'), true);
  const first = room.getState().messages.at(-1)!;
  assert.equal(room.addMessage(me, 'je me reponds', first.id), true);
  await room.shutdown();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].result, 'aborted');
  const lines = saved[0].messages;
  assert.deepEqual(lines.map((m) => m.content), ['premiere ligne', 'je me reponds']);
  assert.equal(lines[0].id, first.id);
  assert.equal(lines[1].replyToId, first.id);
  await room.shutdown();
  assert.equal(saved.length, 1, 'written twice');
});

console.log(failures ? `\n${failures} échec(s)` : '\nTout est vert');
process.exit(failures ? 1 : 0);
