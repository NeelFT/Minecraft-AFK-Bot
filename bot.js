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

const RECONNECT_DELAY = 30000;


// ==================================================
// BOT STATE
// ==================================================

let bot = null;

let movementTimer = null;
let jumpTimer = null;
let jumpReleaseTimer = null;

let punchTimer = null;
let secondPunchTimer = null;

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
  console.log(
    `🌍 ${config.serverHost}:${config.serverPort}`
  );
  console.log(
    `👤 ${config.botUsername}`
  );
  console.log('====================================');


  // ==================================================
  // CONNECTION BLOCK
  // ==================================================

  bot = mineflayer.createBot({

    host: config.serverHost,

    port: config.serverPort,

    username: config.botUsername,

    auth: 'offline',

    version: false,

    viewDistance: config.botChunk

  });


  // ================================================
  // CONNECTION EVENTS
  // ================================================

  bot.on('connect', () => {

    if (mySession !== sessionId) return;

    console.log(
      '🔌 TCP connected.'
    );

  });


  bot.on('login', () => {

    if (mySession !== sessionId) return;

    console.log(
      '📡 Login successful.'
    );

  });


  // ================================================
  // SPAWN
  // ================================================

  bot.on('spawn', () => {

    if (mySession !== sessionId) return;


    console.log(
      `✅ ${config.botUsername} spawned.`
    );


    /*
      Stop any leftover movement timers before
      starting a fresh movement session.
    */

    stopLoops();


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

      if (
        mySession !== sessionId ||
        !bot ||
        !bot.entity
      ) {
        return;
      }


      console.log(
        '🟢 Continuous movement systems started.'
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


    }, 3000);

  });


  // ================================================
  // LOGGING
  // ================================================

  bot.on('kicked', reason => {

    if (mySession !== sessionId) return;


    console.log('');

    console.log(
      '🚫 BOT KICKED:'
    );


    try {

      console.log(

        typeof reason === 'string'

          ? reason

          : JSON.stringify(
              reason,
              null,
              2
            )

      );

    }

    catch {

      console.log(
        reason
      );

    }

  });


  bot.on('error', err => {

    if (mySession !== sessionId) return;


    console.log('');

    console.error(
      '⚠️ BOT ERROR:'
    );

    console.error(
      err
    );

  });


  // ================================================
  // RECONNECT
  // ================================================

  bot.on('end', reason => {

    if (mySession !== sessionId) return;


    console.log('');

    console.log(

      `⛔ Disconnected: ${
        reason || 'Unknown reason'
      }`

    );


    stopLoops();


    clearTimeout(
      reconnectTimer
    );


    console.log(

      `🔄 Reconnecting in ${
        RECONNECT_DELAY / 1000
      } seconds...`

    );


    reconnectTimer =
      setTimeout(() => {

        startBot();

      }, RECONNECT_DELAY);

  });

}


// ==================================================
// MOVEMENT SYSTEM
// ==================================================

function chooseMovement(mySession) {

  if (
    !isSessionActive(mySession)
  ) {
    return;
  }


  /*
    Only reset directional movement.

    Jumping stays independent.
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


  const roll =
    Math.random();


  // Forward

  if (roll < 0.22) {

    bot.setControlState(
      'forward',
      true
    );

  }


  // Forward-left diagonal

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


  // Forward-right diagonal

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


  // Backward

  else if (roll < 0.94) {

    bot.setControlState(
      'back',
      true
    );

  }


  /*
    6% chance of a pause.

    The pause lasts for the same randomized
    movement duration below.
  */


  // Occasional sprint

  if (

    bot.getControlState(
      'forward'
    ) &&

    Math.random() < 0.20

  ) {

    bot.setControlState(
      'sprint',
      true
    );

  }


  /*
    Movement duration from the version you liked.
  */

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
// INDEPENDENT JUMP SYSTEM
// ==================================================

function scheduleJump(mySession) {

  if (
    !isSessionActive(mySession)
  ) {
    return;
  }


  const delay =
    randomInt(
      2500,
      10000
    );


  jumpTimer =
    setTimeout(() => {

      if (
        !isSessionActive(mySession)
      ) {
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


      clearTimeout(
        jumpReleaseTimer
      );


      jumpReleaseTimer =
        setTimeout(() => {

          if (
            !isSessionActive(mySession)
          ) {
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
// INDEPENDENT ARM SWING SYSTEM
// ==================================================

function schedulePunch(mySession) {

  if (
    !isSessionActive(mySession)
  ) {
    return;
  }


  const delay =
    randomInt(
      3000,
      14000
    );


  punchTimer =
    setTimeout(() => {

      if (
        !isSessionActive(mySession)
      ) {
        return;
      }


      try {

        bot.swingArm(

          Math.random() < 0.85

            ? 'right'

            : 'left'

        );

      }

      catch {}


      /*
        Occasional second swing.
      */

      if (
        Math.random() < 0.18
      ) {

        clearTimeout(
          secondPunchTimer
        );


        secondPunchTimer =
          setTimeout(() => {

            if (
              !isSessionActive(mySession)
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
            300,
            900
          ));

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

  if (
    !isSessionActive(mySession)
  ) {
    return;
  }


  let maxTurn;


  const turnRoll =
    Math.random();


  if (
    turnRoll < 0.65
  ) {

    maxTurn = 35;

  }

  else if (
    turnRoll < 0.90
  ) {

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
// SMOOTH HEAD LOOP
// ==================================================

function smoothHeadLoop(mySession) {

  if (
    !isSessionActive(mySession)
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

    const lookPromise =
      bot.look(

        currentYaw,

        currentPitch,

        true

      );


    if (

      lookPromise &&

      typeof lookPromise.catch ===
        'function'

    ) {

      lookPromise.catch(
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


// ==================================================
// START
// ==================================================

startBot();