const mineflayer = require('mineflayer');
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
      bot.setControlState('sneak', false);
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
  bot.setControlState('sneak', false); // Keep sneaking to muffle footstep checks

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
