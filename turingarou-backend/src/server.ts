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
    origin: [
      'http://localhost:5173',
      'http://localhost:8000',
      'https://thomasbazeille.github.io',
      process.env.FRONTEND_URL || ''
    ].filter(Boolean),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:8000',
    'https://thomasbazeille.github.io',
    process.env.FRONTEND_URL || ''
  ].filter(Boolean),
  credentials: true,
}));
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
  if (!gameRooms.has(roomId)) {
    const aiCount = parseInt(process.env.AI_COUNT || '1');
    const room = new GameRoom(roomId, io, llmProvider, aiCount);
    gameRooms.set(roomId, room);
    console.log(`Created new room: ${roomId} with ${aiCount} AIs`);
  }
  return gameRooms.get(roomId)!;
}

// ====== SOCKET.IO EVENTS ======

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  let currentRoom: GameRoom | null = null;
  let playerId: string | null = null;

  // Rejoindre une room
  socket.on('joinRoom', ({ roomId, username }: { roomId: string; username: string }) => {
    console.log(`${username} joining room ${roomId}`);

    const room = getOrCreateRoom(roomId);
    const success = room.addHumanPlayer(socket.id, username);

    if (success) {
      socket.join(roomId);
      currentRoom = room;
      
      // Trouver l'ID du joueur
      const player = room.getState().players.find(
        (p) => p.type === 'human' && p.socketId === socket.id
      );
      if (player) {
        playerId = player.id;
      }

      socket.emit('joinSuccess', { playerId });
      console.log(`${username} joined successfully`);
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

  // Déconnexion
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
    }
  });
});

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
