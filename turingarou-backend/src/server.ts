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
import { OpenAICompatProvider } from './llm/OpenAICompatProvider.js';
import { AnthropicChatProvider } from './llm/AnthropicChatProvider.js';

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

// Build pool: all providers whose API key is set.
// Each AI in a game will pick independently at random — within a game you can get mixed providers.
// A provider failing mid-call falls back to another one of this pool (llmCall.ts).
const llmProviders: ChatProvider[] = [];

if (process.env.DEEPSEEK_API_KEY) {
  llmProviders.push(
    new OpenAICompatProvider({
      vendor: 'Deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      defaultTemperature: 1.3,
      supportsJson: true,
    })
  );
}
if (process.env.MISTRAL_API_KEY) {
  llmProviders.push(
    new OpenAICompatProvider({
      vendor: 'Mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey: process.env.MISTRAL_API_KEY,
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      defaultTemperature: 1.0,
      maxTemperature: 1.0,
      supportsJson: true,
    })
  );
}
if (process.env.ANTHROPIC_API_KEY) {
  llmProviders.push(new AnthropicChatProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'));
}

if (llmProviders.length === 0) {
  console.error('No LLM API key configured. Set DEEPSEEK_API_KEY and/or MISTRAL_API_KEY.');
  process.exit(1);
}

console.log(`Using LLM provider(s): ${llmProviders.map((p) => p.name).join(', ')}`);

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

function getOrCreateRoom(roomId: string): GameRoom {
  // Si c'est le public lobby, chercher une room disponible
  if (roomId === 'public-lobby') {
    // Chercher une room publique en attente avec de la place
    const lobbyAiCount = parseInt(process.env.AI_COUNT || '3');
    const humanSlots = 8 - lobbyAiCount; // maxPlayers - aiCount
    for (const [id, room] of gameRooms) {
      if (id.startsWith('public-') && room.getState().phase === 'waiting') {
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
    const room = new GameRoom(newRoomId, io, llmProviders, aiCount);
    gameRooms.set(newRoomId, room);
    console.log(`Created new public room: ${newRoomId} with ${aiCount} AIs`);
    return room;
  }
  
  // Room privée avec code custom
  if (!gameRooms.has(roomId)) {
    const aiCount = parseInt(process.env.AI_COUNT || '3');
    const room = new GameRoom(roomId, io, llmProviders, aiCount);
    gameRooms.set(roomId, room);
    console.log(`Created private room: ${roomId} with ${aiCount} AIs`);
  }
  return gameRooms.get(roomId)!;
}

// ====== SOCKET.IO EVENTS ======

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  let currentRoom: GameRoom | null = null;
  let playerId: string | null = null;

  // Rejoindre une room
  socket.on('joinRoom', async ({ roomId, username, language }: { roomId: string; username: string; language?: 'fr' | 'en' }) => {
    console.log(`${username} joining room ${roomId}`);

    const room = getOrCreateRoom(roomId);
    const actualRoomId = room.getState().roomId;
    const success = await room.addHumanPlayer(socket.id, username, language);

    if (success) {
      socket.join(actualRoomId);  // Rejoindre la vraie room (pas "public-lobby")
      currentRoom = room;
      
      // Trouver l'ID du joueur
      const player = room.getState().players.find(
        (p) => p.type === 'human' && p.socketId === socket.id
      );
      if (player) {
        playerId = player.id;
      }

      socket.emit('joinSuccess', { playerId, roomId: actualRoomId });
      console.log(`${username} joined successfully in ${actualRoomId}`);
    } else {
      socket.emit('joinError', { message: 'Room is full or unavailable' });
    }
  });

  // Envoyer un message
  socket.on('sendMessage', ({ message }: { message: string }) => {
    if (!currentRoom || !playerId) return;

    console.log(`Message from ${playerId}: ${message}`);
    currentRoom.addMessage(playerId, message);
  });

  // Répondre à la question
  socket.on('answerQuestion', ({ answer }: { answer: string }) => {
    if (!currentRoom || !playerId) return;

    console.log(`Answer from ${playerId}: ${answer}`);
    currentRoom.addAnswer(playerId, answer);
  });

  // Voter
  socket.on('vote', ({ targetId }: { targetId: string }) => {
    if (!currentRoom || !playerId) return;

    console.log(`Vote from ${playerId} for ${targetId}`);
    currentRoom.addVote(playerId, targetId);
  });

  // Flaguer un message comme suspicious
  socket.on('flagMessage', ({ messageId, reason }: { messageId: string; reason?: string }) => {
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

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
      // Clean up the room immediately if no humans remain
      const rid = currentRoom.getRoomId();
      const humans = currentRoom.getState().players.filter((p) => p.type === 'human');
      if (humans.length === 0) {
        gameRooms.delete(rid);
        console.log(`Room ${rid} deleted (no humans left)`);
      }
    }
  });
});

// ====== ROOM CLEANUP ======
// Periodic cleanup of finished/empty rooms every 5 minutes
setInterval(() => {
  for (const [id, room] of gameRooms) {
    const state = room.getState();
    const humans = state.players.filter((p) => p.type === 'human');
    if (humans.length === 0 || state.phase === 'gameover') {
      gameRooms.delete(id);
      console.log(`[Cleanup] Room ${id} removed (phase=${state.phase}, humans=${humans.length})`);
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
    llmProviders: llmProviders.map((p) => p.name),
    aiCount: parseInt(process.env.AI_COUNT || '3'),
    maxPlayers: 8,
    db: isDBEnabled() ? 'postgres' : 'none',
  });
});

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
🤖 LLM: ${llmProviders.map((p) => p.name).join(' + ')}
🎯 AI Count: ${process.env.AI_COUNT || 2}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
