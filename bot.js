const mineflayer = require('mineflayer');
const config = require('./config.json');
const express = require('express'); // Added for Render web satisfaction

// 1. Render Keep-Alive Web Server (Fixes the "No open port detected" crash)
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is active!'));
app.listen(port, () => console.log(`Web Listener active on port ${port}`));

let bot;
let movementPhase = 0;
const STEP_INTERVAL = 1500;
const JUMP_DURATION = 500;

// Wrap bot creation in a function to allow automatic restarts
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
      console.log(`✅ ${config.botUsername} is Ready!`);
    }, 3000);

    setTimeout(movementCycle, STEP_INTERVAL);
  });

  bot.on('error', (err) => {
    console.error('⚠️ Error:', err);
  });

  // 2. Automatic Reconnect Logic
  bot.on('end', () => {
    console.log('⛔️ Bot Disconnected! Retrying connection in 30 seconds...');
    // Clear any active movement states
    movementPhase = 0;
    // Tell Render to safely reboot the container to establish a fresh connection
    setTimeout(() => {
      process.exit(1); 
    }, 30000);
  });
}

function movementCycle() {
  // Added basic safety check to prevent crashing if the bot disconnects mid-cycle
  if (!bot || !bot.entity) return; 

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
        if (bot && bot.entity) bot.setControlState('jump', false);
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

// Fire up the bot initial connection
initBot();
