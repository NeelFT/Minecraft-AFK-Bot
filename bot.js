const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');


// ======================================================
// SETTINGS
// ======================================================

const WEB_PORT = process.env.PORT || 10000;

// This is only the delay AFTER a real disconnect.
// It does not disconnect the bot.
const RECONNECT_DELAY = 5000;


// ======================================================
// WEB SERVER
// ======================================================

const app = express();

let bot = null;

let botStatus = 'Starting';
let currentBehavior = 'Waiting';

let connectedSince = null;

let lastError = 'None';
let lastKick = 'None';
let lastDisconnect = 'None';


// ======================================================
// STATUS PAGE
// ======================================================

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

    web: 'online',

    minecraft: botStatus,

    behavior: currentBehavior,

    connected:
      botStatus === 'Spawned and active',

    server:
      `${config.serverHost}:${config.serverPort}`,

    username:
      config.botUsername,

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


// ======================================================
// ENGINE STATE
// ======================================================

let connectionGeneration = 0;

let reconnectTimer = null;

let movementTimer = null;
let jumpTimer = null;
let punchTimer = null;
let headTargetTimer = null;
let headLoopTimer = null;

let movementRunning = false;

let currentYaw = 0;
let currentPitch = 0;

let targetYaw = 0;
let targetPitch = 0;


// Prevent recent movement repetition

let recentMovementNames = [];


// ======================================================
// CONNECT BOT
// ======================================================

function initBot() {

  connectionGeneration++;

  const generation =
    connectionGeneration;


  botStatus = 'Connecting';

  currentBehavior =
    'Waiting for server connection';


  console.log('');
  console.log('====================================');
  console.log('🤖 Connecting Nunya...');
  console.log(
    `🌍 ${config.serverHost}:${config.serverPort}`
  );
  console.log('====================================');


  /*
    KEEP THIS CONNECTION BLOCK SIMPLE.

    This is the setup that successfully spawned
    in the earlier working version.
  */

  bot = mineflayer.createBot({

    host: config.serverHost,

    port: config.serverPort,

    username: config.botUsername,

    auth: 'offline',

    version: false,

    viewDistance: config.botChunk

  });


  // ====================================================
  // TCP CONNECTION
  // ====================================================

  bot.on('connect', () => {

    if (
      generation !== connectionGeneration
    ) {
      return;
    }


    botStatus =
      'TCP connected';


    console.log(
      '🔌 TCP connection established'
    );

  });


  // ====================================================
  // LOGIN
  // ====================================================

  bot.on('login', () => {

    if (
      generation !== connectionGeneration
    ) {
      return;
    }


    botStatus =
      'Logged in — waiting for spawn';


    console.log(
      '📡 Minecraft login successful'
    );

  });


  // ====================================================
  // SPAWN
  // ====================================================

  bot.on('spawn', () => {

    if (
      generation !== connectionGeneration
    ) {
      return;
    }


    console.log(
      `✅ ${config.botUsername} spawned successfully`
    );


    botStatus =
      'Spawned and active';


    currentBehavior =
      'Starting movement engine';


    connectedSince =
      Date.now();


    lastError =
      'None';


    /*
      Remove old movement timers before starting
      the movement engine.

      This prevents duplicate movement loops after
      respawns.
    */

    stopMovement();


    try {

      bot.clearControlStates();

      bot.setControlState(
        'sneak',
        false
      );

    } catch {}


    currentYaw =
      bot.entity.yaw;


    currentPitch =
      bot.entity.pitch;


    targetYaw =
      currentYaw;


    targetPitch =
      currentPitch;


    /*
      Very short delay after spawn.

      The old versions waited 3 seconds.
      This starts movement after 500 ms.
    */

    setTimeout(() => {

      if (
        !isActive(generation)
      ) {
        return;
      }


      startMovementEngine(
        generation
      );

    }, 500);

  });


  // ====================================================
  // KICK
  // ====================================================

  bot.on('kicked', reason => {

    if (
      generation !== connectionGeneration
    ) {
      return;
    }


    lastKick =
      readable(reason);


    botStatus =
      'Kicked';


    console.log('');
    console.log('🚫 KICKED');
    console.log(lastKick);

  });


  // ====================================================
  // ERROR
  // ====================================================

  bot.on('error', error => {

    if (
      generation !== connectionGeneration
    ) {
      return;
    }


    lastError =
      error.message ||
      String(error);


    console.log('');
    console.error(
      `⚠️ ERROR: ${lastError}`
    );

  });


  // ====================================================
  // CONNECTION ENDED
  // ====================================================

  bot.on('end', reason => {

    if (
      generation !== connectionGeneration
    ) {
      return;
    }


    lastDisconnect =
      readable(
        reason || 'Unknown reason'
      );


    botStatus =
      'Disconnected — reconnect scheduled';


    currentBehavior =
      'Connection lost';


    connectedSince =
      null;


    console.log('');
    console.log(
      `⛔ Connection ended: ${lastDisconnect}`
    );


    stopMovement();


    /*
      IMPORTANT:

      There is NO intentional disconnect here.

      No bot.quit()
      No bot.end()
      No process.exit()
      No 20-minute timer

      This reconnect code runs ONLY if the existing
      Minecraft connection has already ended.
    */


    clearTimeout(
      reconnectTimer
    );


    reconnectTimer =
      setTimeout(() => {

        initBot();

      }, RECONNECT_DELAY);

  });

}


