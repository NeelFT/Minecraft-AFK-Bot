const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');


// ==================================================
// SETTINGS
// ==================================================

const SERVER_HOST = 'balashark.aternos.host';
const SERVER_PORT = 11625;

const WEB_PORT = process.env.PORT || 10000;
const RECONNECT_DELAY = 30000;


// ==================================================
// BOT STATE
// ==================================================

let bot = null;

let botStatus = 'Starting';
let lastError = 'None';
let lastDisconnectReason = 'None';
let lastKickReason = 'None';
let connectedSince = null;

let sessionId = 0;

let movementTimer = null;
let jumpTimer = null;
let punchTimer = null;
let headTargetTimer = null;
let headLoopTimer = null;
let reconnectTimer = null;

let currentYaw = 0;
let currentPitch = 0;

let targetYaw = 0;
let targetPitch = 0;


// ==================================================
// EXPRESS WEB SERVER
// ==================================================

const app = express();


app.get('/', (req, res) => {

  const uptime = connectedSince
    ? formatDuration(Date.now() - connectedSince)
    : 'Not connected';

  res.status(200).send(`
    <!DOCTYPE html>

    <html>

    <head>

      <meta charset="UTF-8">

      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
      >

      <title>Nunya Bot Status</title>

      <style>

        body {
          background: #111;
          color: #eee;
          font-family: Arial, sans-serif;
          padding: 30px;
          line-height: 1.6;
        }

        .card {
          max-width: 600px;
          margin: auto;
          background: #1e1e1e;
          padding: 25px;
          border-radius: 15px;
        }

        h1 {
          margin-top: 0;
        }

        .status {
          font-size: 22px;
          font-weight: bold;
        }

        .item {
          margin-top: 12px;
          word-break: break-word;
        }

      </style>

    </head>


    <body>

      <div class="card">

        <h1>🤖 Nunya Bot Status</h1>

        <div class="status">
          Status: ${escapeHtml(botStatus)}
        </div>

        <div class="item">
          🌍 Server:
          ${escapeHtml(SERVER_HOST)}:${SERVER_PORT}
        </div>

        <div class="item">
          👤 Username:
          ${escapeHtml(config.botUsername)}
        </div>

        <div class="item">
          ⏱ Connected uptime:
          ${escapeHtml(uptime)}
        </div>

        <div class="item">
          ⚠️ Last error:
          ${escapeHtml(lastError)}
        </div>

        <div class="item">
          🚫 Last kick:
          ${escapeHtml(lastKickReason)}
        </div>

        <div class="item">
          🔌 Last disconnect:
          ${escapeHtml(lastDisconnectReason)}
        </div>

      </div>

    </body>

    </html>
  `);
});


app.get('/health', (req, res) => {

  res.status(200).json({

    webServer: 'online',

    minecraftBot: botStatus,

    server: `${SERVER_HOST}:${SERVER_PORT}`,

    username: config.botUsername,

    connected:
      botStatus === 'Spawned and active',

    lastError,

    lastKickReason,

    lastDisconnectReason

  });

});


app.listen(
  WEB_PORT,
  '0.0.0.0',
  () => {

    console.log(
      `🌐 Web server listening on port ${WEB_PORT}`
    );

  }
);


// ==================================================
// START MINECRAFT BOT
// ==================================================

function startBot() {

  sessionId++;

  const mySession = sessionId;

  botStatus = 'Connecting';

  console.log('');
  console.log('======================================');
  console.log('🤖 Starting Minecraft bot');
  console.log(`🌍 ${SERVER_HOST}:${SERVER_PORT}`);
  console.log(`👤 ${config.botUsername}`);
  console.log('======================================');


  try {

    bot = mineflayer.createBot({

      host: SERVER_HOST,

      port: SERVER_PORT,

      username: config.botUsername,

      auth: 'offline',

      viewDistance: config.botChunk

    });

  } catch (error) {

    botStatus = 'Startup error';

    lastError =
      error.message || String(error);

    console.error(
      '❌ Bot creation failed:',
      error
    );

    scheduleReconnect();

    return;
  }


  // ================================================
  // TCP CONNECTION
  // ================================================

  bot.on('connect', () => {

    if (mySession !== sessionId) return;

    botStatus = 'TCP connected';

    console.log(
      '🔌 TCP connection established.'
    );

  });


  // ================================================
  // LOGIN
  // ================================================

  bot.on('login', () => {

    if (mySession !== sessionId) return;

    botStatus = 'Logged in, waiting for spawn';

    console.log(
      '📡 Minecraft login successful.'
    );

  });


  // ================================================
  // SPAWN
  // ================================================

  bot.on('spawn', () => {

    if (mySession !== sessionId) return;

    botStatus = 'Spawned and active';

    connectedSince = Date.now();

    console.log(
      `✅ ${config.botUsername} spawned successfully.`
    );


    bot.clearControlStates();

    bot.setControlState(
      'sneak',
      false
    );


    currentYaw =
      bot.entity.yaw;

    currentPitch =
      bot.entity.pitch;

    targetYaw =
      currentYaw;

    targetPitch =
      currentPitch;


    setTimeout(() => {

      if (!isSessionActive(mySession)) {
        return;
      }

      console.log(
        '🟢 Movement systems started.'
      );

      chooseMovement(mySession);

      scheduleJump(mySession);

      schedulePunch(mySession);

      chooseHeadTarget(mySession);

      smoothHeadLoop(mySession);

    }, 3000);

  });


  // ================================================
  // KICK EVENT
  // ================================================

  bot.on('kicked', reason => {

    if (mySession !== sessionId) return;

    const readableReason =
      makeReadable(reason);

    lastKickReason =
      readableReason;

    botStatus =
      'Kicked from server';

    console.log('');
    console.log('🚫 BOT KICKED');
    console.log(readableReason);

  });


  // ================================================
  // ERROR EVENT
  // ================================================

  bot.on('error', error => {

    if (mySession !== sessionId) return;

    lastError =
      error.message || String(error);

    botStatus =
      `Error: ${lastError}`;

    console.log('');
    console.error(
      '⚠️ BOT ERROR:',
      error
    );

  });


  // ================================================
  // END EVENT
  // ================================================

  bot.on('end', reason => {

    if (mySession !== sessionId) return;

    const readableReason =
      reason
        ? makeReadable(reason)
        : 'Unknown reason';

    lastDisconnectReason =
      readableReason;

    botStatus =
      'Disconnected — reconnect scheduled';

    connectedSince = null;

    console.log('');
    console.log(
      `⛔ Disconnected: ${readableReason}`
    );

    stopLoops();

    scheduleReconnect();

  });

}


