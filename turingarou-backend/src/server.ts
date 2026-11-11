import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom } from './game/GameRoom.js';
import { initDB, isDBEnabled } from './game/GameLogger.js';
import { registerHistoryRoutes } from './history/routes.js';
import fs from 'fs';
import { ChatProvider } from './llm/chatClient.js';
import { buildProviderPool, describePool } from './llm/providerRegistry.js';
import { registerVoiceRoutes } from './voice/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// ====== LLM PROVIDER SETUP ======

// LLM_POOL="id[:weight],…" picks providers from src/llm/providerRegistry.ts; without it, every default provider
// whose key is set (Deepseek, Mistral, Anthropic). Each AI draws one provider per game (weighted), and a call that
// fails falls back to another provider of this pool (llmCall.ts).
const llmPool = buildProviderPool(process.env);
llmPool.warnings.forEach((w) => console.warn(`[llm] ${w}`));
const llmProviders: ChatProvider[] = llmPool.providers;
const llmProviderNames = llmPool.members.map((m) => m.provider.name);

if (llmProviders.length === 0) {
  console.error('No LLM provider available. Set LLM_POOL and the matching keys, or DEEPSEEK_API_KEY / MISTRAL_API_KEY / ANTHROPIC_API_KEY.');
  process.exit(1);
}

console.log(`LLM pool: ${describePool(llmPool)}`);

// Commit served, written by the deploy workflow; "dev" locally.
const VERSION = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'version.txt'), 'utf8').trim() || 'dev';
  } catch {
    return 'dev';
  }
})();

// ====== GAME ROOMS MANAGEMENT ======

const gameRooms = new Map<string, GameRoom>();

function createRoom(roomId: string, aiCount: number): GameRoom {
  const room: GameRoom = new GameRoom(roomId, io, llmProviders, aiCount, {
    onVacant: () => {
      if (gameRooms.get(roomId) !== room) return;
      gameRooms.delete(roomId);
      console.log(`Room ${roomId} deleted (no humans left)`);
    },
  });
  gameRooms.set(roomId, room);
  return room;
}

function getOrCreateRoom(roomId: string): GameRoom {
  // Si c'est le public lobby, chercher une room disponible
  if (roomId === 'public-lobby') {
    // Chercher une room publique en attente avec de la place
    const lobbyAiCount = parseInt(process.env.AI_COUNT || '3');
    const humanSlots = 8 - lobbyAiCount; // maxPlayers - aiCount
    for (const [id, room] of gameRooms) {
      if (id.startsWith('public-') && room.isJoinable()) {
        const humanCount = room.getState().players.filter(p => p.type === 'human').length;
        if (humanCount < humanSlots) {
          console.log(`Joining existing public room: ${id} (${humanCount}/${humanSlots} players)`);
          return room;
        }
      }
    }
    
    // Aucune room dispo, créer une nouvelle avec un ID unique
    const newRoomId = 'public-' + Date.now();
    const aiCount = parseInt(process.env.AI_COUNT || '3');
    const room = createRoom(newRoomId, aiCount);
    console.log(`Created new public room: ${newRoomId} with ${aiCount} AIs`);
    return room;
  }
  
  // Room privée avec code custom
  if (!gameRooms.has(roomId)) {
    const aiCount = parseInt(process.env.AI_COUNT || '3');
    createRoom(roomId, aiCount);
    console.log(`Created private room: ${roomId} with ${aiCount} AIs`);
  }
  return gameRooms.get(roomId)!;
}

