const mineflayer = require('mineflayer');
const express = require('express');
const dns = require('dns').const mineflayer = require('mineflayer');
const config = require('./config.json');
const express = require('express');

// 1. Render Keep-Alive Web Server
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(port, () => console.log(`Web Listener active on port ${port}`));

let bot;

function initBot() {
  console.log(`Attempting to connect ${config.botUsername}...`);
  
  bot = mineflayer.createBot({
    host: config.serverHost,
    port: config.serverPort,
    username: config.botUsername,
    auth: 'offline',
    version: "1.21.11",
    viewDistance: config.botChunk
  });

  bot.on('spawn', () => {
    setTimeout(() => {
      bot.setControlState('sneak', true);
      console.log(`✅ ${config.botUsername} has logged into the world!`);
      // Start the unpredictable human simulation loop
      humanBehaviorLoop();
    }, 3000);
  });

  bot.on('error', (err) => console.error('⚠️ Error:', err));

  bot.on('end', () => {
    console.log('⛔️ Bot Disconnected! Triggering server restart script in 30 seconds...');
    setTimeout(() => process.exit(1), 30000);
  });
}

// 2. Human Behavior Emulation Engine
function humanBehaviorLoop() {
  if (!bot || !bot.entity) return;

  const choice = Math.random();

  // Reset all prior movement states before generating a new one
  bot.clearControlStates();
  bot.setControlState('sneak', true); // Keep sneaking to muffle footstep checks

  if (choice < 0.25) {
    // Action A: Take a few steps forward
    bot.setControlState('forward', true);
    setTimeout(() => bot.setControlState('forward', false), Math.floor(Math.random() * 800) + 200);

  } else if (choice < 0.50) {
    // Action B: Randomly jump or strafe sideways
    const side = Math.random() > 0.5 ? 'left' : 'right';
    bot.setControlState(side, true);
    if (Math.random() > 0.6) bot.setControlState('jump', true);
    
    setTimeout(() => {
      bot.clearControlStates();
      bot.setControlState('sneak', true);
    }, Math.floor(Math.random() * 600) + 200);

  } else if (choice < 0.75) {
    // Action C: Turn head around naturally (Crucial for bypass)
    const yaw = (Math.random() * 360) * (Math.PI / 180);
    const pitch = ((Math.random() * 40) - 20) * (Math.PI / 180);
    bot.look(yaw, pitch, true);

  } else {
    // Action D: Swing hand arms naturally
    bot.swingArm('right');
  }

  // Generate completely random wait intervals between 2 to 7 seconds
  const nextInterval = Math.floor(Math.random() * 5000) + 2000;
  setTimeout(humanBehaviorLoop, nextInterval);
}

initBot();
; // Built-in node system to look up hidden ports

// 1. Render Keep-Alive Web Server
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(port, () => console.log(`Web Listener active on port ${port}`));

let bot;
let targetYaw = 0, targetPitch = 0, currentYaw = 0, currentPitch = 0, behaviorTicks = 0;

// THE PERMANENT DOMAIN NAME
const PERMANENT_DOMAIN = 'TokiCraftMC.aternos.me';
const BOT_NAME = 'Nunya';

async function initBot() {
  let finalHost = PERMANENT_DOMAIN;
  let finalPort = 25565; // Default fallback port

  console.log(`🔍 Resolving hidden Aternos network ports for ${PERMANENT_DOMAIN}...`);

  try {
    // Automatically looks up the background tracking system (SRV record) just like standard Minecraft does
    const records = await dns.resolveSrv('_minecraft._tcp.' + PERMANENT_DOMAIN);
    if (records && records.length > 0) {
      finalHost = records[0].name;
      finalPort = records[0].port;
      console.log(`🎯 Found active node! Host: ${finalHost} | Port: ${finalPort}`);
    }
  } catch (err) {
    console.log('⚠️ SRV Lookup failed (Server might be sleeping). Falling back to basic domain entries...');
  }

  // Build the bot using the automatically discovered live numbers
  bot = mineflayer.createBot({
    host: finalHost,
    port: finalPort,
    username: BOT_NAME,
    auth: 'offline',
    version: "1.21.11",
    viewDistance: 1
  });

  bot.on('login', () => {
    console.log(`📡 Handshake successful! ${BOT_NAME} cleared the proxy proxy.`);
  });

  bot.on('spawn', () => {
    setTimeout(() => {
      if (!bot) return;
      bot.setControlState('sneak', false); 
      console.log(`✅ ${BOT_NAME} has spawned into the world layout!`);
      bot.on('physicsTick', continuousSmoothEngine);
    }, 3000);
  });

  bot.on('error', (err) => {
    console.error('⚠️ Network Error:', err.message);
  });

  bot.on('end', () => {
    console.log('⛔️ Connection dropped. Running fresh network discovery scan in 45 seconds...');
    if (bot) {
      bot.removeAllListeners();
      bot = null;
    }
    setTimeout(initBot, 45000); // Tries again, reading the brand new port if it changed!
  });
}

function continuousSmoothEngine() {
  if (!bot || !bot.entity) return;

  currentYaw += (targetYaw - currentYaw) * 0.05;
  currentPitch += (targetPitch - currentPitch) * 0.05;
  
  if (typeof bot.look === 'function') {
    bot.look(currentYaw, currentPitch, true);
  }

  if (behaviorTicks <= 0) {
    targetYaw = (Math.random() * 360) * (Math.PI / 180);
    targetPitch = ((Math.random() * 30) - 15) * (Math.PI / 180); 

    bot.clearControlStates();
    bot.setControlState('sneak', false);

    const movementStrategy = Math.random();
    if (movementStrategy < 0.4) {
      bot.setControlState('forward', true);
    } else if (movementStrategy < 0.7) {
      const side = Math.random() > 0.5 ? 'left' : 'right';
      bot.setControlState(side, true);
    } else {
      bot.setControlState('back', true);
    }

    if (Math.random() > 0.75) {
      bot.setControlState('jump', true);
    }

    if (Math.random() > 0.5 && typeof bot.swingArm === 'function') {
      bot.swingArm('right');
    }

    behaviorTicks = Math.floor(Math.random() * 50) + 30;
  }

  behaviorTicks--;
}

initBot();
