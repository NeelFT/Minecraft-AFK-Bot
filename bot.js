const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');


// ==================================================
// SETTINGS
// ==================================================

const WEB_PORT = process.env.PORT || 10000;
const RECONNECT_DELAY = 30000;


// ==================================================
// WEB SERVER
// ==================================================

const app = express();

let bot = null;

let botStatus = 'Starting';
let lastError = 'None';
let lastKick = 'None';
let lastDisconnect = 'None';
let connectedSince = null;


// Public status page
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
      max-width: 650px;
      margin: auto;
      background: #1e1e1e;
      padding: 25px;
      border-radius: 16px;
      line-height: 1.7;
    }

    h1 {
      margin-top: 0;
    }

    .status {
      font-size: 23px;
      font-weight: bold;
      margin-bottom: 20px;
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
      ${escapeHtml(config.serverHost)}:${escapeHtml(config.serverPort)}
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


// Lightweight endpoint for cron-job.org
app.get('/health', (req, res) => {
  res.status(200).json({
    webServer: 'online',
    botStatus,
    connected: botStatus === 'Spawned and active',
    server: `${config.serverHost}:${config.serverPort}`,
    username: config.botUsername,
    lastError,
    lastKick,
    lastDisconnect
  });
});


app.listen(WEB_PORT, '0.0.0.0', () => {
  console.log(
    `🌐 Web server listening on port ${WEB_PORT}`
  );
});


// ==================================================
// BOT SYSTEM STATE
// ==================================================

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
// CREATE BOT
// ==================================================

function startBot() {
  sessionId++;

  const mySession = sessionId;

  botStatus = 'Connecting';

  console.log('');
  console.log('====================================');
  console.log('🤖 Starting Minecraft bot...');
  console.log(
    `🌍 ${config.serverHost}:${config.serverPort}`
  );
  console.log(
    `👤 ${config.botUsername}`
  );
  console.log('====================================');


  // ==================================================
  // ORIGINAL CONNECTION STRUCTURE RESTORED
  // ==================================================

  bot = mineflayer.createBot({
    host: config.serverHost,
    port: config.serverPort,
    username: config.botUsername,
    auth: 'offline',
    version: false,
    viewDistance: config.botChunk
  });


  // ==================================================
  // CONNECTION EVENTS
  // ==================================================

  bot.on('connect', () => {
    if (mySession !== sessionId) return;

    botStatus = 'TCP connected';

    console.log(
      '🔌 TCP connection established.'
    );
  });


  bot.on('login', () => {
    if (mySession !== sessionId) return;

    botStatus = 'Logged in — waiting for spawn';

    console.log(
      '📡 Minecraft login successful.'
    );
  });


  // ==================================================
  // SPAWN
  // ==================================================

  bot.on('spawn', () => {
    if (mySession !== sessionId) return;

    botStatus = 'Spawned and active';

    connectedSince = Date.now();

    lastError = 'None';

    console.log(
      `✅ ${config.botUsername} spawned successfully.`
    );


    // Make sure crouching is OFF
    bot.clearControlStates();

    bot.setControlState(
      'sneak',
      false
    );


    // Initial head position
    currentYaw = bot.entity.yaw;
    currentPitch = bot.entity.pitch;

    targetYaw = currentYaw;
    targetPitch = currentPitch;


    setTimeout(() => {
      if (!active(mySession)) return;

      console.log(
        '🟢 Continuous movement systems started.'
      );

      chooseMovement(mySession);

      scheduleJump(mySession);

      schedulePunch(mySession);

      chooseHeadTarget(mySession);

      smoothHeadLoop(mySession);

    }, 3000);
  });


  // ==================================================
  // KICK
  // ==================================================

  bot.on('kicked', reason => {
    if (mySession !== sessionId) return;

    lastKick = readable(reason);

    botStatus = 'Kicked';

    console.log('');
    console.log('🚫 BOT KICKED');
    console.log(lastKick);
  });


  // ==================================================
  // ERROR
  // ==================================================

  bot.on('error', error => {
    if (mySession !== sessionId) return;

    lastError =
      error.message || String(error);

    botStatus =
      `Error: ${lastError}`;

    console.log('');
    console.error('⚠️ BOT ERROR');
    console.error(error);
  });


  // ==================================================
  // DISCONNECT
  // ==================================================

  bot.on('end', reason => {
    if (mySession !== sessionId) return;

    lastDisconnect =
      reason
        ? readable(reason)
        : 'Unknown reason';

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
    `🔄 Reconnecting in ${RECONNECT_DELAY / 1000} seconds...`
  );

  reconnectTimer = setTimeout(() => {
    startBot();
  }, RECONNECT_DELAY);
}


// ==================================================
// CONTINUOUS MOVEMENT SYSTEM
// ==================================================

function chooseMovement(mySession) {
  if (!active(mySession)) return;


  // Reset movement direction only.
  // Jump system remains independent.

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


  // Forward + left
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


  // Forward + right
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


  // Back + left
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


  // Back + right
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


  // Remaining chance = stand still


  // Occasional sprint while moving forward
  if (
    bot.getControlState('forward') &&
    Math.random() < 0.20
  ) {
    bot.setControlState(
      'sprint',
      true
    );
  }


  // Continue this movement for 1.8–6.5 seconds
  movementTimer = setTimeout(
    () => {
      chooseMovement(mySession);
    },

    randomInt(1800, 6500)
  );
}


// ==================================================
// INDEPENDENT JUMP SYSTEM
// ==================================================

function scheduleJump(mySession) {
  if (!active(mySession)) return;


  jumpTimer = setTimeout(() => {
    if (!active(mySession)) return;


    // Does NOT cancel walking or strafing
    bot.setControlState(
      'jump',
      true
    );


    const jumpLength =
      randomInt(250, 550);


    setTimeout(() => {
      if (!active(mySession)) return;

      bot.setControlState(
        'jump',
        false
      );

    }, jumpLength);


    scheduleJump(mySession);

  }, randomInt(2500, 10000));
}


// ==================================================
// INDEPENDENT ARM SWING SYSTEM
// ==================================================

function schedulePunch(mySession) {
  if (!active(mySession)) return;


  punchTimer = setTimeout(() => {
    if (!active(mySession)) return;


    try {
      bot.swingArm(
        Math.random() < 0.85
          ? 'right'
          : 'left'
      );
    } catch {}


    // Occasional second swing
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
// HEAD TARGET SYSTEM
// ==================================================

function chooseHeadTarget(mySession) {
  if (!active(mySession)) return;


  const turnRoll = Math.random();

  let maxTurn;


  // Usually small head movement
  if (turnRoll < 0.65) {
    maxTurn = 35;
  }

  // Sometimes medium turn
  else if (turnRoll < 0.90) {
    maxTurn = 80;
  }

  // Occasionally large turn
  else {
    maxTurn = 150;
  }


  targetYaw = normalizeAngle(
    currentYaw +
    degreesToRadians(
      randomBetween(
        -maxTurn,
        maxTurn
      )
    )
  );


  targetPitch = degreesToRadians(
    randomBetween(
      -25,
      25
    )
  );


  headTargetTimer = setTimeout(
    () => {
      chooseHeadTarget(mySession);
    },

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
      targetYaw - currentYaw
    );


  const pitchDifference =
    targetPitch - currentPitch;


  const smoothing =
    randomBetween(
      0.035,
      0.075
    );


  currentYaw +=
    yawDifference * smoothing;


  currentPitch +=
    pitchDifference * smoothing;


  // Keep pitch inside valid range
  const maxPitch = Math.PI / 2;

  currentPitch = Math.max(
    -maxPitch,

    Math.min(
      maxPitch,
      currentPitch
    )
  );


  try {
    const result = bot.look(
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


  headLoopTimer = setTimeout(
    () => {
      smoothHeadLoop(mySession);
    },

    50
  );
}


// ==================================================
// SESSION CHECK
// ==================================================

function active(mySession) {
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
    angle -= Math.PI * 2;
  }

  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }

  return angle;
}


function readable(value) {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
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
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


// ==================================================
// START
// ==================================================

startBot();