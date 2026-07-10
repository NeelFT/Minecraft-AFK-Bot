const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');


// ==================================================
// SETTINGS
// ==================================================

const WEB_PORT = process.env.PORT || 10000;
const RECONNECT_DELAY = 15000;


// ==================================================
// WEB SERVER
// ==================================================

const app = express();

let bot = null;

let botStatus = 'Starting';
let currentBehavior = 'Waiting';
let lastError = 'None';
let lastKick = 'None';
let lastDisconnect = 'None';
let connectedSince = null;


// ==================================================
// STATUS PAGE
// ==================================================

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

<title>Nunya Status</title>

<style>

body {
  background: #111;
  color: #eee;
  font-family: Arial, sans-serif;
  padding: 24px;
}

.card {
  max-width: 650px;
  margin: auto;
  background: #1d1d1d;
  padding: 24px;
  border-radius: 16px;
  line-height: 1.7;
}

h1 {
  margin-top: 0;
}

.status {
  font-size: 22px;
  font-weight: bold;
}

.item {
  margin-top: 13px;
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
🏃 Current behavior:
${escapeHtml(currentBehavior)}
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


app.get('/health', (req, res) => {

  res.status(200).json({

    webServer: 'online',

    botStatus,

    currentBehavior,

    connected:
      botStatus === 'Spawned and active',

    username:
      config.botUsername,

    server:
      `${config.serverHost}:${config.serverPort}`,

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
// ENGINE STATE
// ==================================================

let sessionId = 0;

let movementTimer = null;
let jumpTimer = null;
let swingTimer = null;
let headTargetTimer = null;
let headLoopTimer = null;
let reconnectTimer = null;

let movementEngineRunning = false;

let currentYaw = 0;
let currentPitch = 0;

let targetYaw = 0;
let targetPitch = 0;


// Remember recent movement choices
// so the same patterns are less likely to repeat.

let movementHistory = [];


// ==================================================
// START BOT
// ==================================================

function startBot() {

  sessionId++;

  const mySession = sessionId;

  botStatus = 'Connecting';
  currentBehavior = 'Connecting';

  console.log('');
  console.log('====================================');
  console.log('🤖 Starting Nunya');
  console.log(
    `🌍 ${config.serverHost}:${config.serverPort}`
  );
  console.log('====================================');


  // ==================================================
  // WORKING CONNECTION CONFIGURATION
  // DO NOT CHANGE THIS SECTION
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
      '🔌 TCP connected'
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


  // ==================================================
  // SPAWN
  // ==================================================

  bot.on('spawn', () => {

    if (mySession !== sessionId) return;


    botStatus =
      'Spawned and active';

    connectedSince =
      Date.now();

    lastError =
      'None';


    console.log(
      `✅ ${config.botUsername} spawned`
    );


    /*
      Prevent multiple movement engines
      from starting on repeated spawn events.
    */

    stopMovementEngine();


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

      startMovementEngine(
        mySession
      );

    }, 2000);

  });


  // ==================================================
  // KICK
  // ==================================================

  bot.on('kicked', reason => {

    if (mySession !== sessionId) return;

    lastKick =
      readable(reason);

    botStatus =
      'Kicked';

    console.log('');
    console.log('🚫 KICKED');
    console.log(lastKick);

  });


  // ==================================================
  // ERROR
  // ==================================================

  bot.on('error', error => {

    if (mySession !== sessionId) return;

    lastError =
      error.message ||
      String(error);

    console.log('');
    console.error(
      '⚠️ CONNECTION ERROR:',
      lastError
    );

  });


  // ==================================================
  // CONNECTION ENDED
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

    currentBehavior =
      'Disconnected';


    console.log('');
    console.log(
      `⛔ Connection ended: ${lastDisconnect}`
    );


    stopMovementEngine();


    /*
      This does NOT intentionally disconnect the bot.

      This only runs AFTER an external disconnect
      has already happened.
    */

    scheduleReconnect();

  });

}


// ==================================================
// RECONNECT
// ==================================================

function scheduleReconnect() {

  clearTimeout(
    reconnectTimer
  );


  console.log(
    `🔄 Reconnecting in ${RECONNECT_DELAY / 1000} seconds`
  );


  reconnectTimer =
    setTimeout(() => {

      startBot();

    }, RECONNECT_DELAY);

}


// ==================================================
// START MOVEMENT ENGINE
// ==================================================

function startMovementEngine(mySession) {

  if (!active(mySession)) return;

  if (movementEngineRunning) return;


  movementEngineRunning = true;


  console.log(
    '🟢 Movement engine active'
  );


  chooseLongMovement(
    mySession
  );

  scheduleJump(
    mySession
  );

  scheduleSwing(
    mySession
  );

  chooseHeadTarget(
    mySession
  );

  smoothHeadLoop(
    mySession
  );

}


// ==================================================
// LONG MOVEMENT SYSTEM
// ==================================================

function chooseLongMovement(mySession) {

  if (
    !active(mySession) ||
    !movementEngineRunning
  ) {
    return;
  }


  /*
    Do not touch jump here.

    Jumping is independent.
  */

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


  const movements = [

    {
      name: 'Walking forward',
      controls: ['forward'],
      weight: 22
    },

    {
      name: 'Walking forward-left',
      controls: ['forward', 'left'],
      weight: 18
    },

    {
      name: 'Walking forward-right',
      controls: ['forward', 'right'],
      weight: 18
    },

    {
      name: 'Curving left',
      controls: ['forward', 'left'],
      weight: 10
    },

    {
      name: 'Curving right',
      controls: ['forward', 'right'],
      weight: 10
    },

    {
      name: 'Moving left',
      controls: ['left'],
      weight: 6
    },

    {
      name: 'Moving right',
      controls: ['right'],
      weight: 6
    },

    {
      name: 'Backing left',
      controls: ['back', 'left'],
      weight: 3
    },

    {
      name: 'Backing right',
      controls: ['back', 'right'],
      weight: 3
    },

    {
      name: 'Walking backward',
      controls: ['back'],
      weight: 2
    },

    {
      name: 'Briefly standing',
      controls: [],
      weight: 2
    }

  ];


  let choice;

  let attempts = 0;


  do {

    choice =
      weightedChoice(
        movements
      );

    attempts++;

  } while (

    movementHistory.includes(
      choice.name
    ) &&

    attempts < 10

  );


  movementHistory.push(
    choice.name
  );


  if (
    movementHistory.length > 3
  ) {

    movementHistory.shift();

  }


  for (
    const control of choice.controls
  ) {

    bot.setControlState(
      control,
      true
    );

  }


  /*
    Sprint occasionally during
    forward movement.
  */

  if (

    choice.controls.includes(
      'forward'
    ) &&

    Math.random() < 0.18

  ) {

    bot.setControlState(
      'sprint',
      true
    );

    currentBehavior =
      `${choice.name} + sprinting`;

  }

  else {

    currentBehavior =
      choice.name;

  }


  /*
    Long movement duration:

    Usually 5–14 seconds.

    Rare standing pause:
    0.8–2.2 seconds.
  */

  let duration;


  if (
    choice.controls.length === 0
  ) {

    duration =
      randomInt(
        800,
        2200
      );

  }

  else {

    duration =
      randomInt(
        5000,
        14000
      );

  }


  movementTimer =
    setTimeout(() => {

      chooseLongMovement(
        mySession
      );

    }, duration);

}


// ==================================================
// INDEPENDENT JUMPING
// ==================================================

function scheduleJump(mySession) {

  if (
    !active(mySession) ||
    !movementEngineRunning
  ) {
    return;
  }


  /*
    Uneven jump intervals.
  */

  const delay =
    randomInt(
      3500,
      13000
    );


  jumpTimer =
    setTimeout(() => {

      if (
        !active(mySession) ||
        !movementEngineRunning
      ) {
        return;
      }


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

      }, randomInt(250, 500));


      scheduleJump(
        mySession
      );

    }, delay);

}


