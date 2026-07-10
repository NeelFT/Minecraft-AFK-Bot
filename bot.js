const mineflayer = require('mineflayer');
const config = require('./config.json');
const express = require('express');

// 1. Render Keep-Alive Web Server
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(port, () => console.log(`Web Listener active on port ${port}`));

let bot;

// Behavior state tracking variables
let targetYaw = 0;
let targetPitch = 0;
let currentYaw = 0;
let currentPitch = 0;
let behaviorTicks = 0;

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
      if (!bot) return;
      bot.setControlState('sneak', false); // Forces the bot to stand tall
      console.log(`✅ ${config.botUsername} has logged into the world!`);
      
      // Hook into Minecraft's internal physics engine safely
      bot.on('physicsTick', continuousSmoothEngine);
    }, 3000);
  });

  bot.on('error', (err) => console.error('⚠️ Error:', err));

  bot.on('end', () => {
    console.log('⛔️ Bot Disconnected! Triggering server restart script in 30 seconds...');
    setTimeout(() => process.exit(1), 30000);
  });
}

// 2. High-Frequency Smooth Movement Engine
function continuousSmoothEngine() {
  // CRITICAL PROTECTION: Stop the function if the bot or player entity is missing from the world map
  if (!bot || !bot.entity) return;

  // --- PART A: CONSTANT & SMOOTH CAMERA ROTATION ---
  currentYaw += (targetYaw - currentYaw) * 0.05;
  currentPitch += (targetPitch - currentPitch) * 0.05;
  
  // Safe execution checker for head orientation
  if (typeof bot.look === 'function') {
    bot.look(currentYaw, currentPitch, true);
  }

  // --- PART B: RANDOM DIRECTION DECISIONS ---
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
