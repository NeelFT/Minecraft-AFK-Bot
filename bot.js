const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');

// ==========================================
// RENDER WEB SERVER
// ==========================================

const app = express();
const WEB_PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Minecraft AFK bot is running.');
});

app.listen(WEB_PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server listening on port ${WEB_PORT}`);
});


// ==========================================
// SETTINGS
// ==========================================

const SERVER_HOST = 'TokiCraftMC.aternos.me';
const SERVER_PORT = 11625;

const STEP_INTERVAL = 1500;
const JUMP_DURATION = 500;
const RECONNECT_DELAY = 30000;


// ==========================================
// BOT VARIABLES
// ==========================================

let bot = null;
let movementPhase = 0;
let movementTimer = null;
let reconnectTimer = null;


// ==========================================
// CREATE BOT
// ==========================================

function startBot() {
  console.log('');
  console.log('====================================');
  console.log('🤖 Starting Minecraft bot...');
  console.log(`🌍 Server: ${SERVER_HOST}:${SERVER_PORT}`);
  console.log(`👤 Username: ${config.botUsername}`);
  console.log('====================================');

  bot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: config.botUsername,
    auth: 'offline',

    // Let Mineflayer detect the Minecraft version.
    viewDistance: config.botChunk
  });


  // ========================================
  // CONNECTION EVENTS
  // ========================================

  bot.on('connect', () => {
    console.log('🔌 TCP connection established.');
  });

  bot.on('login', () => {
    console.log('📡 Minecraft login successful.');
  });

  bot.on('spawn', () => {
    console.log(`✅ ${config.botUsername} spawned successfully!`);

    movementPhase = 0;

    setTimeout(() => {
      if (!bot || !bot.entity) {
        return;
      }

      bot.setControlState('sneak', true);

      console.log(`🟢 ${config.botUsername} is ready and moving.`);

      clearTimeout(movementTimer);

      movementTimer = setTimeout(
        movementCycle,
        STEP_INTERVAL
      );

    }, 3000);
  });


  // ========================================
  // KICK LOGGING
  // ========================================

  bot.on('kicked', (reason) => {
    console.log('');
    console.log('🚫 BOT WAS KICKED');

    try {
      console.log(
        typeof reason === 'string'
          ? reason
          : JSON.stringify(reason, null, 2)
      );
    } catch (error) {
      console.log(reason);
    }
  });


  // ========================================
  // ERROR LOGGING
  // ========================================

  bot.on('error', (err) => {
    console.log('');
    console.error('⚠️ MINECRAFT CONNECTION ERROR');
    console.error(err);
  });


  // ========================================
  // DISCONNECT + RECONNECT
  // ========================================

  bot.on('end', (reason) => {
    console.log('');
    console.log(
      `⛔ Bot disconnected: ${reason || 'Unknown reason'}`
    );

    clearTimeout(movementTimer);
    clearTimeout(reconnectTimer);

    movementTimer = null;

    reconnectTimer = setTimeout(() => {
      console.log('🔄 Reconnecting...');
      startBot();
    }, RECONNECT_DELAY);
  });
}


// ==========================================
// MOVEMENT CYCLE
// ==========================================

function movementCycle() {
  if (!bot || !bot.entity) {
    console.log('⚠️ Movement stopped because bot is not spawned.');
    return;
  }

  switch (movementPhase) {

    // Walk forward
    case 0:
      bot.setControlState('forward', true);
      bot.setControlState('back', false);
      bot.setControlState('jump', false);
      break;


    // Walk backward
    case 1:
      bot.setControlState('forward', false);
      bot.setControlState('back', true);
      bot.setControlState('jump', false);
      break;


    // Jump
    case 2:
      bot.setControlState('forward', false);
      bot.setControlState('back', false);
      bot.setControlState('jump', true);

      setTimeout(() => {
        if (bot && bot.entity) {
          bot.setControlState('jump', false);
        }
      }, JUMP_DURATION);

      break;


    // Stand still
    case 3:
      bot.setControlState('forward', false);
      bot.setControlState('back', false);
      bot.setControlState('jump', false);
      break;
  }


  movementPhase = (movementPhase + 1) % 4;


  movementTimer = setTimeout(
    movementCycle,
    STEP_INTERVAL
  );
}


// ==========================================
// START BOT
// ==========================================

startBot();