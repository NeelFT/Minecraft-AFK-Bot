const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');

const app = express();
const WEB_PORT = process.env.PORT || 10000;
const RECONNECT_DELAY = 15000;


// ======================================================
// STATE
// ======================================================

let bot = null;

let status = 'Starting';
let behavior = 'None';
let connectedSince = null;

let lastError = 'None';
let lastKick = 'None';
let lastDisconnect = 'None';

let generation = 0;
let engineRunning = false;

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

let recentMovements = [];


// ======================================================
// WEB STATUS PAGE
// ======================================================

app.get('/', (req, res) => {

  const uptime = connectedSince
    ? formatTime(Date.now() - connectedSince)
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
Status: ${safe(status)}
</div>

<div class="item">
🏃 Behavior: ${safe(behavior)}
</div>

<div class="item">
🌍 Server:
${safe(config.serverHost)}:${safe(config.serverPort)}
</div>

<div class="item">
👤 Username:
${safe(config.botUsername)}
</div>

<div class="item">
⏱ Uptime:
${safe(uptime)}
</div>

<div class="item">
⚠️ Last error:
${safe(lastError)}
</div>

<div class="item">
🚫 Last kick:
${safe(lastKick)}
</div>

<div class="item">
🔌 Last disconnect:
${safe(lastDisconnect)}
</div>

</div>

</body>

</html>
  `);
});


app.get('/health', (req, res) => {

  res.status(200).json({

    web: 'online',

    status,

    behavior,

    connected:
      status === 'Spawned and active',

    uptime:
      connectedSince
        ? Date.now() - connectedSince
        : null,

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
// CREATE BOT
// ======================================================

function startBot() {

  generation++;

  const myGeneration = generation;

  status = 'Connecting';
  behavior = 'Waiting for connection';

  console.log('');
  console.log('====================================');
  console.log('🤖 Starting bot');
  console.log(
    `🌍 ${config.serverHost}:${config.serverPort}`
  );
  console.log(
    `👤 ${config.botUsername}`
  );
  console.log('====================================');


  // IMPORTANT:
  // This is the connection structure that worked before.

  bot = mineflayer.createBot({

    host: config.serverHost,

    port: Number(config.serverPort),

    username: config.botUsername,

    auth: 'offline',

    version: false,

    viewDistance: config.botChunk

  });


  // ====================================================
  // CONNECT
  // ====================================================

  bot.on('connect', () => {

    if (myGeneration !== generation) return;

    status = 'TCP connected';

    console.log(
      '🔌 TCP connected'
    );

  });


  // ====================================================
  // LOGIN
  // ====================================================

  bot.on('login', () => {

    if (myGeneration !== generation) return;

    status =
      'Logged in — waiting for spawn';

    console.log(
      '📡 Login successful'
    );

  });


  // ====================================================
  // SPAWN
  // ====================================================

  bot.on('spawn', () => {

    if (myGeneration !== generation) return;


    console.log(
      `✅ ${config.botUsername} spawned`
    );


    status =
      'Spawned and active';

    behavior =
      'Preparing movement';

    connectedSince =
      Date.now();

    lastError =
      'None';


    // Kill any previous behavior timers first.

    stopBehavior();


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


    setTimeout(() => {

      if (
        myGeneration !== generation ||
        !bot ||
        !bot.entity
      ) {
        return;
      }


      startBehavior(
        myGeneration
      );

    }, 1500);

  });


  // ====================================================
  // KICK
  // ====================================================

  bot.on('kicked', reason => {

    if (myGeneration !== generation) return;


    lastKick =
      readable(reason);

    status =
      'Kicked';


    console.log('');
    console.log('🚫 KICKED:');
    console.log(lastKick);

  });


  // ====================================================
  // ERROR
  // ====================================================

  bot.on('error', error => {

    if (myGeneration !== generation) return;


    lastError =
      error?.message ||
      String(error);


    console.log('');
    console.log(
      `⚠️ ERROR: ${lastError}`
    );

  });


  // ====================================================
  // CONNECTION END
  // ====================================================

  bot.on('end', reason => {

    if (myGeneration !== generation) return;


    lastDisconnect =
      readable(
        reason || 'Unknown reason'
      );


    connectedSince =
      null;

    status =
      'Disconnected — reconnect scheduled';

    behavior =
      'Disconnected';


    console.log('');
    console.log(
      `⛔ Connection ended: ${lastDisconnect}`
    );


    stopBehavior();


    clearTimeout(
      reconnectTimer
    );


    reconnectTimer =
      setTimeout(() => {

        startBot();

      }, RECONNECT_DELAY);

  });

}


// ======================================================
// START BEHAVIOR ENGINE
// ======================================================

function startBehavior(myGeneration) {

  if (
    !isActive(myGeneration) ||
    engineRunning
  ) {
    return;
  }


  engineRunning =
    true;


  console.log(
    '🟢 Behavior engine started'
  );


  chooseMovement(
    myGeneration
  );

  scheduleJump(
    myGeneration
  );

  schedulePunch(
    myGeneration
  );

  chooseHeadTarget(
    myGeneration
  );

  smoothHeadLoop(
    myGeneration
  );

}


// ======================================================
// MOVEMENT OPTIONS
// ======================================================

const movementOptions = [

  {
    id: 'forward',
    name: 'Walking forward',
    controls: ['forward'],
    weight: 24
  },

  {
    id: 'forwardLeft',
    name: 'Walking diagonally left',
    controls: ['forward', 'left'],
    weight: 18
  },

  {
    id: 'forwardRight',
    name: 'Walking diagonally right',
    controls: ['forward', 'right'],
    weight: 18
  },

  {
    id: 'left',
    name: 'Strafing left',
    controls: ['left'],
    weight: 8
  },

  {
    id: 'right',
    name: 'Strafing right',
    controls: ['right'],
    weight: 8
  },

  {
    id: 'backLeft',
    name: 'Backing diagonally left',
    controls: ['back', 'left'],
    weight: 5
  },

  {
    id: 'backRight',
    name: 'Backing diagonally right',
    controls: ['back', 'right'],
    weight: 5
  },

  {
    id: 'back',
    name: 'Walking backward',
    controls: ['back'],
    weight: 4
  },

  {
    id: 'pause',
    name: 'Brief pause',
    controls: [],
    weight: 1
  }

];


// ======================================================
// LONG CONTINUOUS MOVEMENT
// ======================================================

function chooseMovement(myGeneration) {

  if (!behaviorActive(myGeneration)) {
    return;
  }


  resetMovementControls();


  let choice = null;

  let attempts = 0;


  // Avoid recent repetition.

  do {

    choice =
      weightedChoice(
        movementOptions
      );

    attempts++;

  } while (

    recentMovements.includes(
      choice.id
    ) &&

    attempts < 20

  );


  recentMovements.push(
    choice.id
  );


  // Remember previous 3 movements.

  if (
    recentMovements.length > 3
  ) {

    recentMovements.shift();

  }


  for (
    const control of choice.controls
  ) {

    bot.setControlState(
      control,
      true
    );

  }


  // Occasional sprint while moving forward.

  const canSprint =
    choice.controls.includes(
      'forward'
    );


  if (
    canSprint &&
    Math.random() < 0.16
  ) {

    bot.setControlState(
      'sprint',
      true
    );


    behavior =
      `${choice.name} + sprinting`;

  }

  else {

    behavior =
      choice.name;

  }


  let duration;


  if (
    choice.id === 'pause'
  ) {

    // Very short, rare pause.

    duration =
      randomInt(
        700,
        1800
      );

  }

  else {

    // Long movement periods.

    duration =
      randomInt(
        6000,
        16000
      );

  }


  movementTimer =
    setTimeout(() => {

      chooseMovement(
        myGeneration
      );

    }, duration);

}


// ======================================================
// JUMP SYSTEM
// ======================================================

function scheduleJump(myGeneration) {

  if (!behaviorActive(myGeneration)) {
    return;
  }


  const delay =
    randomInt(
      4000,
      15000
    );


  jumpTimer =
    setTimeout(() => {

      if (!behaviorActive(myGeneration)) {
        return;
      }


      try {

        bot.setControlState(
          'jump',
          true
        );


        setTimeout(() => {

          if (!isActive(myGeneration)) {
            return;
          }


          try {

            bot.setControlState(
              'jump',
              false
            );

          } catch {}

        }, randomInt(250, 500));


      } catch {}


      scheduleJump(
        myGeneration
      );

    }, delay);

}


// ======================================================
// PUNCH SYSTEM
// ======================================================

function schedulePunch(myGeneration) {

  if (!behaviorActive(myGeneration)) {
    return;
  }


  const delay =
    randomInt(
      3500,
      16000
    );


  punchTimer =
    setTimeout(() => {

      if (!behaviorActive(myGeneration)) {
        return;
      }


      try {

        bot.swingArm(
          Math.random() < 0.92
            ? 'right'
            : 'left'
        );

      } catch {}


      // Occasional second swing.

      if (
        Math.random() < 0.13
      ) {

        setTimeout(() => {

          if (!isActive(myGeneration)) {
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
        myGeneration
      );

    }, delay);

}


// ======================================================
// HEAD TARGET SELECTION
// ======================================================

function chooseHeadTarget(myGeneration) {

  if (!behaviorActive(myGeneration)) {
    return;
  }


  const roll =
    Math.random();


  let turnSize;


  if (roll < 0.72) {

    turnSize =
      randomBetween(
        8,
        35
      );

  }

  else if (roll < 0.95) {

    turnSize =
      randomBetween(
        35,
        85
      );

  }

  else {

    turnSize =
      randomBetween(
        85,
        145
      );

  }


  if (
    Math.random() < 0.5
  ) {

    turnSize *= -1;

  }


  targetYaw =
    normalizeAngle(

      currentYaw +

      degreesToRadians(
        turnSize
      )

    );


  targetPitch =
    degreesToRadians(

      randomBetween(
        -18,
        16
      )

    );


  headTargetTimer =
    setTimeout(() => {

      chooseHeadTarget(
        myGeneration
      );

    }, randomInt(2500, 9000));

}


// ======================================================
// SMOOTH HEAD MOVEMENT
// ======================================================

function smoothHeadLoop(myGeneration) {

  if (!behaviorActive(myGeneration)) {
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


  // Constant smoothing gives genuinely smooth movement.

  currentYaw +=
    yawDifference * 0.04;


  currentPitch +=
    pitchDifference * 0.04;


  try {

    const lookResult =
      bot.look(

        currentYaw,

        currentPitch,

        true

      );


    if (
      lookResult &&
      typeof lookResult.catch === 'function'
    ) {

      lookResult.catch(
        () => {}
      );

    }

  } catch {}


  headLoopTimer =
    setTimeout(() => {

      smoothHeadLoop(
        myGeneration
      );

    }, 50);

}


// ======================================================
// RESET DIRECTIONAL CONTROLS
// ======================================================

function resetMovementControls() {

  if (!bot) return;


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

}


// ======================================================
// STOP BEHAVIOR
// ======================================================

function stopBehavior() {

  engineRunning =
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
// CHECKS
// ======================================================

function isActive(myGeneration) {

  return (

    myGeneration === generation &&

    bot !== null &&

    bot.entity !== null &&

    bot.entity !== undefined

  );

}


function behaviorActive(myGeneration) {

  return (

    isActive(myGeneration) &&

    engineRunning

  );

}


// ======================================================
// WEIGHTED RANDOM CHOICE
// ======================================================

function weightedChoice(options) {

  const total =
    options.reduce(

      (sum, option) =>
        sum + option.weight,

      0

    );


  let roll =
    Math.random() *
    total;


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


function formatTime(milliseconds) {

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


function safe(value) {

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

startBot();