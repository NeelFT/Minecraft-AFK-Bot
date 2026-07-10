const mineflayer = require('mineflayer');
const express = require('express');
const dns = require('dns').promises; // Built-in node system to look up hidden ports

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
