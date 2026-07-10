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
      bot.setControlState('sneak', false); // Forces the bot to stand tall
      console.log(`✅ ${config.botUsername} has logged into the world!`);
      
      // Hook into Minecraft's internal physics engine (Runs 20 times per second)
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
  if (!bot || !bot.entity) return;

  // --- PART A: CONSTANT & SMOOTH CAMERA ROTATION ---
  // Slowly interpolate current camera angles toward the target angles (0.05 step weight)
  currentYaw += (targetYaw - currentYaw) * 0.05;
  currentPitch += (targetPitch - currentPitch) * 0.05;
  bot.look(currentYaw, currentPitch, true);

  // --- PART B: RANDOM DIRECTION DECISIONS ---
  // Every 40 game ticks (roughly 2 seconds), seamlessly morph the goals
  if (behaviorTicks <= 0) {
    // Pick a brand new random direction vector (0 to 360 degrees)
    targetYaw = (Math.random() * 360) * (Math.PI / 180);
    targetPitch = ((Math.random() * 30) - 15) * (Math.PI / 180); // Natural horizon drift

    // Wipe previous movement keys
    bot.clearControlStates();
    bot.setControlState('sneak', false);

    // Roll dice for constant constant movement styles
    const movementStrategy = Math.random();
    if (movementStrategy < 0.4) {
      // Strategy 1: Constant forward pathing
      bot.setControlState('forward', true);
    } else if (movementStrategy < 0.7) {
      // Strategy 2: Constant smooth strafe (sideways drift)
      const side = Math.random() > 0.5 ? 'left' : 'right';
      bot.setControlState(side, true);
    } else {
      // Strategy 3: Smooth backward backing away
      bot.setControlState('back', true);
    }

    // Small random chance to trigger a jump mid-movement frame
    if (Math.random() > 0.75) {
      bot.setControlState('jump', true);
    }

    // Unpredictable arm swinging
    if (Math.random() > 0.5) {
      bot.swingArm('right');
    }

    // Set how long the bot maintains this precise smooth path (between 1.5 to 4 seconds)
    behaviorTicks = Math.floor(Math.random() * 50) + 30;
  }

  // Count down game ticks
  behaviorTicks--;
}

initBot();
