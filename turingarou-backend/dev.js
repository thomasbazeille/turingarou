#!/usr/bin/env node

/**
 * Script de développement pour Turingarou Backend
 * Lance le serveur avec auto-reload et des joueurs de test
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║      🎮 TURINGAROU - DEVELOPMENT MODE 🎮             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝

Starting backend server...
`);

// Lancer le serveur avec tsx watch
const server = spawn('npm', ['run', 'dev'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

server.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code || 0);
});

// Gérer Ctrl+C
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  server.kill('SIGINT');
  process.exit(0);
});