// ==================================================
// RECONNECT SYSTEM
// ==================================================

function scheduleReconnect() {

  clearTimeout(reconnectTimer);

  console.log(
    `🔄 Reconnecting in ${RECONNECT_DELAY / 1000} seconds...`
  );


  reconnectTimer =
    setTimeout(() => {

      botStatus =
        'Attempting reconnection';

      startBot();

    }, RECONNECT_DELAY);

}


// ==================================================
// MOVEMENT SYSTEM
// ==================================================

function chooseMovement(mySession) {

  if (!isSessionActive(mySession)) {
    return;
  }


  // Only reset directional controls.
  // Jumping remains independent.

  bot.setControlState(
    'forward',
    false
  );

  bot.setControlState(
    'back',
    false
  );

  bot.setControlState(
    'left',
    false
  );

  bot.setControlState(
    'right',
    false
  );

  bot.setControlState(
    'sprint',
    false
  );

  bot.setControlState(
    'sneak',
    false
  );


  const roll = Math.random();


  // Forward

  if (roll < 0.22) {

    bot.setControlState(
      'forward',
      true
    );

  }


  // Forward-left

  else if (roll < 0.40) {

    bot.setControlState(
      'forward',
      true
    );

    bot.setControlState(
      'left',
      true
    );

  }


  // Forward-right

  else if (roll < 0.58) {

    bot.setControlState(
      'forward',
      true
    );

    bot.setControlState(
      'right',
      true
    );

  }


  // Left strafe

  else if (roll < 0.68) {

    bot.setControlState(
      'left',
      true
    );

  }


  // Right strafe

  else if (roll < 0.78) {

    bot.setControlState(
      'right',
      true
    );

  }


  // Back-left

  else if (roll < 0.84) {

    bot.setControlState(
      'back',
      true
    );

    bot.setControlState(
      'left',
      true
    );

  }


  // Back-right

  else if (roll < 0.90) {

    bot.setControlState(
      'back',
      true
    );

    bot.setControlState(
      'right',
      true
    );

  }


  // Back

  else if (roll < 0.94) {

    bot.setControlState(
      'back',
      true
    );

  }


  // Remaining 6% = pause


  // Occasionally sprint forward

  if (
    bot.getControlState('forward') &&
    Math.random() < 0.20
  ) {

    bot.setControlState(
      'sprint',
      true
    );

  }


  const duration =
    randomInt(
      1800,
      6500
    );


  movementTimer =
    setTimeout(() => {

      chooseMovement(
        mySession
      );

    }, duration);

}


// ==================================================
// JUMP SYSTEM
// ==================================================

function scheduleJump(mySession) {

  if (!isSessionActive(mySession)) {
    return;
  }


  const delay =
    randomInt(
      2500,
      10000
    );


  jumpTimer =
    setTimeout(() => {

      if (!isSessionActive(mySession)) {
        return;
      }


      bot.setControlState(
        'jump',
        true
      );


      const jumpLength =
        randomInt(
          250,
          550
        );


      setTimeout(() => {

        if (!isSessionActive(mySession)) {
          return;
        }

        bot.setControlState(
          'jump',
          false
        );

      }, jumpLength);


      scheduleJump(
        mySession
      );

    }, delay);

}


// ==================================================
// PUNCH / ARM SWING SYSTEM
// ==================================================

