#!/usr/bin/env node

/**
 * Script de test pour vérifier la connexion à 2 joueurs
 * Usage: node test-connection.js [backend-url]
 */

const io = require('socket.io-client');

const BACKEND_URL = process.argv[2] || 'http://localhost:3001';
const ROOM_ID = 'test-room-' + Date.now();

console.log('🧪 Test de connexion TURINGAROU');
console.log('================================');
console.log(`Backend: ${BACKEND_URL}`);
console.log(`Room ID: ${ROOM_ID}\n`);

let player1Connected = false;
let player2Connected = false;
let gameStarted = false;

// Joueur 1
console.log('👤 Connexion Joueur 1...');
const socket1 = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  reconnection: false,
});

socket1.on('connect', () => {
  console.log('✅ Joueur 1 connecté');
  player1Connected = true;
  
  socket1.emit('joinRoom', {
    roomId: ROOM_ID,
    username: 'TestPlayer1'
  });
});

socket1.on('joinSuccess', ({ playerId }) => {
  console.log(`✅ Joueur 1 rejoint la room (ID: ${playerId})`);
});

socket1.on('gameState', (state) => {
  console.log(`\n📊 Game State Update - Phase: ${state.phase}`);
  console.log(`   Joueurs: ${state.players.length}/${state.maxPlayers}`);
  
  state.players.forEach(p => {
    const type = p.type === 'ai' ? '🤖' : '👤';
    console.log(`   ${type} ${p.username} (${p.colorName})`);
  });
  
  if (state.phase === 'question' && !gameStarted) {
    gameStarted = true;
    console.log('\n🎮 JEU DÉMARRÉ !');
    console.log(`   Question: ${state.currentQuestion}`);
    console.log(`\n✅ TEST RÉUSSI - 2 joueurs humains + 1 IA`);
    
    // Nettoyer après 2 secondes
    setTimeout(() => {
      console.log('\n🧹 Fermeture des connexions...');
      socket1.disconnect();
      socket2.disconnect();
      process.exit(0);
    }, 2000);
  }
});

socket1.on('connect_error', (error) => {
  console.error('❌ Erreur de connexion Joueur 1:', error.message);
  process.exit(1);
});

// Attendre 2 secondes avant de connecter le joueur 2
setTimeout(() => {
  console.log('\n👤 Connexion Joueur 2...');
  
  const socket2 = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnection: false,
  });
  
  socket2.on('connect', () => {
    console.log('✅ Joueur 2 connecté');
    player2Connected = true;
    
    socket2.emit('joinRoom', {
      roomId: ROOM_ID,
      username: 'TestPlayer2'
    });
  });
  
  socket2.on('joinSuccess', ({ playerId }) => {
    console.log(`✅ Joueur 2 rejoint la room (ID: ${playerId})`);
    console.log('\n⏳ Attente du démarrage automatique...');
  });
  
  socket2.on('connect_error', (error) => {
    console.error('❌ Erreur de connexion Joueur 2:', error.message);
    socket1.disconnect();
    process.exit(1);
  });
  
  // Timeout si le jeu ne démarre pas
  setTimeout(() => {
    if (!gameStarted) {
      console.error('\n❌ ÉCHEC - Le jeu n\'a pas démarré après 10 secondes');
      console.error('   Vérifiez la configuration backend (maxPlayers, aiCount)');
      socket1.disconnect();
      socket2.disconnect();
      process.exit(1);
    }
  }, 10000);
  
}, 2000);

// Timeout global
setTimeout(() => {
  if (!gameStarted) {
    console.error('\n⏱️  Timeout global (15s)');
    process.exit(1);
  }
}, 15000);