// ======================================================
// START MOVEMENT ENGINE
// ======================================================

function startMovementEngine(generation) {

  if (
    !isActive(generation)
  ) {
    return;
  }


  if (movementRunning) {
    return;
  }


  movementRunning =
    true;


  console.log(
    '🟢 Natural movement engine started'
  );


  chooseMovement(
    generation
  );


  scheduleJump(
    generation
  );


  schedulePunch(
    generation
  );


  chooseHeadTarget(
    generation
  );


  smoothHeadMovement(
    generation
  );

}


// ======================================================
// MOVEMENT PROFILES
// ======================================================

const movementProfiles = [

  {
    name: 'Walking forward',
    controls: ['forward'],
    weight: 22
  },

  {
    name: 'Moving forward-left',
    controls: ['forward', 'left'],
    weight: 17
  },

  {
    name: 'Moving forward-right',
    controls: ['forward', 'right'],
    weight: 17
  },

  {
    name: 'Strafing left',
    controls: ['left'],
    weight: 8
  },

  {
    name: 'Strafing right',
    controls: ['right'],
    weight: 8
  },

  {
    name: 'Backing left',
    controls: ['back', 'left'],
    weight: 5
  },

  {
    name: 'Backing right',
    controls: ['back', 'right'],
    weight: 5
  },

  {
    name: 'Walking backward',
    controls: ['back'],
    weight: 4
  }

];


// ======================================================
// CONTINUOUS LONG MOVEMENT
// ======================================================

function chooseMovement(generation) {

  if (
    !movementActive(generation)
  ) {
    return;
  }


  /*
    Reset only directional movement.

    Jumping and punching are separate systems,
    so they can overlap naturally.
  */

  setControl(
    'forward',
    false
  );

  setControl(
    'back',
    false
  );

  setControl(
    'left',
    false
  );

  setControl(
    'right',
    false
  );

  setControl(
    'sprint',
    false
  );

  setControl(
    'sneak',
    false
  );


  let selected;

  let attempts = 0;


  /*
    Avoid any of the previous 3 movements.

    This dramatically reduces obvious repetition.
  */

  do {

    selected =
      weightedChoice(
        movementProfiles
      );


    attempts++;

  } while (

    recentMovementNames.includes(
      selected.name
    ) &&

    attempts < 30

  );


  recentMovementNames.push(
    selected.name
  );


  if (
    recentMovementNames.length > 3
  ) {

    recentMovementNames.shift();

  }


  /*
    Apply the movement controls.
  */

  for (
    const control of selected.controls
  ) {

    setControl(
      control,
      true
    );

  }


  /*
    Occasional sprint.

    Only possible when moving forward.
  */

  const movingForward =
    selected.controls.includes(
      'forward'
    );


  if (
    movingForward &&
    Math.random() < 0.20
  ) {

    setControl(
      'sprint',
      true
    );


    currentBehavior =
      `${selected.name} + sprint`;

  }

  else {

    currentBehavior =
      selected.name;

  }


  /*
    Long movement phases.

    7–18 seconds.

    There is NO automatic standing-still phase.
  */

  const duration =
    randomInt(
      7000,
      18000
    );


  movementTimer =
    setTimeout(() => {

      chooseMovement(
        generation
      );

    }, duration);

}


