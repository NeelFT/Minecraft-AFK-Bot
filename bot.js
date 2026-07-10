
const mineflayer = require('mineflayer');
const express = require('express');
const config = require('./config.json');


// ==================================================
// SETTINGS
// ==================================================

const WEB_PORT = process.env.PORT || 10000;

const SERVER_HOST = 'balashark.aternos.host';
const SERVER_PORT = 11625;

// Only used AFTER a real disconnect.
// This does not disconnect the bot.
const RECONNECT_DELAY = 30000;


// ==================================================
// WEB SERVER
// ==================================================

const app = express();

let bot = null;

let botStatus = 'Starting';
let currentBehavior = 'Waiting';

let connectionStartedAt = null;
let connectionCompletedAt = null;
let connectedSince = null;
let lastConnectionTime = null;

let lastError = 'None';
let lastKick = 'None';
let lastDisconnect = 'None';


// ==================================================
// STATUS PAGE
// ==================================================

app.get('/', (req, res) => {

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
  padding: 24px;
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
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
}

.item {
  margin-top: 13px;
  word-break: break-word;
}

.timer {
  font-size: 20px;
  font-weight: bold;
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

⏳ Connection timer:

<span
  class="timer"
  id="connectionTimer"
>
Calculating...
</span>

</div>


<div class="item">

⚡ Last successful connection time:

${
  lastConnectionTime === null
    ? 'No successful connection yet'
    : formatMilliseconds(lastConnectionTime)
}

</div>


<div class="item">

⏱ Connected uptime:

<span id="uptime">
Calculating...
</span>

</div>


<div class="item">

🏃 Current behavior:

${escapeHtml(currentBehavior)}

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


<script>

const connectionStartedAt =
  ${connectionStartedAt || 'null'};

const connectionCompletedAt =
  ${connectionCompletedAt || 'null'};

const connectedSince =
  ${connectedSince || 'null'};


function formatTime(ms) {

  if (ms < 0) ms = 0;

  const totalSeconds =
    Math.floor(ms / 1000);

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  const tenths =
    Math.floor((ms % 1000) / 100);


  return (
    minutes +
    'm ' +
    seconds +
    '.' +
    tenths +
    's'
  );

}


function updateTimers() {

  const now = Date.now();

  const connectionTimer =
    document.getElementById(
      'connectionTimer'
    );


  if (
    connectionStartedAt &&
    !connectionCompletedAt
  ) {

    connectionTimer.textContent =
      formatTime(
        now - connectionStartedAt
      );

  }

  else if (
    connectionStartedAt &&
    connectionCompletedAt
  ) {

    connectionTimer.textContent =
      formatTime(
        connectionCompletedAt -
        connectionStartedAt
      ) + ' ✓';

  }

  else {

    connectionTimer.textContent =
      'Not started';

  }


  const uptime =
    document.getElementById(
      'uptime'
    );


  if (connectedSince) {

    uptime.textContent =
      formatTime(
        now - connectedSince
      );

  }

  else {

    uptime.textContent =
      'Not connected';

  }

}


updateTimers();

setInterval(
  updateTimers,
  100
);

</script>

</body>

</html>
  `);

});


// ==================================================
// HEALTH ENDPOINT
// ==================================================

app.get('/health', (req, res) => {

  res.status(200).json({

    web: 'online',

    status: botStatus,

    behavior: currentBehavior,

    server:
      `${SERVER_HOST}:${SERVER_PORT}`,

    connectionStartedAt,

    connectionCompletedAt,

    lastConnectionTime,

    connectedSince,

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
      `🌐 Web server listening on port ${WEB_PORT}`
    );

  }
);


// ==================================================
// BOT ENGINE STATE
// ==================================================

let sessionId = 0;

let reconnectTimer = null;

let movementTimer = null;

let jumpTimer = null;
let jumpReleaseTimer = null;

let punchTimer = null;
let secondPunchTimer = null;

let headTargetTimer = null;
let headLoopTimer = null;

let currentYaw = 0;
let currentPitch = 0;

let targetYaw = 0;
let targetPitch = 0;

let lastMovement = null;


// ==================================================
// START BOT
// ==================================================

function startBot() {

  sessionId++;

  const mySession =
    sessionId;


  connectionStartedAt =
    Date.now();

  connectionCompletedAt =
    null;

  connectedSince =
    null;


  botStatus =
    'Connecting';

  currentBehavior =
    'Waiting for connection';


  console.log('');

  console.log(
    '===================================='
  );

  console.log(
    '🤖 Starting Minecraft bot...'
  );

  console.log(
    `🌍 ${SERVER_HOST}:${SERVER_PORT}`
  );

  console.log(
    `👤 ${config.botUsername}`
  );

  console.log(
    '===================================='
  );


  // ==================================================
  // CONNECTION
  // ==================================================

  bot = mineflayer.createBot({

    host: SERVER_HOST,

    port: SERVER_PORT,

    username:
      config.botUsername,

    auth:
      'offline',

    version:
      false,

    viewDistance:
      config.botChunk

  });


  // ==================================================
  // TCP CONNECTED
  // ==================================================

  bot.on('connect', () => {

    if (
      mySession !== sessionId
    ) {
      return;
    }


    botStatus =
      'TCP connected';


    console.log(
      '🔌 TCP connected.'
    );

  });


  // ==================================================
  // LOGIN
  // ==================================================

  bot.on('login', () => {

    if (
      mySession !== sessionId
    ) {
      return;
    }


    botStatus =
      'Logged in — waiting for spawn';


    console.log(
      '📡 Login successful.'
    );

  });


  // ==================================================
  // SPAWN
  // ==================================================

  bot.on('spawn', () => {

    if (
      mySession !== sessionId
    ) {
      return;
    }


    connectionCompletedAt =
      Date.now();


    lastConnectionTime =
      connectionCompletedAt -
      connectionStartedAt;


    connectedSince =
      Date.now();


    botStatus =
      'Spawned and active';


    currentBehavior =
      'Starting movement';


    lastError =
      'None';


    console.log(
      `✅ ${config.botUsername} spawned.`
    );


    console.log(
      `⚡ Connection took ${formatMilliseconds(lastConnectionTime)}`
    );


    stopMovementLoops();


    try {

      bot.clearControlStates();

      bot.setControlState(
        'sneak',
        false
      );

    }

    catch {}


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
        !isSessionActive(
          mySession
        )
      ) {
        return;
      }


      console.log(
        '🟢 Movement systems started.'
      );


      chooseMovement(
        mySession
      );

      scheduleJump(
        mySession
      );

      schedulePunch(
        mySession
      );

      chooseHeadTarget(
        mySession
      );

      smoothHeadLoop(
        mySession
      );


    }, 500);

  });


  // ==================================================
  // KICK
  // ==================================================

  bot.on('kicked', reason => {

    if (
      mySession !== sessionId
    ) {
      return;
    }


    lastKick =
      readable(reason);


    botStatus =
      'Kicked';


    console.log('');

    console.log(
      '🚫 BOT KICKED:'
    );

    console.log(
      lastKick
    );

  });


  // ==================================================
  // ERROR
  // ==================================================

  bot.on('error', err => {

    if (
      mySession !== sessionId
    ) {
      return;
    }


    lastError =
      err.message ||
      String(err);


    console.log('');

    console.error(
      '⚠️ BOT ERROR:'
    );

    console.error(
      err
    );

  });


  // ==================================================
  // DISCONNECTED
  // ==================================================

  bot.on('end', reason => {

    if (
      mySession !== sessionId
    ) {
      return;
    }


    lastDisconnect =
      readable(
        reason ||
        'Unknown reason'
      );


    connectedSince =
      null;


    botStatus =
      'Disconnected — reconnect scheduled';


    currentBehavior =
      'Disconnected';


    console.log('');

    console.log(
      `⛔ Disconnected: ${lastDisconnect}`
    );


    stopMovementLoops();


    clearTimeout(
      reconnectTimer
    );


    console.log(
      `🔄 Reconnecting in ${RECONNECT_DELAY / 1000} seconds...`
    );


    reconnectTimer =
      setTimeout(() => {

        startBot();

      }, RECONNECT_DELAY);

  });

}


// ==================================================
// MOVEMENT OPTIONS
// ==================================================

const movements = [

  {
    name: 'Walking forward',
    controls: ['forward'],
    weight: 24
  },

  {
    name: 'Moving forward-left',
    controls: ['forward', 'left'],
    weight: 20
  },

  {
    name: 'Moving forward-right',
    controls: ['forward', 'right'],
    weight: 20
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


// ==================================================
// CONTINUOUS MOVEMENT
// ==================================================

function chooseMovement(
  mySession
) {

  if (
    !isSessionActive(
      mySession
    )
  ) {
    return;
  }


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


  do {

    selected =
      weightedChoice(
        movements
      );

  } while (
    selected.name ===
    lastMovement
  );


  lastMovement =
    selected.name;


  for (
    const control
    of selected.controls
  ) {

    setControl(
      control,
      true
    );

  }


  if (

    selected.controls.includes(
      'forward'
    ) &&

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
    Long movement periods.
    No intentional pause.
  */

  const duration =
    randomInt(
      6000,
      15000
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

function scheduleJump(
  mySession
) {

  if (
    !isSessionActive(
      mySession
    )
  ) {
    return;
  }


  jumpTimer =
    setTimeout(() => {

      if (
        !isSessionActive(
          mySession
        )
      ) {
        return;
      }


      setControl(
        'jump',
        true
      );


      jumpReleaseTimer =
        setTimeout(() => {

          if (
            !isSessionActive(
              mySession
            )
          ) {
            return;
          }


          setControl(
            'jump',
            false
          );


        }, randomInt(
          250,
          500
        ));


      scheduleJump(
        mySession
      );


    }, randomInt(
      3000,
      12000
    ));

}


// ==================================================
// PUNCH SYSTEM
// ==================================================

function schedulePunch(
  mySession
) {

  if (
    !isSessionActive(
      mySession
    )
  ) {
    return;
  }


  punchTimer =
    setTimeout(() => {

      if (
        !isSessionActive(
          mySession
        )
      ) {
        return;
      }


      try {

        bot.swingArm(

          Math.random() < 0.9
            ? 'right'
            : 'left'

        );

      }

      catch {}


      if (
        Math.random() < 0.15
      ) {

        secondPunchTimer =
          setTimeout(() => {

            if (
              !isSessionActive(
                mySession
              )
            ) {
              return;
            }


            try {

              bot.swingArm(
                'right'
              );

            }

            catch {}


          }, randomInt(
            350,
            1000
          ));

      }


      schedulePunch(
        mySession
      );


    }, randomInt(
      3000,
      14000
    ));

}


// ==================================================
// HEAD TARGET SYSTEM
// ==================================================

function chooseHeadTarget(
  mySession
) {

  if (
    !isSessionActive(
      mySession
    )
  ) {
    return;
  }


  const roll =
    Math.random();


  let maxTurn;


  if (
    roll < 0.68
  ) {

    maxTurn = 35;

  }

  else if (
    roll < 0.94
  ) {

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
        -22,
        20
      )

    );


  headTargetTimer =
    setTimeout(() => {

      chooseHeadTarget(
        mySession
      );

    }, randomInt(
      1800,
      7000
    ));

}


// ==================================================
// SMOOTH HEAD MOVEMENT
// ==================================================

function smoothHeadLoop(
  mySession
) {

  if (
    !isSessionActive(
      mySession
    )
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


  const smoothing =
    randomBetween(
      0.035,
      0.065
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

      typeof result.catch ===
        'function'

    ) {

      result.catch(
        () => {}
      );

    }

  }

  catch {}


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

function isSessionActive(
  mySession
) {

  return (

    mySession === sessionId &&

    bot &&

    bot.entity

  );

}


// ==================================================
// CONTROL HELPER
// ==================================================

function setControl(
  control,
  state
) {

  if (!bot) return;


  try {

    bot.setControlState(
      control,
      state
    );

  }

  catch {}

}


// ==================================================
// CLEANUP
// ==================================================

function stopMovementLoops() {

  clearTimeout(
    movementTimer
  );

  clearTimeout(
    jumpTimer
  );

  clearTimeout(
    jumpReleaseTimer
  );

  clearTimeout(
    punchTimer
  );

  clearTimeout(
    secondPunchTimer
  );

  clearTimeout(
    headTargetTimer
  );

  clearTimeout(
    headLoopTimer
  );


  movementTimer = null;

  jumpTimer = null;

  jumpReleaseTimer = null;

  punchTimer = null;

  secondPunchTimer = null;

  headTargetTimer = null;

  headLoopTimer = null;


  if (bot) {

    try {

      bot.clearControlStates();

    }

    catch {}

  }

}


// ==================================================
// WEIGHTED RANDOM CHOICE
// ==================================================

function weightedChoice(
  options
) {

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


// ==================================================
// HELPERS
// ==================================================

function randomInt(
  min,
  max
) {

  return Math.floor(

    Math.random() *
    (max - min + 1)

  ) + min;

}


function randomBetween(
  min,
  max
) {

  return (

    Math.random() *
    (max - min) +
    min

  );

}


function degreesToRadians(
  degrees
) {

  return (

    degrees *
    Math.PI /
    180

  );

}


function normalizeAngle(
  angle
) {

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


function readable(
  value
) {

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


function formatMilliseconds(
  milliseconds
) {

  const seconds =
    Math.floor(
      milliseconds / 1000
    );


  const minutes =
    Math.floor(
      seconds / 60
    );


  const remainingSeconds =
    seconds % 60;


  const ms =
    milliseconds % 1000;


  return (
    `${minutes}m ` +
    `${remainingSeconds}.` +
    `${String(ms).padStart(3, '0')}s`
  );

}


function escapeHtml(
  value
) {

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