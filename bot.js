const mineflayer = require('mineflayer');
const config = require('./config.json');
const express = require('express');

// 1. Render Keep-Alive Web Server
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(port, () => console.log(`Web Listener active on port ${port}`));

let bot;
let targetYaw = 0;
let targetPitch = 0;
let currentYaw = 0;
let currentPitch = 0;
let behaviorTicks = 0;

function initBot() {
  console.log(`Connecting to server: ${config.serverHost}:${config.serverPort}...`);
  
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
      if (!bot) return;
      bot.setControlState('sneak', false); 
      console.log(`✅ ${config.botUsername} has logged into the world!`);
      bot.on('physicsTick', continuousSmoothEngine);
    }, 3000);
  });

  // 2. TIMEOUT PROTECTION: Safely catch network connection bugs
  bot.on('error', (err) => {
    console.error('⚠️ Network Error Detected:', err.message);
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.log('Server appears to be offline. Retrying in 45 seconds...');
    }
  });

  // 3. Keep-Alive Restart Loop
  bot.on('end', () => {
    console.log('⛔️ Connection closed. Re-establishing link profile in 45 seconds...');
    
    // Completely wipe old instance maps before re-initializing
    if (bot) {
      bot.removeAllListeners();
      bot = null;
    }
    
    // Safely attempt a clean fresh reconnection route
    setTimeout(initBot, 45000); 
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