// ==================================================
// INDEPENDENT ARM MOVEMENT
// ==================================================

function scheduleSwing(mySession) {

  if (
    !active(mySession) ||
    !movementEngineRunning
  ) {
    return;
  }


  const delay =
    randomInt(
      4000,
      18000
    );


  swingTimer =
    setTimeout(() => {

      if (
        !active(mySession) ||
        !movementEngineRunning
      ) {
        return;
      }


      try {

        bot.swingArm(
          Math.random() < 0.9
            ? 'right'
            : 'left'
        );

      } catch {}


      /*
        Small chance of another swing,
        without creating constant patterns.
      */

      if (
        Math.random() < 0.12
      ) {

        setTimeout(() => {

          if (!active(mySession)) return;

          try {

            bot.swingArm('right');

          } catch {}

        }, randomInt(400, 1200));

      }


      scheduleSwing(
        mySession
      );

    }, delay);

}


// ==================================================
// HEAD TARGET SYSTEM
// ==================================================

function chooseHeadTarget(mySession) {

  if (
    !active(mySession) ||
    !movementEngineRunning
  ) {
    return;
  }


  const roll =
    Math.random();


  let maxTurn;


  /*
    Most turns are small.

    Some are medium.

    Large turns are uncommon.
  */

  if (roll < 0.70) {

    maxTurn = 30;

  }

  else if (roll < 0.94) {

    maxTurn = 75;

  }

  else {

    maxTurn = 145;

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
        -20,
        18
      )

    );


  headTargetTimer =
    setTimeout(() => {

      chooseHeadTarget(
        mySession
      );

    }, randomInt(2200, 8500));

}