function schedulePunch(mySession) {

  if (!isSessionActive(mySession)) {
    return;
  }


  const delay =
    randomInt(
      3000,
      14000
    );


  punchTimer =
    setTimeout(() => {

      if (!isSessionActive(mySession)) {
        return;
      }


      try {

        bot.swingArm(
          Math.random() < 0.85
            ? 'right'
            : 'left'
        );

      } catch {
        // Ignore animation error
      }


      // Occasional second swing

      if (Math.random() < 0.18) {

        setTimeout(() => {

          if (!isSessionActive(mySession)) {
            return;
          }

          try {

            bot.swingArm('right');

          } catch {
            // Ignore
          }

        }, randomInt(300, 900));

      }


      schedulePunch(
        mySession
      );

    }, delay);

}


// ==================================================
// HEAD TARGET SYSTEM
// ==================================================

function chooseHeadTarget(mySession) {

  if (!isSessionActive(mySession)) {
    return;
  }


  let maxTurn;

  const turnRoll =
    Math.random();


  if (turnRoll < 0.65) {

    maxTurn = 35;

  }

  else if (turnRoll < 0.90) {

    maxTurn = 80;

  }

  else {

    maxTurn = 150;

  }


  const yawChange =
    degreesToRadians(

      randomBetween(
        -maxTurn,
        maxTurn
      )

    );


  targetYaw =
    normalizeAngle(

      currentYaw +
      yawChange

    );


  targetPitch =
    degreesToRadians(

      randomBetween(
        -25,
        25
      )

    );


  const delay =
    randomInt(
      1200,
      6000
    );


  headTargetTimer =
    setTimeout(() => {

      chooseHeadTarget(
        mySession
      );

    }, delay);

}


// ==================================================
// SMOOTH HEAD MOVEMENT
// ==================================================

function smoothHeadLoop(mySession) {

  if (!isSessionActive(mySession)) {
    return;
  }


  const yawDifference =
    normalizeAngle(

      targetYaw -
      currentYaw

    );


  const pitchDifference =
    targetPitch -
    currentPitch;


  const smoothing =
    randomBetween(
      0.035,
      0.075
    );


  currentYaw +=
    yawDifference *
    smoothing;


  currentPitch +=
    pitchDifference *
    smoothing;


  const maxPitch =
    Math.PI / 2;


  currentPitch =
    Math.max(

      -maxPitch,

      Math.min(
        maxPitch,
        currentPitch
      )

    );


  try {

    const result =
      bot.look(

        currentYaw,

        currentPitch,

        true

      );


    if (
      result &&
      typeof result.catch === 'function'
    ) {

      result.catch(
        () => {}
      );

    }

  } catch {
    // Ignore during disconnect
  }


  headLoopTimer =
    setTimeout(() => {

      smoothHeadLoop(
        mySession
      );

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
// STOP LOOPS
// ==================================================

function stopLoops() {

  clearTimeout(
    movementTimer
  );

  clearTimeout(
    jumpTimer
  );

  clearTimeout(
    punchTimer
  );

  clearTimeout(
    headTargetTimer
  );

  clearTimeout(
    headLoopTimer
  );


  movementTimer = null;
  jumpTimer = null;
  punchTimer = null;
  headTargetTimer = null;
  headLoopTimer = null;


  if (bot) {

    try {

      bot.clearControlStates();

    } catch {
      // Ignore cleanup error
    }

  }

}


// ==================================================
// HELPERS
// ==================================================

function randomInt(min, max) {

  return Math.floor(

    Math.random() *
    (max - min + 1)

  ) + min;

}


function randomBetween(min, max) {

  return (

    Math.random() *
    (max - min) +
    min

  );

}


function degreesToRadians(degrees) {

  return (
    degrees *
    Math.PI /
    180
  );

}


function normalizeAngle(angle) {

  while (angle > Math.PI) {

    angle -=
      Math.PI * 2;

  }


  while (angle < -Math.PI) {

    angle +=
      Math.PI * 2;

  }


  return angle;

}


function makeReadable(value) {

  if (typeof value === 'string') {

    return value;

  }


  try {

    return JSON.stringify(
      value
    );

  } catch {

    return String(value);

  }

}


function formatDuration(milliseconds) {

  const seconds =
    Math.floor(
      milliseconds / 1000
    );


  const hours =
    Math.floor(
      seconds / 3600
    );


  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );


  const remainingSeconds =
    seconds % 60;


  return (
    `${hours}h ` +
    `${minutes}m ` +
    `${remainingSeconds}s`
  );

}


function escapeHtml(value) {

  return String(value)

    .replaceAll(
      '&',
      '&amp;'
    )

    .replaceAll(
      '<',
      '&lt;'
    )

    .replaceAll(
      '>',
      '&gt;'
    )

    .replaceAll(
      '"',
      '&quot;'
    )

    .replaceAll(
      "'",
      '&#039;'
    );

}


// ==================================================
// START BOT
// ==================================================

startBot();