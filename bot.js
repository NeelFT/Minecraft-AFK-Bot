const mineflayer = require('mineflayer');
const config = require('./config.json');

let bot = null;
let movementPhase = 0;
let movementTimer = null;
let reconnectTimer = null;

const STEP_INTERVAL = 1500;
const JUMP_DURATION = 500;

function createBot() {
  console.log('=================================');
  console.log('🤖 Starting bot...');
  console.log(`Host: ${config.serverHost}`);
  console.log(`Port: ${config.serverPort}`);
  console.log(`Username: ${config.botUsername}`);
  console.log('=================================');

  bot = mineflayer.createBot({
    host: config.serverHost,
    port: Number(config.serverPort),
    username: config.botUsername,
    auth: 'offline',
    viewDistance: config.botChunk
  });

  bot.on('connect', () => {
    console.log('🔌 TCP connection established.');
  });

  bot.on('login', () => {
    console.log('📡 Login packet accepted.');
  });

  bot.on('spawn', () => {
    console.log(`✅ ${config.botUsername} spawned successfully!`);

    movementPhase = 0;

    setTimeout(() => {
      if (!bot || !bot.entity) return;

      bot.setControlState('sneak', true);

      console.log(`🟢 ${config.botUsername} is ready!`);

      clearTimeout(movementTimer);
      movementTimer = setTimeout(
        movementCycle,
        STEP_INTERVAL
      );

    }, 3000);
  });

  bot.on('kicked', (reason) => {
    console.log('🚫 BOT KICKED:');

    try {
      console.log(JSON.stringify(reason, null, 2));
    } catch {
      console.log(reason);
    }
  });

  bot.on('error', (err) => {
    console.error('⚠️ ERROR:');
    console.error(err);
  });

  bot.on('end', (reason) => {
    console.log(`⛔ Bot disconnected: ${reason || 'Unknown reason'}`);

    clearTimeout(movementTimer);
    clearTimeout(reconnectTimer);

    movementTimer = null;

    reconnectTimer = setTimeout(() => {
      console.log('🔄 Attempting reconnection...');
      createBot();
    }, 30000);
  });
}

function movementCycle() {
  if (!bot || !bot.entity) {
    console.log('⚠️ Movement skipped: bot not spawned.');
    return;
  }

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
        if (bot && bot.entity) {
          bot.setControlState('jump', false);
        }
      }, JUMP_DURATION);

      break;

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

createBot();