// ==================================================
// SMOOTH HEAD LOOP
// ==================================================

function smoothHeadLoop(mySession) {

  if (
    !active(mySession) ||
    !movementEngineRunning
  ) {
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


  /*
    Smooth interpolation.
  */

  const smoothing =
    0.045;


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

      result.catch(
        () => {}
      );

    }

  } catch {}


  headLoopTimer =
    setTimeout(() => {

      smoothHeadLoop(
        mySession
      );

    }, 50);

}


// ==================================================
// STOP MOVEMENT ENGINE
// ==================================================

function stopMovementEngine() {

  movementEngineRunning = false;


  clearTimeout(
    movementTimer
  );

  clearTimeout(
    jumpTimer
  );

  clearTimeout(
    swingTimer
  );

  clearTimeout(
    headTargetTimer
  );

  clearTimeout(
    headLoopTimer
  );


  movementTimer = null;
  jumpTimer = null;
  swingTimer = null;
  headTargetTimer = null;
  headLoopTimer = null;


  if (bot) {

    try {

      bot.clearControlStates();

    } catch {}

  }

}


// ==================================================
// ACTIVE CONNECTION CHECK
// ==================================================

function active(mySession) {

  return (

    mySession === sessionId &&

    bot &&

    bot.entity

  );

}


// ==================================================
// WEIGHTED RANDOM SELECTION
// ==================================================

function weightedChoice(options) {

  const total =
    options.reduce(

      (sum, option) =>
        sum + option.weight,

      0

    );


  let random =
    Math.random() *
    total;


  for (
    const option of options
  ) {

    random -=
      option.weight;


    if (random <= 0) {

      return option;

    }

  }


  return options[
    options.length - 1
  ];

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

  while (
    angle > Math.PI
  ) {

    angle -=
      Math.PI * 2;

  }


  while (
    angle < -Math.PI
  ) {

    angle +=
      Math.PI * 2;

  }


  return angle;

}


function readable(value) {

  if (
    typeof value === 'string'
  ) {

    return value;

  }


  try {

    return JSON.stringify(
      value
    );

  }

  catch {

    return String(
      value
    );

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
// START
// ==================================================

startBot();