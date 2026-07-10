const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');

// Render HTTP port
const app = express();
const webPort = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Minecraft bot is running');
});

app.listen(webPort, '0.0.0.0', () => {
  console.log(`🌐 Web server listening on port ${webPort}`);
});

// Minecraft bot
const bot = mineflayer.createBot({
  host: 'Ox.aternos.host',
  port: 11625,
  username: config.botUsername,
  auth: 'offline',
  version: false,
  viewDistance: config.botChunk
});

let movementPhase = 0;

const STEP_INTERVAL = 1500;
const JUMP_DURATION = 500;

bot.on('connect', () => {
  console.log('🔌 Connected to Minecraft server socket');
});

bot.on('login', () => {
  console.log('📡 Minecraft login successful');
});

bot.on('spawn', () => {
  console.log(`✅ ${config.botUsername} spawned!`);

  setTimeout(() => {
    bot.setControlState('sneak', true);
    console.log(`✅ ${config.botUsername} is Ready!`);
  }, 3000);

  setTimeout(movementCycle, STEP_INTERVAL);
});

function movementCycle() {
  if (!bot.entity) return;

  switch (movementPhase) {
    case 0:
      bot.setControlState('forward', true);
      bot.setControlState('back', false);
      bot.setControlState('jump', false);
      break;

    case 1:
      bot.setControlState('forward', false);
      bot.setControlState('back', true);
      bot.setControlState('jump', false);
      break;

    case 2:
      bot.setControlState('forward', false);
      bot.setControlState('back', false);
      bot.setControlState('jump', true);

      setTimeout(() => {
        bot.setControlState('jump', false);
      }, JUMP_DURATION);

      break;

    case 3:
      bot.setControlState('forward', false);
      bot.setControlState('back', false);
      bot.setControlState('jump', false);
      break;
  }

  movementPhase = (movementPhase + 1) % 4;
  setTimeout(movementCycle, STEP_INTERVAL);
}

bot.on('kicked', reason => {
  console.log('🚫 Kicked:', reason);
});

bot.on('error', err => {
  console.error('⚠️ Minecraft error:', err);
});

bot.on('end', reason => {
  console.log('⛔ Minecraft bot disconnected:', reason);
});