// ======================================================
// INDEPENDENT JUMPING
// ======================================================

function scheduleJump(generation) {

  if (
    !movementActive(generation)
  ) {
    return;
  }


  /*
    Uneven jump timing.

    Because this is independent from walking,
    she can jump while moving diagonally,
    sprinting, turning her head, etc.
  */

  const delay =
    randomInt(
      3500,
      14000
    );


  jumpTimer =
    setTimeout(() => {

      if (
        !movementActive(generation)
      ) {
        return;
      }


      setControl(
        'jump',
        true
      );


      setTimeout(() => {

        if (
          !isActive(generation)
        ) {
          return;
        }


        setControl(
          'jump',
          false
        );

      }, randomInt(250, 500));


      scheduleJump(
        generation
      );

    }, delay);

}


// ======================================================
// RANDOM ARM SWINGS
// ======================================================

function schedulePunch(generation) {

  if (
    !movementActive(generation)
  ) {
    return;
  }


  const delay =
    randomInt(
      3000,
      15000
    );


  punchTimer =
    setTimeout(() => {

      if (
        !movementActive(generation)
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
        Sometimes do another swing shortly afterward.

        Not every time.
      */

      if (
        Math.random() < 0.15
      ) {

        setTimeout(() => {

          if (
            !isActive(generation)
          ) {
            return;
          }


          try {

            bot.swingArm(
              'right'
            );

          } catch {}

        }, randomInt(350, 1000));

      }


      schedulePunch(
        generation
      );

    }, delay);

}


// ======================================================
// HEAD TARGET SELECTION
// ======================================================

function chooseHeadTarget(generation) {

  if (
    !movementActive(generation)
  ) {
    return;
  }


  const roll =
    Math.random();


  let turnAmount;


  /*
    68% small turns
    26% medium turns
    6% large turns
  */

  if (roll < 0.68) {

    turnAmount =
      randomBetween(
        8,
        35
      );

  }

  else if (roll < 0.94) {

    turnAmount =
      randomBetween(
        35,
        85
      );

  }

  else {

    turnAmount =
      randomBetween(
        85,
        150
      );

  }


  /*
    Random left/right direction.
  */

  if (
    Math.random() < 0.5
  ) {

    turnAmount *= -1;

  }


  targetYaw =
    normalizeAngle(

      currentYaw +

      degreesToRadians(
        turnAmount
      )

    );


  targetPitch =
    degreesToRadians(

      randomBetween(
        -20,
        18
      )

    );


  /*
    Uneven timing between gaze targets.
  */

  headTargetTimer =
    setTimeout(() => {

      chooseHeadTarget(
        generation
      );

    }, randomInt(1800, 7500));

}


// ======================================================
// SMOOTH HEAD MOVEMENT
// ======================================================

function smoothHeadMovement(generation) {

  if (
    !movementActive(generation)
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

    This updates every 50 ms instead of instantly
    snapping the head.
  */

  currentYaw +=
    yawDifference * 0.045;


  currentPitch +=
    pitchDifference * 0.045;


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

      smoothHeadMovement(
        generation
      );

    }, 50);

}


// ======================================================
// STOP MOVEMENT
// ======================================================

function stopMovement() {

  movementRunning =
    false;


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

    } catch {}

  }

}


// ======================================================
// CONTROL HELPER
// ======================================================

function setControl(control, state) {

  if (!bot) return;


  try {

    bot.setControlState(
      control,
      state
    );

  } catch {}

}


// ======================================================
// CONNECTION CHECKS
// ======================================================

function isActive(generation) {

  return (

    generation === connectionGeneration &&

    bot &&

    bot.entity

  );

}


function movementActive(generation) {

  return (

    isActive(generation) &&

    movementRunning

  );

}


// ======================================================
// WEIGHTED RANDOM SELECTION
// ======================================================

function weightedChoice(options) {

  const totalWeight =
    options.reduce(

      (total, option) =>
        total + option.weight,

      0

    );


  let roll =
    Math.random() *
    totalWeight;


  for (
    const option of options
  ) {

    roll -=
      option.weight;


    if (
      roll <= 0
    ) {

      return option;

    }

  }


  return options[
    options.length - 1
  ];

}


// ======================================================
// HELPERS
// ======================================================

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


// ======================================================
// START
// ======================================================

initBot();