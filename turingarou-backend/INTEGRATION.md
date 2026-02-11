# Guide d'intégration Frontend ↔ Backend

## Installation côté frontend

```bash
npm install socket.io-client
```

## Hook React pour Socket.io

Créer `src/hooks/useGameSocket.ts` :

```typescript
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface GameState {
  roomId: string;
  phase: 'waiting' | 'question' | 'discussion' | 'voting' | 'endround';
  currentRound: number;
  players: Player[];
  messages: GameMessage[];
  currentQuestion: string | null;
  answers: QuestionAnswer[];
  votes: Vote[];
  protectedPlayerId: string | null;
  discussionEndTime: number | null;
  maxPlayers: number;
}

export function useGameSocket(serverUrl: string, roomId: string, username: string) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Connexion au serveur
    const socket = io(serverUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      
      // Rejoindre la room
      socket.emit('joinRoom', { roomId, username });
    });

    socket.on('joinSuccess', ({ playerId: id }) => {
      console.log('Joined successfully:', id);
      setPlayerId(id);
    });

    socket.on('joinError', ({ message }) => {
      console.error('Join error:', message);
    });

    socket.on('gameState', (state: GameState) => {
      setGameState(state);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected');
      setConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [serverUrl, roomId, username]);

  const sendMessage = (message: string) => {
    socketRef.current?.emit('sendMessage', { message });
  };

  const answerQuestion = (answer: string) => {
    socketRef.current?.emit('answerQuestion', { answer });
  };

  const vote = (targetId: string) => {
    socketRef.current?.emit('vote', { targetId });
  };

  return {
    gameState,
    playerId,
    connected,
    sendMessage,
    answerQuestion,
    vote,
  };
}
```

## Modification de App.tsx

```typescript
import { useGameSocket } from './hooks/useGameSocket';

export default function App() {
  const [username, setUsername] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  
  const {
    gameState,
    playerId,
    connected,
    sendMessage,
    answerQuestion,
    vote,
  } = useGameSocket(
    'http://localhost:3001',
    'default-room',
    username
  );

  // Attendre que l'utilisateur entre son nom
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-900 flex items-center justify-center">
        <div className="bg-zinc-900/80 p-8 rounded-2xl border border-amber-900/30">
          <h1 className="text-3xl font-bold text-amber-100 mb-6">Join Game</h1>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full px-4 py-3 bg-zinc-800 border border-amber-900/40 rounded-lg text-amber-100 mb-4"
          />
          <button
            onClick={() => username && setHasJoined(true)}
            disabled={!username}
            className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 text-white font-bold rounded-lg"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  // Afficher l'état de connexion
  if (!connected || !gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-900 flex items-center justify-center">
        <div className="text-amber-100 text-xl">
          Connecting to server...
        </div>
      </div>
    );
  }

  // Rendre le bon écran selon la phase du jeu
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-900">
      {gameState.phase === 'waiting' && (
        <WaitingRoom 
          players={gameState.players}
          maxPlayers={gameState.maxPlayers}
        />
      )}
      
      {gameState.phase === 'question' && (
        <QuestionScreen
          question={gameState.currentQuestion}
          players={gameState.players}
          answers={gameState.answers}
          onSubmit={answerQuestion}
        />
      )}
      
      {gameState.phase === 'discussion' && (
        <GameScreen
          messages={gameState.messages}
          players={gameState.players}
          playerId={playerId}
          discussionEndTime={gameState.discussionEndTime}
          onSendMessage={sendMessage}
        />
      )}
      
      {gameState.phase === 'voting' && (
        <VotingScreen
          players={gameState.players}
          playerId={playerId}
          votes={gameState.votes}
          onVote={vote}
        />
      )}
      
      {gameState.phase === 'endround' && (
        <EndOfRoundScreen
          protectedPlayer={gameState.players.find(p => p.id === gameState.protectedPlayerId)}
          eliminatedPlayer={gameState.players.find(p => p.isEliminated)}
          currentRound={gameState.currentRound}
        />
      )}
    </div>
  );
}
```

## Modification de GameScreen.tsx

Ajouter le chat avec le backend :

```typescript
interface GameScreenProps {
  messages: GameMessage[];
  players: Player[];
  playerId: string;
  discussionEndTime: number;
  onSendMessage: (message: string) => void;
}

export function GameScreen({ 
  messages, 
  players, 
  playerId, 
  discussionEndTime,
  onSendMessage 
}: GameScreenProps) {
  const [inputMessage, setInputMessage] = useState('');

  const handleSendMessage = () => {
    if (inputMessage.trim()) {
      onSendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const timeRemaining = Math.max(0, discussionEndTime - Date.now());

  return (
    <div className="min-h-screen p-8">
      {/* Timer */}
      <div className="text-center mb-4">
        <div className="text-4xl font-bold text-cyan-400">
          {Math.floor(timeRemaining / 1000)}s
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-4xl mx-auto bg-zinc-900/80 rounded-lg p-4 mb-4 h-96 overflow-y-auto">
        {messages.map((msg) => {
          const player = players.find(p => p.id === msg.playerId);
          const isOwnMessage = msg.playerId === playerId;

          return (
            <div 
              key={msg.id} 
              className={`mb-3 flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-xs ${isOwnMessage ? 'bg-cyan-900/50' : 'bg-zinc-800/50'} rounded-lg p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: player?.color }}
                  >
                    {player?.username.charAt(0)}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: player?.color }}>
                    {player?.username}
                  </span>
                </div>
                <div className="text-white text-sm">{msg.content}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="max-w-4xl mx-auto flex gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Type your message..."
          className="flex-1 px-4 py-3 bg-zinc-800 border border-white/10 rounded-lg text-white"
        />
        <button
          onClick={handleSendMessage}
          className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

## Variables d'environnement

Créer `.env` dans le frontend :

```env
VITE_BACKEND_URL=http://localhost:3001
```

Utiliser dans le code :
```typescript
const serverUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
```

## Démarrage

1. **Backend** :
```bash
cd turingarou-backend
npm run dev
```

2. **Frontend** :
```bash
cd turingarou-v2
npm run dev
```

Le jeu sera accessible sur `http://localhost:5173`
