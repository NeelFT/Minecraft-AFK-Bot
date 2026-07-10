const mineflayer = require('mineflayer');
const express = require('express');
const dns = require('dns');

// ===============================
// CONFIGURATION
// ===============================

const PERMANENT_DOMAIN = 'TokiCraftMC.aternos.me';
const BOT_NAME = 'Nunya';
const MINECRAFT_VERSION = '1.21.11';

// ===============================
// RENDER KEEP-ALIVE WEB SERVER
// ===============================

const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Bot is active!');
});

app.listen(port, () => {
  console.log(`🌐 Web listener active on port ${port}`);
});

// ===============================
// BOT VARIABLES
// ===============================

let bot = null;

let targetYaw = 0;
let targetPitch = 0;
let currentYaw = 0;
let currentPitch = 0;
let behaviorTicks = 0;

let reconnectTimer = null;

// ===============================
// BOT INITIALIZATION
// ===============================

async function initBot() {
  if (bot) {
    try {
      bot.removeAllListeners();
      bot.quit();
    } catch (err) {
      // Ignore cleanup errors
    }

    bot = null;
  }

  let finalHost = PERMANENT_DOMAIN;
  let finalPort = 25565;

  console.log(`🔍 Resolving Minecraft SRV record for ${PERMANENT_DOMAIN}...`);

  try {
    const records = await dns.promises.resolveSrv(
      `_minecraft._tcp.${PERMANENT_DOMAIN}`
    );

    if (records && records.length > 0) {
      // Prefer the record with the lowest priority value
      records.sort((a, b) => a.priority - b.priority);

      finalHost = records[0].name;
      finalPort = records[0].port;

      console.log(
        `🎯 Found server node: ${finalHost}:${finalPort}`
      );
    }
  } catch (err) {
    console.log(
      `⚠️ SRV lookup failed: ${err.message}`
    );

    console.log(
      `↪ Falling back to ${finalHost}:${finalPort}`
    );
  }

  console.log(`🤖 Connecting ${BOT_NAME}...`);

  bot = mineflayer.createBot({
    host: finalHost,
    port: finalPort,
    username: BOT_NAME,
    auth: 'offline',
    version: MINECRAFT_VERSION,
    viewDistance: 1
  });

  // ===============================
  // BOT EVENTS
  // ===============================

  bot.once('login', () => {
    console.log(`📡 ${BOT_NAME} successfully logged in.`);
  });

  bot.once('spawn', () => {
    console.log(`✅ ${BOT_NAME} spawned into the world.`);

    // Sync rotation values with actual bot rotation
    currentYaw = bot.entity.yaw;
    currentPitch = bot.entity.pitch;

    targetYaw = currentYaw;
    targetPitch = currentPitch;

    behaviorTicks = 0;

    bot.on('physicsTick', continuousSmoothEngine);
  });

  bot.on('kicked', (reason) => {
    console.log('🚫 Bot was kicked:');

    try {
      console.log(
        typeof reason === 'string'
          ? reason
          : JSON.stringify(reason, null, 2)
      );
    } catch {
      console.log(reason);
    }
  });

  bot.on('error', (err) => {
    console.error(`⚠️ Network error: ${err.message}`);
  });

  bot.once('end', (reason) => {
    console.log(`⛔ Connection ended: ${reason || 'Unknown reason'}`);

    cleanupBot();

    console.log('🔄 Reconnecting in 45 seconds...');

    clearTimeout(reconnectTimer);

    reconnectTimer = setTimeout(() => {
      initBot().catch((err) => {
        console.error('Reconnect error:', err);
      });
    }, 45000);
  });
}

// ===============================
// MOVEMENT ENGINE
// ===============================

function continuousSmoothEngine() {
  if (!bot || !bot.entity) {
    return;
  }

  // Smoothly move rotation toward target rotation
  currentYaw += angleDifference(targetYaw, currentYaw) * 0.05;
  currentPitch += (targetPitch - currentPitch) * 0.05;

  // Clamp pitch to valid range
  const maxPitch = Math.PI / 2;

  currentPitch = Math.max(
    -maxPitch,
    Math.min(maxPitch, currentPitch)
  );

  bot.look(currentYaw, currentPitch, true).catch(() => {});

  if (behaviorTicks <= 0) {
    chooseNewBehavior();
  }

  behaviorTicks--;
}

// ===============================
// RANDOM MOVEMENT SELECTION
// ===============================

function chooseNewBehavior() {
  if (!bot || !bot.entity) {
    return;
  }

  // Choose a nearby direction instead of instantly selecting
  // a completely unrelated rotation.
  targetYaw =
    currentYaw +
    ((Math.random() * 120 - 60) * Math.PI / 180);

  targetPitch =
    ((Math.random() * 30 - 15) * Math.PI / 180);

  bot.clearControlStates();

  const movementStrategy = Math.random();

  if (movementStrategy < 0.35) {
    bot.setControlState('forward', true);

  } else if (movementStrategy < 0.55) {
    bot.setControlState('left', true);

  } else if (movementStrategy < 0.75) {
    bot.setControlState('right', true);

  } else if (movementStrategy < 0.85) {
    bot.setControlState('back', true);

  } else {
    // Stand still briefly
  }

  if (Math.random() > 0.8) {
    bot.setControlState('jump', true);
  }

  if (Math.random() > 0.65) {
    try {
      bot.swingArm('right');
    } catch (err) {
      // Ignore animation errors
    }
  }

  // Roughly 1.5–4 seconds at 20 physics ticks/sec
  behaviorTicks = Math.floor(Math.random() * 50) + 30;
}

// ===============================
// ANGLE WRAPPING
// ===============================

function angleDifference(target, current) {
  let difference = target - current;

  while (difference > Math.PI) {
    difference -= Math.PI * 2;
  }

  while (difference < -Math.PI) {
    difference += Math.PI * 2;
  }

  return difference;
}

// ===============================
// CLEANUP
// ===============================

function cleanupBot() {
  if (!bot) {
    return;
  }

  try {
    bot.clearControlStates();
    bot.removeAllListeners();
  } catch (err) {
    // Ignore cleanup errors
  }

  bot = null;
}

// ===============================
// START
// ===============================

initBot().catch((err) => {
  console.error('❌ Initial startup failed:', err);

  setTimeout(() => {
    initBot();
  }, 45000);
});