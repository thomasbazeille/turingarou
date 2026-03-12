import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { GameRoom } from './game/GameRoom.js';
import { DeepseekProvider } from './llm/DeepseekProvider.js';
import { MistralProvider } from './llm/MistralProvider.js';
import { LLMProvider } from './llm/LLMProvider.js';

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

let llmProvider: LLMProvider;

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'deepseek';

switch (LLM_PROVIDER.toLowerCase()) {
  case 'mistral':
    llmProvider = new MistralProvider({
      apiKey: process.env.MISTRAL_API_KEY || '',
      model: 'mistral-small-latest',
      temperature: 0.8,
    });
    break;
  case 'deepseek':
  default:
    llmProvider = new DeepseekProvider({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: 'deepseek-chat',
      temperature: 0.8,
    });
    break;
}

console.log(`Using LLM provider: ${llmProvider.name}`);

// ====== GAME ROOMS MANAGEMENT ======

const gameRooms = new Map<string, GameRoom>();

function getOrCreateRoom(roomId: string): GameRoom {
  // Si c'est le public lobby, chercher une room disponible
  if (roomId === 'public-lobby') {
    // Chercher une room publique en attente avec moins de 2 joueurs
    for (const [id, room] of gameRooms) {
      if (id.startsWith('public-') && room.getState().phase === 'waiting') {
        const humanCount = room.getState().players.filter(p => p.type === 'human').length;
        if (humanCount < 3) {
          console.log(`Joining existing public room: ${id} (${humanCount}/3 players)`);
          return room;
        }
      }
    }
    
    // Aucune room dispo, créer une nouvelle avec un ID unique
    const newRoomId = 'public-' + Date.now();
    const aiCount = parseInt(process.env.AI_COUNT || '2');
    const room = new GameRoom(newRoomId, io, llmProvider, aiCount);
    gameRooms.set(newRoomId, room);
    console.log(`Created new public room: ${newRoomId} with ${aiCount} AIs`);
    return room;
  }
  
  // Room privée avec code custom
  if (!gameRooms.has(roomId)) {
    const aiCount = parseInt(process.env.AI_COUNT || '2');
    const room = new GameRoom(roomId, io, llmProvider, aiCount);
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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: gameRooms.size,
    llmProvider: llmProvider.name,
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
🤖 LLM: ${llmProvider.name}
🎯 AI Count: ${process.env.AI_COUNT || 2}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