// ====== SOCKET.IO EVENTS ======

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  let currentRoom: GameRoom | null = null;
  // Resolved on every action: once a resume moves the seat to another socket, this one plays for nobody.
  const me = (): string | null => (currentRoom ? currentRoom.playerIdBySocket(socket.id) : null);

  // Rejoindre une room
  socket.on('joinRoom', async ({ roomId, username, language }: { roomId: string; username: string; language?: 'fr' | 'en' }) => {
    console.log(`${username} joining room ${roomId}`);

    const room = getOrCreateRoom(roomId);
    const actualRoomId = room.getState().roomId;
    const success = await room.addHumanPlayer(socket.id, username, language);

    if (success) {
      socket.join(actualRoomId);  // Rejoindre la vraie room (pas "public-lobby")
      currentRoom = room;
      const playerId = room.playerIdBySocket(socket.id);
      // The token goes to this socket only: it is how this client takes its seat back after a dropped connection.
      socket.emit('joinSuccess', { playerId, roomId: actualRoomId, token: playerId ? room.sessionToken(playerId) : null });
      console.log(`${username} joined successfully in ${actualRoomId}`);
    } else {
      socket.emit('joinError', { message: 'Room is full or unavailable' });
    }
  });

  // Reprendre sa place après une coupure (veille mobile, réseau) avec le jeton reçu à joinSuccess
  socket.on('resumeSession', (payload: { roomId?: unknown; token?: unknown } | undefined) => {
    const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
    const room = gameRooms.get(roomId);
    const seat = room && typeof payload?.token === 'string' ? room.resume(socket.id, payload.token) : null;
    if (!room || !seat) {
      socket.emit('resumeError', {});
      return;
    }
    socket.join(roomId);
    currentRoom = room;
    // A socket that never noticed its own drop (a second tab, a half-open connection) stops playing this seat.
    if (seat.previousSocketId && seat.previousSocketId !== socket.id) io.sockets.sockets.get(seat.previousSocketId)?.disconnect(true);
    socket.emit('resumeSuccess', { playerId: seat.playerId, roomId });
    socket.emit('gameState', room.publicState());
    console.log(`${seat.playerId} resumed in ${roomId}`);
  });

  // Retour à l'accueil volontaire
  socket.on('leaveRoom', () => {
    if (!currentRoom) return;
    currentRoom.leave(socket.id);
    socket.leave(currentRoom.getRoomId());
    currentRoom = null;
  });

  // Envoyer un message
  socket.on('sendMessage', ({ message }: { message: string }) => {
    const playerId = me();
    if (!currentRoom || !playerId) return;

    console.log(`Message from ${playerId}: ${message}`);
    currentRoom.addMessage(playerId, message);
  });

  // Répondre à la question
  socket.on('answerQuestion', ({ answer }: { answer: string }) => {
    const playerId = me();
    if (!currentRoom || !playerId) return;

    console.log(`Answer from ${playerId}: ${answer}`);
    currentRoom.addAnswer(playerId, answer);
  });

  // Voter
  socket.on('vote', ({ targetId }: { targetId: string }) => {
    const playerId = me();
    if (!currentRoom || !playerId) return;

    console.log(`Vote from ${playerId} for ${targetId}`);
    currentRoom.addVote(playerId, targetId);
  });

  // Flaguer un message comme suspicious
  socket.on('flagMessage', ({ messageId, reason }: { messageId: string; reason?: string }) => {
    const playerId = me();
    if (!currentRoom || !playerId) return;
    currentRoom.flagMessage(playerId, messageId, reason);
  });

  // Ajouter un AI Inspector pour remplir le dernier slot humain (2 humains en attente)
  socket.on('addInspector', async () => {
    if (!currentRoom) {
      socket.emit('joinError', { message: 'Not in a room' });
      return;
    }
    const success = await currentRoom.addInspectorPlayer();
    if (success) {
      socket.emit('inspectorAdded', {});
    } else {
      socket.emit('joinError', { message: 'Cannot add inspector (room full or not 2 humans)' });
    }
  });

  // Déconnexion : la place reste (grâce), la room se supprime d'elle-même quand plus aucun humain n'y est (onVacant)
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    currentRoom?.disconnect(socket.id);
  });
});

// ====== ROOM CLEANUP ======
// Periodic cleanup of finished/empty rooms every 5 minutes
setInterval(() => {
  for (const [id, room] of gameRooms) {
    const state = room.getState();
    if (!room.hasLiveHuman() || state.phase === 'gameover') {
      gameRooms.delete(id);
      console.log(`[Cleanup] Room ${id} removed (phase=${state.phase}, live humans=${room.hasLiveHuman()})`);
    }
  }
}, 5 * 60 * 1000);

// ====== HTTP ROUTES ======

// Le front est servi par le même service (comme la démo Présence) : même origine, pas de CORS.
// src/ (tsx) et dist/ (build) sont tous deux à deux niveaux de la racine du repo.
const FRONTEND_FILE = path.join(__dirname, '..', '..', 'turingarou-online.html');

app.get('/', (req, res) => {
  res.sendFile(FRONTEND_FILE);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    rooms: gameRooms.size,
    llmProviders: llmProviderNames,
    aiCount: parseInt(process.env.AI_COUNT || '3'),
    maxPlayers: 8,
    db: isDBEnabled() ? 'postgres' : 'none',
  });
});

registerVoiceRoutes(app, gameRooms);

app.get('/rooms', (req, res) => {
  const rooms = Array.from(gameRooms.values()).map((room) => ({
    roomId: room.getRoomId(),
    players: room.getState().players.length,
    phase: room.getState().phase,
    round: room.getState().currentRound,
  }));

  res.json({ rooms });
});

registerHistoryRoutes(app);

// ====== START SERVER ======

const PORT = process.env.PORT || 3001;

// Init DB non bloquante : le serveur démarre même si Postgres est injoignable.
initDB().catch((err) => { console.warn('[GameLogger] Init failed (non-fatal):', err.message); });

httpServer.listen(PORT, () => {
  console.log(`
🎮 Turingarou Backend Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Port: ${PORT}
🤖 LLM: ${llmProviderNames.join(' + ')}
🎯 AI Count: ${process.env.AI_COUNT || 2}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
