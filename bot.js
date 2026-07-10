const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');


// ==================================================
// SETTINGS
// ==================================================

const SERVER_HOST = 'TokiCraftMC.aternos.me';
const SERVER_PORT = 11625;

const WEB_PORT = process.env.PORT || 10000;
const RECONNECT_DELAY = 30000;


// ==================================================
// STATE
// ==================================================

let bot = null;

let botStatus = 'Starting';
let lastError = 'None';
let lastKick = 'None';
let lastDisconnect = 'None';
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
// WEB SERVER
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
  padding: 25px;
}

.card {
  max-width: 600px;
  margin: auto;
  background: #1e1e1e;
  padding: 25px;
  border-radius: 16px;
  line-height: 1.6;
}

h1 {
  font-size: 36px;
}

.status {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
}

.item {
  margin-top: 15px;
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
${escapeHtml(lastKick)}
</div>

<div class="item">
🔌 Last disconnect:
${escapeHtml(lastDisconnect)}
</div>

</div>

</body>

</html>
  `);

});


app.get('/health', (req, res) => {

  res.status(200).json({

    web: 'online',

    minecraft: botStatus,

    server: `${SERVER_HOST}:${SERVER_PORT}`,

    username: config.botUsername,

    connected:
      botStatus === 'Spawned and active',

    lastError,

    lastKick,

    lastDisconnect

  });

});


app.listen(
  WEB_PORT,
  '0.0.0.0',
  () => {

    console.log(
      `🌐 Web server running on port ${WEB_PORT}`
    );

  }
);


// ==================================================
// START BOT
// ==================================================

function startBot() {

  sessionId++;

  const mySession = sessionId;

  botStatus = 'Connecting';

  console.log('');
  console.log('==============================');
  console.log('🤖 Starting bot');
  console.log(`${SERVER_HOST}:${SERVER_PORT}`);
  console.log('==============================');


  bot = mineflayer.createBot({

    host: SERVER_HOST,

    port: SERVER_PORT,

    username: config.botUsername,

    auth: 'offline',

    viewDistance: config.botChunk

  });


  // ================================================
  // CONNECTION
  // ================================================

  bot.on('connect', () => {

    if (mySession !== sessionId) return;

    botStatus = 'TCP connected';

    console.log(
      '🔌 TCP connection established'
    );

  });


  bot.on('login', () => {

    if (mySession !== sessionId) return;

    botStatus =
      'Logged in — waiting for spawn';

    console.log(
      '📡 Login successful'
    );

  });


  // ================================================
  // SPAWN
  // ================================================

  bot.on('spawn', () => {

    if (mySession !== sessionId) return;

    console.log(
      `✅ ${config.botUsername} spawned`
    );

    botStatus = 'Spawned and active';

    connectedSince = Date.now();

    lastError = 'None';


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

      if (!active(mySession)) return;

      console.log(
        '🟢 Movement started'
      );

      chooseMovement(mySession);

      scheduleJump(mySession);

      schedulePunch(mySession);

      chooseHeadTarget(mySession);

      smoothHeadLoop(mySession);

    }, 3000);

  });


  // ================================================
  // KICK
  // ================================================

  bot.on('kicked', reason => {

    if (mySession !== sessionId) return;

    lastKick = readable(reason);

    botStatus = 'Kicked';

    console.log('');
    console.log('🚫 KICKED');
    console.log(lastKick);

  });


  // ================================================
  // ERROR
  // ================================================

  bot.on('error', error => {

    if (mySession !== sessionId) return;

    lastError =
      error.message || String(error);

    botStatus =
      `Error: ${lastError}`;

    console.error('');
    console.error('⚠️ ERROR');
    console.error(error);

  });


  // ================================================
  // DISCONNECT
  // ================================================

  bot.on('end', reason => {

    if (mySession !== sessionId) return;

    lastDisconnect =
      reason
        ? readable(reason)
        : 'Unknown';

    connectedSince = null;

    botStatus =
      'Disconnected — reconnect scheduled';

    console.log('');
    console.log(
      `⛔ Disconnected: ${lastDisconnect}`
    );

    stopLoops();

    scheduleReconnect();

  });

}


// ==================================================
// RECONNECT
// ==================================================

function scheduleReconnect() {

  clearTimeout(reconnectTimer);

  console.log(
    '🔄 Reconnecting in 30 seconds'
  );

  reconnectTimer =
    setTimeout(() => {

      startBot();

    }, RECONNECT_DELAY);

}


// ==================================================
// MOVEMENT
// ==================================================

function chooseMovement(mySession) {

  if (!active(mySession)) return;


  // Reset directional controls only

  bot.setControlState('forward', false);

  bot.setControlState('back', false);

  bot.setControlState('left', false);

  bot.setControlState('right', false);

  bot.setControlState('sprint', false);

  bot.setControlState('sneak', false);


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


  // Left

  else if (roll < 0.68) {

    bot.setControlState(
      'left',
      true
    );

  }


  // Right

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


  // Backward

  else if (roll < 0.94) {

    bot.setControlState(
      'back',
      true
    );

  }


  // Remaining probability = stand still


  // Occasional sprint

  if (
    bot.getControlState('forward') &&
    Math.random() < 0.20
  ) {

    bot.setControlState(
      'sprint',
      true
    );

  }


  movementTimer =
    setTimeout(

      () => chooseMovement(mySession),

      randomInt(1800, 6500)

    );

}


// ==================================================
// JUMPING
// ==================================================

function scheduleJump(mySession) {

  if (!active(mySession)) return;


  jumpTimer =
    setTimeout(() => {

      if (!active(mySession)) return;


      bot.setControlState(
        'jump',
        true
      );


      setTimeout(() => {

        if (!active(mySession)) return;

        bot.setControlState(
          'jump',
          false
        );

      }, randomInt(250, 550));


      scheduleJump(mySession);

    }, randomInt(2500, 10000));

}


// ==================================================
// RANDOM ARM SWINGS
// ==================================================

function schedulePunch(mySession) {

  if (!active(mySession)) return;


  punchTimer =
    setTimeout(() => {

      if (!active(mySession)) return;


      try {

        bot.swingArm(
          Math.random() < 0.85
            ? 'right'
            : 'left'
        );

      } catch {}


      // Occasional double swing

      if (Math.random() < 0.18) {

        setTimeout(() => {

          if (!active(mySession)) return;

          try {

            bot.swingArm('right');

          } catch {}

        }, randomInt(300, 900));

      }


      schedulePunch(mySession);

    }, randomInt(3000, 14000));

}


// ==================================================
// HEAD TARGET
// ==================================================

function chooseHeadTarget(mySession) {

  if (!active(mySession)) return;


  const roll = Math.random();

  let maxTurn;


  if (roll < 0.65) {

    maxTurn = 35;

  }

  else if (roll < 0.90) {

    maxTurn = 80;

  }

  else {

    maxTurn = 150;

  }


  targetYaw =
    normalizeAngle(

      currentYaw +

      degreesToRadians(

        randomBetween(
          -maxTurn,
          maxTurn
        )

      )

    );


  targetPitch =
    degreesToRadians(

      randomBetween(
        -25,
        25
      )

    );


  headTargetTimer =
    setTimeout(

      () =>
        chooseHeadTarget(mySession),

      randomInt(1200, 6000)

    );

}


// ==================================================
// SMOOTH HEAD MOVEMENT
// ==================================================

function smoothHeadLoop(mySession) {

  if (!active(mySession)) return;


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

      result.catch(() => {});

    }

  } catch {}


  headLoopTimer =
    setTimeout(

      () =>
        smoothHeadLoop(mySession),

      50

    );

}


// ==================================================
// ACTIVE SESSION CHECK
// ==================================================

function active(mySession) {

  return (

    mySession === sessionId &&

    bot &&

    bot.entity

  );

}


// ==================================================
// STOP ALL LOOPS
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

    } catch {}

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


function readable(value) {

  if (typeof value === 'string') {

    return value;

  }


  try {

    return JSON.stringify(value);

  }

  catch {

    return String(value);

  }

}


function formatDuration(ms) {

  const seconds =
    Math.floor(ms / 1000);


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

    .replaceAll('&', '&amp;')

    .replaceAll('<', '&lt;')

    .replaceAll('>', '&gt;')

    .replaceAll('"', '&quot;')

    .replaceAll("'", '&#039;');

}


// ==================================================
// GO
// ==================================================

startBot();