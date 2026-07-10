const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');


// ==================================================
// RENDER WEB SERVER
// ==================================================

const app = express();
const WEB_PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Minecraft bot is running.');
});

app.listen(WEB_PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server listening on port ${WEB_PORT}`);
});


// ==================================================
// SETTINGS
// ==================================================

const SERVER_HOST = 'TokiCraftMC.aternos.me';
const SERVER_PORT = 11625;

const RECONNECT_DELAY = 30000;


// ==================================================
// BOT STATE
// ==================================================

let bot = null;

let movementTimer = null;
let jumpTimer = null;
let punchTimer = null;
let headTargetTimer = null;
let headLoopTimer = null;
let reconnectTimer = null;

let sessionId = 0;

let currentYaw = 0;
let currentPitch = 0;

let targetYaw = 0;
let targetPitch = 0;


// ==================================================
// START BOT
// ==================================================

function startBot() {
  sessionId++;

  const mySession = sessionId;

  console.log('');
  console.log('====================================');
  console.log('🤖 Starting Minecraft bot...');
  console.log(`🌍 ${SERVER_HOST}:${SERVER_PORT}`);
  console.log(`👤 ${config.botUsername}`);
  console.log('====================================');

  bot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: config.botUsername,
    auth: 'offline',
    viewDistance: config.botChunk
  });


  // ================================================
  // CONNECTION EVENTS
  // ================================================

  bot.on('connect', () => {
    console.log('🔌 TCP connected.');
  });

  bot.on('login', () => {
    console.log('📡 Login successful.');
  });

  bot.on('spawn', () => {
    if (mySession !== sessionId) return;

    console.log(`✅ ${config.botUsername} spawned.`);

    bot.clearControlStates();
    bot.setControlState('sneak', false);

    currentYaw = bot.entity.yaw;
    currentPitch = bot.entity.pitch;

    targetYaw = currentYaw;
    targetPitch = currentPitch;

    setTimeout(() => {
      if (
        mySession !== sessionId ||
        !bot ||
        !bot.entity
      ) {
        return;
      }

      console.log('🟢 Continuous movement systems started.');

      chooseMovement(mySession);
      scheduleJump(mySession);
      schedulePunch(mySession);
      chooseHeadTarget(mySession);
      smoothHeadLoop(mySession);

    }, 3000);
  });


  // ================================================
  // LOGGING
  // ================================================

  bot.on('kicked', reason => {
    console.log('');
    console.log('🚫 BOT KICKED:');

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

  bot.on('error', err => {
    console.log('');
    console.error('⚠️ BOT ERROR:');
    console.error(err);
  });


  // ================================================
  // RECONNECT
  // ================================================

  bot.on('end', reason => {
    if (mySession !== sessionId) return;

    console.log('');
    console.log(
      `⛔ Disconnected: ${reason || 'Unknown reason'}`
    );

    stopLoops();

    clearTimeout(reconnectTimer);

    console.log(
      `🔄 Reconnecting in ${RECONNECT_DELAY / 1000} seconds...`
    );

    reconnectTimer = setTimeout(() => {
      startBot();
    }, RECONNECT_DELAY);
  });
}


// ==================================================
// MOVEMENT SYSTEM
// ==================================================

function chooseMovement(mySession) {
  if (!isSessionActive(mySession)) return;

  /*
    Only reset directional movement here.

    Jumping is controlled independently so a movement
    change does not cancel a jump in progress.
  */

  bot.setControlState('forward', false);
  bot.setControlState('back', false);
  bot.setControlState('left', false);
  bot.setControlState('right', false);
  bot.setControlState('sprint', false);
  bot.setControlState('sneak', false);

  const roll = Math.random();


  // Forward
  if (roll < 0.22) {
    bot.setControlState('forward', true);
  }


  // Forward-left diagonal
  else if (roll < 0.40) {
    bot.setControlState('forward', true);
    bot.setControlState('left', true);
  }


  // Forward-right diagonal
  else if (roll < 0.58) {
    bot.setControlState('forward', true);
    bot.setControlState('right', true);
  }


  // Left strafe
  else if (roll < 0.68) {
    bot.setControlState('left', true);
  }


  // Right strafe
  else if (roll < 0.78) {
    bot.setControlState('right', true);
  }


  // Back-left
  else if (roll < 0.84) {
    bot.setControlState('back', true);
    bot.setControlState('left', true);
  }


  // Back-right
  else if (roll < 0.90) {
    bot.setControlState('back', true);
    bot.setControlState('right', true);
  }


  // Backward
  else if (roll < 0.94) {
    bot.setControlState('back', true);
  }


  // Remaining probability = brief pause


  /*
    Occasionally sprint during forward movement.
    This does not interrupt strafing, so forward +
    left/right + sprint can overlap.
  */

  if (
    bot.getControlState('forward') &&
    Math.random() < 0.20
  ) {
    bot.setControlState('sprint', true);
  }


  /*
    Movement lasts for a variable period.
    Longer durations prevent the bot from changing
    direction every few steps.
  */

  const duration = randomInt(1800, 6500);

  movementTimer = setTimeout(() => {
    chooseMovement(mySession);
  }, duration);
}


// ==================================================
// INDEPENDENT JUMP SYSTEM
// ==================================================

function scheduleJump(mySession) {
  if (!isSessionActive(mySession)) return;

  const delay = randomInt(2500, 10000);

  jumpTimer = setTimeout(() => {
    if (!isSessionActive(mySession)) return;

    /*
      Jump without clearing movement states.

      If the bot is moving diagonally, forward,
      sideways, or sprinting, that movement continues.
    */

    bot.setControlState('jump', true);

    const jumpLength = randomInt(250, 550);

    setTimeout(() => {
      if (!isSessionActive(mySession)) return;

      bot.setControlState('jump', false);
    }, jumpLength);

    scheduleJump(mySession);

  }, delay);
}


// ==================================================
// INDEPENDENT ARM SWING SYSTEM
// ==================================================

function schedulePunch(mySession) {
  if (!isSessionActive(mySession)) return;

  const delay = randomInt(3000, 14000);

  punchTimer = setTimeout(() => {
    if (!isSessionActive(mySession)) return;

    try {
      bot.swingArm(
        Math.random() < 0.85 ? 'right' : 'left'
      );
    } catch {
      // Ignore animation error during connection changes
    }

    /*
      Occasionally perform a second swing after
      a short delay.
    */

    if (Math.random() < 0.18) {
      setTimeout(() => {
        if (!isSessionActive(mySession)) return;

        try {
          bot.swingArm('right');
        } catch {
          // Ignore
        }
      }, randomInt(300, 900));
    }

    schedulePunch(mySession);

  }, delay);
}


// ==================================================
// HEAD TARGET SYSTEM
// ==================================================

function chooseHeadTarget(mySession) {
  if (!isSessionActive(mySession)) return;

  /*
    Pick a target relative to the current direction.

    Smaller changes are common.
    Larger turns happen occasionally.
  */

  let maxTurn;

  const turnRoll = Math.random();

  if (turnRoll < 0.65) {
    maxTurn = 35;
  } else if (turnRoll < 0.90) {
    maxTurn = 80;
  } else {
    maxTurn = 150;
  }

  const yawChange = degreesToRadians(
    randomBetween(-maxTurn, maxTurn)
  );

  targetYaw = normalizeAngle(
    currentYaw + yawChange
  );


  /*
    Pitch is chosen independently but kept inside
    a sensible range.
  */

  targetPitch = degreesToRadians(
    randomBetween(-25, 25)
  );


  /*
    Head targets change independently of movement.
  */

  const delay = randomInt(1200, 6000);

  headTargetTimer = setTimeout(() => {
    chooseHeadTarget(mySession);
  }, delay);
}


// ==================================================
// SMOOTH HEAD INTERPOLATION LOOP
// ==================================================

function smoothHeadLoop(mySession) {
  if (!isSessionActive(mySession)) return;

  const yawDifference = normalizeAngle(
    targetYaw - currentYaw
  );

  const pitchDifference =
    targetPitch - currentPitch;


  /*
    Interpolation factor varies slightly over time.

    This keeps every head turn from having exactly
    the same speed.
  */

  const smoothing = randomBetween(0.035, 0.075);

  currentYaw += yawDifference * smoothing;
  currentPitch += pitchDifference * smoothing;


  /*
    Clamp pitch to valid range.
  */

  const maxPitch = Math.PI / 2;

  currentPitch = Math.max(
    -maxPitch,
    Math.min(maxPitch, currentPitch)
  );


  try {
    const lookPromise = bot.look(
      currentYaw,
      currentPitch,
      true
    );

    if (
      lookPromise &&
      typeof lookPromise.catch === 'function'
    ) {
      lookPromise.catch(() => {});
    }

  } catch {
    // Ignore look errors during disconnect
  }


  headLoopTimer = setTimeout(() => {
    smoothHeadLoop(mySession);
  }, 50);
}


// ==================================================
// SESSION CHECK
// ==================================================

function isSessionActive(mySession) {
  return (
    mySession === sessionId &&
    bot &&
    bot.entity
  );
}


// ==================================================
// CLEANUP
// ==================================================

function stopLoops() {
  clearTimeout(movementTimer);
  clearTimeout(jumpTimer);
  clearTimeout(punchTimer);
  clearTimeout(headTargetTimer);
  clearTimeout(headLoopTimer);

  movementTimer = null;
  jumpTimer = null;
  punchTimer = null;
  headTargetTimer = null;
  headLoopTimer = null;

  if (bot) {
    try {
      bot.clearControlStates();
    } catch {
      // Ignore cleanup errors
    }
  }
}


// ==================================================
// HELPERS
// ==================================================

function randomInt(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}


function randomBetween(min, max) {
  return (
    Math.random() * (max - min) + min
  );
}


function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}


function normalizeAngle(angle) {
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }

  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }

  return angle;
}


// ==================================================
// START
// ==================================================

startBot();