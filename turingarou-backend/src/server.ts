import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom } from './game/GameRoom.js';
import { DeepseekProvider } from './llm/DeepseekProvider.js';
import { MistralProvider } from './llm/MistralProvider.js';
import { AnthropicProvider } from './llm/AnthropicProvider.js';
import { LLMProvider } from './llm/LLMProvider.js';

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
const llmProviders: LLMProvider[] = [];

if (process.env.DEEPSEEK_API_KEY) {
  llmProviders.push(new DeepseekProvider({ apiKey: process.env.DEEPSEEK_API_KEY }));
}
if (process.env.MISTRAL_API_KEY) {
  llmProviders.push(new MistralProvider({ apiKey: process.env.MISTRAL_API_KEY }));
}
if (process.env.ANTHROPIC_API_KEY) {
  llmProviders.push(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }));
}

if (llmProviders.length === 0) {
  console.error('No LLM API key configured. Set DEEPSEEK_API_KEY and/or MISTRAL_API_KEY.');
  process.exit(1);
}

console.log(`Using LLM provider(s): ${llmProviders.map((p) => p.name).join(', ')}`);

// ====== GAME ROOMS MANAGEMENT ======

const gameRooms = new Map<string, GameRoom>();

function getOrCreateRoom(roomId: string): GameRoom {
  // Si c'est le public lobby, chercher une room disponible
  if (roomId === 'public-lobby') {
    // Chercher une room publique en attente avec de la place
    const lobbyAiCount = parseInt(process.env.AI_COUNT || '2');
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
    const aiCount = parseInt(process.env.AI_COUNT || '2');
    const room = new GameRoom(newRoomId, io, llmProviders, aiCount);
    gameRooms.set(newRoomId, room);
    console.log(`Created new public room: ${newRoomId} with ${aiCount} AIs`);
    return room;
  }
  
  // Room privée avec code custom
  if (!gameRooms.has(roomId)) {
    const aiCount = parseInt(process.env.AI_COUNT || '2');
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

app.get('/admin/db', (req, res) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'ADMIN_SECRET not configured on this server' });
    return;
  }
  if (req.query.key !== secret) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Résolution identique à GameLogger (process.cwd()) avec fallback __dirname/../
  const dbPath = process.env.DB_PATH
    || path.join(process.cwd(), 'turingarou.db');

  if (!fs.existsSync(dbPath)) {
    res.status(404).json({ error: `DB not found at ${dbPath}` });
    return;
  }

  res.download(dbPath, 'turingarou.db', (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: gameRooms.size,
    llmProviders: llmProviders.map((p) => p.name),
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

// ====== START SERVER ======

const PORT = process.env.PORT || 3001;

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
