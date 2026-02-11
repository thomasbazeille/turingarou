// Test client pour vérifier la connexion Socket.io
// Usage: node test-client.js

import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

const username = `TestPlayer${Math.floor(Math.random() * 1000)}`;
const roomId = 'test-room';

socket.on('connect', () => {
  console.log('✅ Connected to server');
  console.log(`📝 Joining as: ${username}`);
  
  socket.emit('joinRoom', { roomId, username });
});

socket.on('joinSuccess', ({ playerId }) => {
  console.log(`✅ Joined successfully! Player ID: ${playerId}`);
});

socket.on('joinError', ({ message }) => {
  console.error(`❌ Join failed: ${message}`);
});

socket.on('gameState', (state) => {
  console.log('\n📊 Game State Update:');
  console.log(`   Phase: ${state.phase}`);
  console.log(`   Round: ${state.currentRound}`);
  console.log(`   Players: ${state.players.length}/${state.maxPlayers}`);
  
  if (state.currentQuestion) {
    console.log(`   Question: ${state.currentQuestion}`);
  }
  
  if (state.messages.length > 0) {
    console.log(`   Messages: ${state.messages.length}`);
    const lastMsg = state.messages[state.messages.length - 1];
    console.log(`   Last: [${lastMsg.playerName}] ${lastMsg.content}`);
  }
  
  console.log('');
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

// Commandes interactives
process.stdin.on('data', (data) => {
  const input = data.toString().trim();
  
  if (input.startsWith('/answer ')) {
    const answer = input.replace('/answer ', '');
    socket.emit('answerQuestion', { answer });
    console.log(`Sent answer: ${answer}`);
  } else if (input.startsWith('/vote ')) {
    const targetId = input.replace('/vote ', '');
    socket.emit('vote', { targetId });
    console.log(`Voted for: ${targetId}`);
  } else if (input === '/help') {
    console.log(`
Commands:
  /answer <text>  - Answer the current question
  /vote <id>      - Vote for a player
  /help           - Show this help
  <text>          - Send a message
    `);
  } else {
    socket.emit('sendMessage', { message: input });
    console.log(`Sent message: ${input}`);
  }
});

console.log(`
🎮 Turingarou Test Client
━━━━━━━━━━━━━━━━━━━━━━━
Type /help for commands
Type messages to chat
━━━━━━━━━━━━━━━━━━━━━━━
`);
