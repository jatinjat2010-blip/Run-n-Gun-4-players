/*
ENGINE STATUS:
- Core rules complete
- Scenarios validated
- Debug utilities preserved intentionally
- AI + visibility systems done
*/
// CONTRACT:
// Any function that causes a turn to pause MUST return true

let gameMode = "hvh"; // "hvh" | "hva" | "ava"
let aiTeam = null;   // "blue" | "red" | "yellow" | "green"
const PHASES = ["placement", "main", "gameover"];
const PLAYERS = ["blue", "red", "yellow", "green"];
let pendingRoll = null;
let resurrectionPending = null;
let pendingPostMovePower = null;
let gameWinner = null;
let finalRanking = [];
let finishedAllOrder = [];
let teamAllDeadAnnounced = {};
const BOARD_SIZE = 12;
const TEAM_CONFIG = {
  blue: { direction: "right" },
  red: { direction: "up" },
  yellow: { direction: "left" },
  green: { direction: "down" }
};
let DEBUG = false;
const barricades = []; 
let killedThisTurn = [];
const DEBUG_REVEAL_ALL = true;
let powerVisualSeq = 0;
let powerVisualEvents = [];
let noMoveSkipTimer = null;
let noMoveSkipPending = false;
let SIMULATION_SYNC_MODE = false;
let SIM_MAIN_TURN_COUNTER = 0;
let OBSERVER_TURNS_SINCE_PRINT = 0;
let LAST_MAIN_PHASE_FIRST_PLAYER = null;
const AI_MOVE_DELAY_MS = 1000;
const AI_DECISION_DELAY_MS = 1;
const AI_PLACEMENT_DELAY_MS = 500;

function getAiDelayMs() {
  return AI_MOVE_DELAY_MS;
}
function getAiDecisionDelayMs() {
  return AI_DECISION_DELAY_MS;
}
function getAiPlacementDelayMs() {
  return AI_PLACEMENT_DELAY_MS;
}
function getAiPreRollDelayMs() {
  // Keep short think pause before roll.
  return Math.max(100, Math.floor(getAiDelayMs() * 0.2));
}
function getAiPostRollDelayMs() {
  // Keep roll visible for most of the turn delay.
  return Math.max(200, getAiDelayMs() - getAiPreRollDelayMs());
}

function scheduleAction(fn, delayMs) {
  if (SIMULATION_SYNC_MODE) {
    fn();
    return null;
  }
  return setTimeout(fn, delayMs);
}
/**********************
 * AI PREFERENCES (The "Brain")
 **********************/
// Source: 11.txt - Rows sum to 100
const LANE_WEIGHTS = {
  1: [10, 7, 7, 5, 3, 3, 3, 5, 10, 10, 17, 20], // Runner (Edges)
  2: [2, 20, 18, 15, 8, 6, 4, 4, 8, 8, 5, 2],   // Barricade (Low/Escort)
  3: [2, 8, 8, 12, 12, 10, 11, 11, 10, 9, 5, 2],// Gun (High-Mid)
  4: [5, 11, 20, 17, 10, 10, 9, 5, 5, 4, 2, 2], // Freeze (Low/Escort)
  5: [2, 6, 8, 11, 16, 18, 12, 10, 7, 5, 3, 2]  // Nuke (Center)
};


let phase = "placement"; // "placement" | "main" | "end"

let placementFirstPlayer =
  PLAYERS[Math.floor(Math.random() * PLAYERS.length)];
let placementSecondPlayer = PLAYERS[(PLAYERS.indexOf(placementFirstPlayer) + 1) % PLAYERS.length];

let currentPlayer = placementFirstPlayer;
console.log("Welcome to Run'n Gun choose game mode");

let score = {
  blue: 0,
  red: 0,
  yellow: 0,
  green: 0
};

const FINISH_ALL_BONUS = [4, 3, 2, 0];

// Board: maps "x,y" -> soldier
let board = {};
// --- AI CONFIGURATION ---
let playerAI = {
    blue: "main",
    red: "main",
    yellow: "main",
    green: "main"
};

const AI_POLICIES = {
    // 🧠 1. MAIN AI (The Smart One)
    main: {
        place: function(team) { aiPlaceOneSoldier_Main(team); },
        play: function() { aiPlayTurn_Main(); },
        resurrect: function() { handleAIResurrection_Main(); },
        confirm: function() { handleAIConfirmation_Main(); }
    },
    main4: {
        place: function(team) { aiPlaceOneSoldier_Main(team); },
        play: function() { aiPlayTurn_Main4(); },
        resurrect: function() { handleAIResurrection_Main(); },
        confirm: function() { handleAIConfirmation_Main(); }
    },

    // 🎲 2. RANDOM AI (The Noise Baseline)
    random: {
        place: function(team) {
            const mySoldiers = soldiers.filter(s => s.team === team && s.state === "inventory");
            if (mySoldiers.length === 0) return;
            const s = mySoldiers[Math.floor(Math.random() * mySoldiers.length)];
            const lanes = getAvailableStartLanesForTeam(team);
            if (lanes.length === 0) return;
            placeSoldierOnStart(s, lanes[Math.floor(Math.random() * lanes.length)]);
            advancePlacementTurn();
        },
        play: function() {
            // A. Handle Pending States (The "Answer" Logic)
            if (resurrectionPending && resurrectionPending.team === currentPlayer) {
                 const choices = resurrectionPending.ids;
                 const id = choices[Math.floor(Math.random() * choices.length)];
                 const lanes = getAvailableStartLanesForTeam(currentPlayer);
                 resurrectSoldierChoice(id, lanes[Math.floor(Math.random() * lanes.length)]);
                 return;
            }
            if (pendingPostMovePower && pendingPostMovePower.soldier.team === currentPlayer) {
                // Randomly say Yes/No to freeze
                if (Math.random() < 0.5) {
                    const s = pendingPostMovePower.soldier;
                    applyFreeze(s);
                    s.powerUsed = true;
                    s.revealed = true;
                }
                pendingPostMovePower = null;
                endTurn();
                return;
            }

            // B. Decide: Power vs Move
            const legalPowers = getLegalPowers(currentPlayer);
            if (legalPowers.length > 0 && Math.random() < 0.5) {
                const s = legalPowers[Math.floor(Math.random() * legalPowers.length)];
                let p1 = null, p2 = null;
                if (s.id === 3) p1 = ["up", "down", "left", "right"][Math.floor(Math.random() * 4)];
                if (s.id === 5) p1 = ["vertical", "horizontal"][Math.floor(Math.random() * 2)];
                if (s.id === 2) {
                    p1 = ["vertical", "horizontal"][Math.floor(Math.random() * 2)];
                    p2 = ["forward", "backward"][Math.floor(Math.random() * 2)];
                }
                const powerUsed = takeTurnPower(currentPlayer, s.id, getTypeById(s.id), p1, p2);
                if (powerUsed) {
                    return;
                }
            }

            // C. Move
            if (pendingRoll === null) {
                const dice = rollDice();
                pendingRoll = dice;
                const legalMovesAfterRoll = getLegalMoves(currentPlayer, dice);
                if (legalMovesAfterRoll.length === 0) {
                    scheduleAction(() => endTurn(), getAiPostRollDelayMs());
                    return;
                }
                scheduleAction(aiPlayTurn, getAiPostRollDelayMs());
                return;
            }
            const legalMoves = getLegalMoves(currentPlayer, pendingRoll);
            
            if (legalMoves.length === 0) {
                endTurn();
                return;
            }

            const choice = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            
            // 🚨 FIX: Capture the return value!
            const keepOpen = takeTurnMovement(currentPlayer, choice.id, pendingRoll);
            
            // If game asks a question (Freeze? Resurrect?), trigger AI again immediately to answer it
            if (keepOpen) {
                scheduleAction(aiPlayTurn, 0); 
            }
        },
        resurrect: null, 
        confirm: null
    },

    // 🏃 3. GREEDY RUNNER (The Sprinter)
    greedy: {
        place: function(team) { AI_POLICIES.random.place(team); },
        play: function() {
            // A. Pending States
            if (resurrectionPending && resurrectionPending.team === currentPlayer) {
                 const id = Math.max(...resurrectionPending.ids); // Always revive strongest
                 const lanes = getAvailableStartLanesForTeam(currentPlayer);
                 const lane = lanes[Math.floor(Math.random() * lanes.length)];
                 resurrectSoldierChoice(id, lane); 
                 return;
            }
            if (pendingPostMovePower && pendingPostMovePower.soldier.team === currentPlayer) {
                // Greedy never pauses. Say NO to freeze.
                pendingPostMovePower = null;
                endTurn();
                return;
            }

            // B. Move (Always Roll)
            if (pendingRoll === null) {
                const dice = rollDice();
                pendingRoll = dice;
                const legalMovesAfterRoll = getLegalMoves(currentPlayer, dice);
                if (legalMovesAfterRoll.length === 0) {
                    scheduleAction(() => endTurn(), getAiPostRollDelayMs());
                    return;
                }
                scheduleAction(aiPlayTurn, getAiPostRollDelayMs());
                return;
            }
            
            const legalMoves = getLegalMoves(currentPlayer, pendingRoll);
            if (legalMoves.length === 0) {
                endTurn();
                return;
            }

            // Sort by ID descending
            legalMoves.sort((a, b) => b.id - a.id);
            const choice = legalMoves[0];
            
            // 🚨 FIX: Capture the return value!
            const keepOpen = takeTurnMovement(currentPlayer, choice.id, pendingRoll);
            
            // If game asks a question, trigger AI again to answer it
            if (keepOpen) {
                scheduleAction(aiPlayTurn, 0);
            }
        },
        resurrect: null,
        confirm: null
    }
    ,
    human: {
        place: function() {},
        play: function() {},
        resurrect: null,
        confirm: null
    },
    none: {
        place: function() {},
        play: function() {},
        resurrect: null,
        confirm: null
    }
};



/**********************
 * SOLDIERS (STATE MODEL)
 **********************/
let soldiers = [];

soldiers = createInitialSoldiers();

/**********************
 * Visiblity
 **********************/
function visibleName(soldier, viewerTeam) {
  const TEAM_CHAR = {
    blue: "B",
    red: "R",
    yellow: "Y",
    green: "G"
  };
  const teamChar = TEAM_CHAR[soldier.team] || "?";

  // Debug override
  if (DEBUG_REVEAL_ALL) {
    return teamChar + soldier.id;
  }

  // Own soldiers: always visible
  if (soldier.team === viewerTeam) {
    return teamChar + soldier.id;
  }

  // Opponent soldiers
  if (soldier.state === "board" && soldier.revealed) {
    return teamChar + soldier.id;
  }

  // Hidden identity
  return teamChar + "?";
}

function isVisibleToOpponent(soldier, viewerTeam) {
  if (soldier.team === viewerTeam) return true;
  return soldier.revealed === true;
}
function logVisible(viewerTeam, ...parts) {
  if (!DEBUG) return;

  const mapped = parts.map(p => {
    if (p && p.team && typeof p.id === "number") {
      return visibleName(p, viewerTeam);
    }
    return p;
  });

  console.log(...mapped);
}





/**********************
 * Powers
 **********************/
function isLoneSoldier(team) {
  const active = soldiers.filter(
    s =>
      s.team === team &&
      (s.state === "board" || s.state === "start")
  );
  return active.length === 1;
}

function cleanupPersistentEffects(sourceSoldier) {
  // ID-2 → remove ALL barricades owned by this soldier
  if (sourceSoldier.id === 2) {
    for (let i = barricades.length - 1; i >= 0; i--) {
      if (barricades[i].owner === sourceSoldier) {
        barricades.splice(i, 1);
      }
    }
  }

  // ID-4 → clear freeze
  if (sourceSoldier.id === 4) {
    clearFreezeFrom(sourceSoldier);
  }
}



/**********************
 * baricades
 **********************/
function blocksMovement(fromX, fromY, toX, toY, soldier) {
  // Lone survivor ignores barricades
  if (isLoneSoldier(soldier.team)) return false;

  // Only revealed ID-2 ignores barricades
  if (soldier.id === 2 && soldier.revealed) return false;

  for (const b of barricades) {

    // VERTICAL BARRICADE
    if (b.orientation === "vertical") {
      const edgeX =
        b.direction === "forward" ? b.x + 1 : b.x;

      // Must be crossing this vertical edge
      if (
        fromY === toY &&
        (
          (fromX === edgeX - 1 && toX === edgeX) ||
          (fromX === edgeX && toX === edgeX - 1)
        ) &&
        fromY >= b.y - 1 &&
        fromY <= b.y + 1
      ) {
        return true;
      }
    }

    // HORIZONTAL BARRICADE
    if (b.orientation === "horizontal") {
      const edgeY =
        b.direction === "forward" ? b.y + 1 : b.y;

      // Must be crossing this horizontal edge
      if (
        fromX === toX &&
        (
          (fromY === edgeY - 1 && toY === edgeY) ||
          (fromY === edgeY && toY === edgeY - 1)
        ) &&
        fromX >= b.x - 1 &&
        fromX <= b.x + 1
      ) {
        return true;
      }
    }
  }

  return false;
}

function tryAutoBarricade(soldier, fromX, fromY, toX, toY) {
  if (soldier.id !== 2) return false;
  if (soldier.powerUsed) return false;
  if (soldier.state !== "board") return false;
    if (isFrozen(soldier)) {
    log("Auto Barricading Fail due to Freeze");
    return false;
  }

  const dx = toX - fromX;
  const dy = toY - fromY;

  let orientation, direction;

  if (dx !== 0) {
    // horizontal attack → vertical barricade
    orientation = "vertical";
    direction = dx === 1 ? "backward" : "forward";
  } else if (dy !== 0) {
    // vertical attack → horizontal barricade
    orientation = "horizontal";
    direction = dy === 1 ? "backward" : "forward";
  } else {
    return false;
  }

  // Check legality
  if (
    !canDeployBarricade(
      soldier.x,
      soldier.y,
      orientation,
      direction
    )
  ) {
    return false;
  }

  // Deploy
  barricades.push({
    x: soldier.x,
    y: soldier.y,
    orientation,
    direction,
    owner: soldier
  });

  soldier.powerUsed = true;
  soldier.revealed = true;

  log(
    `AUTO BARRICADE by ${soldier.team.toUpperCase()}2 at (${soldier.x},${soldier.y}) ${orientation} ${direction}`
  );

  return true;
}

function useManualBarricade(soldier, orientation, direction) {
  if (soldier.id !== 2) {
    log("Only ID-2 can deploy barricades");
    return false;
  }

  if (soldier.state !== "board") {
    log("Barricade can only be deployed on board");
    return false;
  }

  if (soldier.powerUsed) {
    log("Power already used");
    return false;
  }
  if (isFrozen(soldier)) {
    log("Cannot use Power");
    return false;
  }
  if (
    (orientation !== "vertical" && orientation !== "horizontal") ||
    (direction !== "forward" && direction !== "backward")
  ) {
    log("Invalid barricade configuration");
    return false;
  }

  if (
    !canDeployBarricade(
      soldier.x,
      soldier.y,
      orientation,
      direction
    )
  ) {
    log("Barricade cannot be deployed here");
    return false;
  }

  barricades.push({
    x: soldier.x,
    y: soldier.y,
    orientation,
    direction,
    owner: soldier
  });

  soldier.powerUsed = true;
  soldier.revealed = true;

  log(
    `BARRICADE: ${soldier.team.toUpperCase()}2 at (${soldier.x},${soldier.y}) ${orientation} ${direction}`
  );

  return true;
}

function canDeployBarricade(x, y, orientation, direction) {
  
  // forward = +1, backward = -1
  const dir = direction === "forward" ? 1 : -1;

  // Barricade spans 3 edge segments
  // We must check that ALL required segments are inside board
  for (let offset = -1; offset <= 1; offset++) {
    if (orientation === "vertical") {
      const bx = x + dir;
      const by = y + offset;

      if (
        bx < 0 || bx > 11 ||
        by < 0 || by > 11
      ) {
        return false;
      }
    }

    if (orientation === "horizontal") {
      const bx = x + offset;
      const by = y + dir;

      if (
        bx < 0 || bx > 11 ||
        by < 0 || by > 11
      ) {
        return false;
      }
    }
  }

  return true;
}


/**********************
 * freeze
 **********************/
function isFrozen(soldier) {
  // Lone survivor is never frozen
  if (isLoneSoldier(soldier.team)) return false;
  return soldier.frozenBy !== undefined;
}

function handlePersistentEffectsOnFrozen(soldier) {
  // Rule tweak: if a soldier is frozen after using power,
  // its persistent effects are cleared immediately.
  if (!soldier || !soldier.powerUsed) return;
  if (soldier.id !== 2 && soldier.id !== 4) return;
  cleanupPersistentEffects(soldier);
}

function applyFreeze(centerSoldier) {
  for (const s of soldiers) {
    if (s.state !== "board") continue;
    if (s === centerSoldier) continue; // ID-4 immune

    const dx = Math.abs(s.x - centerSoldier.x);
    const dy = Math.abs(s.y - centerSoldier.y);

    if (dx <= 1 && dy <= 1) {
      s.frozenBy = centerSoldier; // store SOURCE
      handlePersistentEffectsOnFrozen(s);
    }
  }

  log(
    `Freeze applied at (${centerSoldier.x}, ${centerSoldier.y})`
  );
}

function clearFreezeFrom(sourceSoldier) {
  // Only ID-4 clears freeze
  if (sourceSoldier.id !== 4) return;

  // If power was never used, nothing to clear
  if (!sourceSoldier.powerUsed) return;

  for (const s of soldiers) {
    if (
      s.state === "board" &&
      s.frozenBy === sourceSoldier
    ) {
      s.frozenBy = undefined;
    }
  }

  log(
    `Freeze cleared from soldiers affected by ${sourceSoldier.team.toUpperCase()}4`
  );
}



/**********************
 * Gun
 **********************/
function gunBlocked(fromX, fromY, toX, toY) {
  for (const b of barricades) {

    // Vertical barricade → blocks left/right shots
    if (b.orientation === "vertical") {
      const edgeX =
        b.direction === "forward" ? b.x + 1 : b.x;

      if (
        fromY === toY &&
        (
          (fromX === edgeX - 1 && toX === edgeX) ||
          (fromX === edgeX && toX === edgeX - 1)
        ) &&
        fromY >= b.y - 1 &&
        fromY <= b.y + 1
      ) {
        return true;
      }
    }

    // Horizontal barricade → blocks up/down shots
    if (b.orientation === "horizontal") {
      const edgeY =
        b.direction === "forward" ? b.y + 1 : b.y;

      if (
        fromX === toX &&
        (
          (fromY === edgeY - 1 && toY === edgeY) ||
          (fromY === edgeY && toY === edgeY - 1)
        ) &&
        fromX >= b.x - 1 &&
        fromX <= b.x + 1
      ) {
        return true;
      }
    }
  }

  return false;
}


/**********************
 * Nuke
 **********************/
function fireNuke(shooter, orientation) {
  powerVisualSeq += 1;
  powerVisualEvents.push({
    seq: powerVisualSeq,
    kind: "nuke",
    team: shooter.team,
    x: shooter.x,
    y: shooter.y,
    orientation
  });
  if (powerVisualEvents.length > 200) {
    powerVisualEvents.splice(0, powerVisualEvents.length - 200);
  }

  log(`Nuke fired at (${shooter.x}, ${shooter.y}) ${orientation}`);

  const rays = buildNukeRays(shooter, orientation);

  // PHASE 1 — reactions only (auto-barricade)
  for (const ray of rays) {
    probeRayForAutoBarricade(ray, shooter);
  }

  // PHASE 2 — real damage
  for (const ray of rays) {
    fireRayWithDamage(ray, shooter);
  }
}

function fireGun(shooter, direction) {
  powerVisualSeq += 1;
  powerVisualEvents.push({
    seq: powerVisualSeq,
    kind: "gun",
    team: shooter.team,
    x: shooter.x,
    y: shooter.y,
    direction
  });
  if (powerVisualEvents.length > 200) {
    powerVisualEvents.splice(0, powerVisualEvents.length - 200);
  }

  let dx = 0, dy = 0;

  if (direction === "up") dy = 1;
  else if (direction === "down") dy = -1;
  else if (direction === "left") dx = -1;
  else if (direction === "right") dx = 1;
  else return;

  let x = shooter.x;
  let y = shooter.y;

  log(`Gun fired from (${x}, ${y}) direction=${direction}`);

 while (true) {
  const nx = x + dx;
  const ny = y + dy;

  // off board
  if (nx < 0 || nx >= 12 || ny < 0 || ny >= 12) return;

  //  AUTO-BARRICADE CHECK (BEFORE EDGE IS CROSSED)
  const target = soldiers.find(
    s => s.state === "board" && s.x === nx && s.y === ny
  );

  if (target && target.id === 2) {
    const blocked = tryAutoBarricade(target, x, y, nx, ny);
    if (blocked) {
      log("Gun blocked by auto-barricade");
      return;
    }
  }

  // existing barricade blocks shot
  if (gunBlocked(x, y, nx, ny)) {
    log("Gun blocked by barricade");
    return;
  }

  // advance
  x = nx;
  y = ny;

  // kill anything on this square
  for (const s of soldiers) {
    if (s.state !== "board" || s.x !== x || s.y !== y) continue;
    if (s === shooter) continue;

    killSoldier(s, "gun", shooter);
    // DO NOT return → gun is piercing
  }
}

}
function buildNukeRays(shooter, orientation) {
  const rays = [];

  if (orientation === "vertical") {
    for (let dx = -1; dx <= 1; dx++) {
      rays.push({ x: shooter.x + dx, y: shooter.y, dir: "up" });
      rays.push({ x: shooter.x + dx, y: shooter.y, dir: "down" });
    }
  }

  if (orientation === "horizontal") {
    for (let dy = -1; dy <= 1; dy++) {
      rays.push({ x: shooter.x, y: shooter.y + dy, dir: "left" });
      rays.push({ x: shooter.x, y: shooter.y + dy, dir: "right" });
    }
  }

  // filter out off-board origins
  return rays.filter(r =>
    r.x >= 0 && r.x < 12 && r.y >= 0 && r.y < 12
  );
}
function probeRayForAutoBarricade(ray, shooter) {
  let dx = 0, dy = 0;
  if (ray.dir === "up") dy = 1;
  else if (ray.dir === "down") dy = -1;
  else if (ray.dir === "left") dx = -1;
  else if (ray.dir === "right") dx = 1;

  let x = ray.x;
  let y = ray.y;

  while (true) {
    const nx = x + dx;
    const ny = y + dy;

    // 1️⃣ board edge
    if (nx < 0 || nx >= 12 || ny < 0 || ny >= 12) {
      return;
    }

    // 2️⃣ existing barricade blocks probe
    if (gunBlocked(x, y, nx, ny)) {
      return;
    }

    // advance
    x = nx;
    y = ny;

    // check soldier on this square
    const s = soldiers.find(
      o => o.state === "board" && o.x === x && o.y === y
    );

    if (!s) {
      // empty square → keep probing
      continue;
    }

    // shooter is ignored
    if (s === shooter) {
      continue;
    }

    // 3️⃣ auto-barricade trigger condition
    if (
      s.id === 2 &&
      !isFrozen(s) &&
      !s.powerUsed
    ) {
      tryAutoBarricade(s, x - dx, y - dy, x, y);
      return;
    }

    // any other soldier → transparent, keep probing
  }
}

function fireRayWithDamage(ray, shooter) {
  let dx = 0, dy = 0;
  if (ray.dir === "up") dy = 1;
  else if (ray.dir === "down") dy = -1;
  else if (ray.dir === "left") dx = -1;
  else if (ray.dir === "right") dx = 1;

  let x = ray.x;
  let y = ray.y;

  while (true) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx < 0 || nx >= 12 || ny < 0 || ny >= 12) return;
    if (gunBlocked(x, y, nx, ny)) return;

    x = nx;
    y = ny;

    const target = soldiers.find(
      s => s.state === "board" && s.x === x && s.y === y
    );

    if (target && target !== shooter) {
      killSoldier(target, "nuke", shooter);
      // nuke continues — do NOT return
    }
  }
}




/**********************
 * POWER AI v1.0 (Utility & Simulation)
 **********************/

function aiDecidePower() {
const enemyTeam = currentPlayer === "blue" ? "red" : "blue";
// 🛡️ MERCY RULE (Fix: Check Board + Start)
    // If enemy is down to their LAST soldier (on board or in inventory),
    // and our High IDs (4 or 5) are not finished, DO NOT USE POWERS.
    // This prevents accidental game-ending kills on the last unit.
    
    const myBigGunsPending = soldiers.some(s => 
        s.team === currentPlayer && 
        (s.id === 4 || s.id === 5) && 
        s.state !== "finished"
    );

    if (isLoneSoldier(enemyTeam) && myBigGunsPending) {
        if (DEBUG) console.log("[AI POWER] Mercy Rule Active: Skipping power to preserve last enemy.");
        return null;
    }
    // Priority Order: Nuke > Freeze > Gun > Barricade
    
    // 1. NUKE (ID 5)
    const nukeAction = aiEvaluateNuke();
    if (nukeAction) return nukeAction;

    // 2. FREEZE (ID 4)
    const freezeAction = aiEvaluateFreeze();
    if (freezeAction) return freezeAction;

    // 3. GUN (ID 3)
    const gunAction = aiEvaluateGun();
    if (gunAction) return gunAction;

    // 4. BARRICADE (ID 2)
    const barricadeAction = aiEvaluateBarricade();
    if (barricadeAction) return barricadeAction;

    return null; // No power used, proceed to movement
}

// --- EVALUATORS ---

function aiEvaluateNuke() {
    const s = soldiers.find(o => o.team === currentPlayer && o.id === 5 && o.state === "board" && o.frozenBy===undefined && !o.powerUsed);
    if (!s) return null;

    const orientations = ["vertical", "horizontal"];
    let bestScore = -999;
    let bestOrientation = null;

    orientations.forEach(ori => {
        const impact = simulateNukeBlast(s, ori);
        
        // Formula: (Unrevealed * 2.5) + (Enemy IDs) - (Friendly IDs)
        let score = (impact.unrevealedEnemies * 2.5) + impact.enemyIdSum - impact.friendlyIdSum;
        
        if (score > bestScore) {
            bestScore = score;
            bestOrientation = ori;
        }
    });

    // Probability Check based on score
  let chance = 0;
  if (bestScore <= 0) chance = 0;
  else if (bestScore < 2) chance = 0.20;
  else if (bestScore < 3) chance = 0.40;
  else if (bestScore < 4) chance = 0.60;
  else if (bestScore < 5) chance = 0.80;
  else chance = 1.0;

    if (DEBUG) console.log(`[AI POWER] Checking NUKE (Score: ${bestScore}, Chance: ${chance})`);

    if (Math.random() < chance) {
        return { type: "nuke", id: 5, param1: bestOrientation };
    }
    return null;
}

function aiEvaluateGun() {
    const s = soldiers.find(o => o.team === currentPlayer && o.id === 3 && o.state === "board" && o.frozenBy===undefined && !o.powerUsed);
    if (!s) return null;

    // 2P mercy rule: don't shoot lone last enemy if our big guns (4/5) are still pending.
    if (currentPlayer === "blue" || currentPlayer === "red") {
        const enemyTeam = currentPlayer === "blue" ? "red" : "blue";
        const myBigGunsPending = soldiers.some(
            ally =>
                ally.team === currentPlayer &&
                (ally.id === 4 || ally.id === 5) &&
                ally.state !== "finished"
        );
        if (isLoneSoldier(enemyTeam) && myBigGunsPending) {
            if (DEBUG) console.log("[AI POWER] Gun Mercy Rule Active: skipping gun.");
            return null;
        }
    }

    const directions = ["up", "down", "left", "right"];
    let bestScore = -999;
    let bestDir = null;

    directions.forEach(dir => {
        const impact = simulateGunShot(s, dir);
        
        // Same Formula: (Unrevealed * 2.5) + (Enemy IDs) - (Friendly IDs)
        let score = (impact.unrevealedEnemies * 2.5) + impact.enemyIdSum - impact.friendlyIdSum;

        if (score > bestScore) {
            bestScore = score;
            bestDir = dir;
        }
    });

    if (DEBUG) console.log(`[AI POWER] Checking GUN (Best Score: ${bestScore})`);

    // Gun Rule: If best score > 0, Fire. (Deterministic execution)
    if (bestScore > 0) {
        return { type: "gun", id: 3, param1: bestDir };
    }
    return null;
}

function aiEvaluateNuke4() {
    const s = soldiers.find(o => o.team === currentPlayer && o.id === 5 && o.state === "board" && o.frozenBy===undefined && !o.powerUsed);
    if (!s) return null;

    const orientations = ["vertical", "horizontal"];
    let bestScore = -999;
    let bestOrientation = null;

    orientations.forEach(ori => {
        const impact = simulateNukeBlast(s, ori);
        const score = (impact.unrevealedEnemies * 2.5) + impact.enemyIdSum - impact.friendlyIdSum;
        if (score > bestScore) {
            bestScore = score;
            bestOrientation = ori;
        }
    });

    // Dynamic probability by enemy soldiers on board:
    // - If enemies on board <= 4, use 2P/main nuke probabilities.
    // - Otherwise use 3/4P nuke probabilities.
    const enemyOnBoard = getEnemySoldiersOnBoardCount(currentPlayer);
    let chance = 0;
    if (enemyOnBoard <= 4) {
      // 2P/main curve
      if (bestScore <= 0) chance = 0;
      else if (bestScore < 2) chance = 0.20;
      else if (bestScore < 3) chance = 0.40;
      else if (bestScore < 4) chance = 0.60;
      else if (bestScore < 5) chance = 0.80;
      else chance = 1.0;
    } else {
      // 4P curve
      if (bestScore <= 0) chance = 0;
      else if (bestScore < 3) chance = 0.20;
      else if (bestScore < 6) chance = 0.40;
      else if (bestScore < 9) chance = 0.65;
      else if (bestScore < 12) chance = 0.95;
      else chance = 1.0;
    }

    if (DEBUG) console.log(`[AI POWER 4P] Checking NUKE (Score: ${bestScore}, EnemyOnBoard: ${enemyOnBoard}, Chance: ${chance})`);

    if (Math.random() < chance) {
        return { type: "nuke", id: 5, param1: bestOrientation };
    }
    return null;
}

function aiEvaluateGun4() {
    const s = soldiers.find(o => o.team === currentPlayer && o.id === 3 && o.state === "board" && o.frozenBy===undefined && !o.powerUsed);
    if (!s) return null;

    // 4P mercy rule:
    // when only 2 teams remain, if enemy is lone and our 4/5 not finished, skip gun.
    const aliveTeams = getAliveTeams();
    const enemyTeam =
      aliveTeams.length === 2 ? aliveTeams.find(team => team !== currentPlayer) : null;
    const myBigGunsPending = soldiers.some(
      ally =>
        ally.team === currentPlayer &&
        (ally.id === 4 || ally.id === 5) &&
        ally.state !== "finished"
    );
    if (enemyTeam && isLoneSoldier(enemyTeam) && myBigGunsPending) {
      if (DEBUG) console.log("[AI POWER 4P] Gun Mercy Rule Active: skipping gun.");
      return null;
    }

    const directions = ["up", "down", "left", "right"];
    let bestScore = -999;
    let bestDir = null;

    directions.forEach(dir => {
        const impact = simulateGunShot(s, dir);
        const score = (impact.unrevealedEnemies * 2.5) + impact.enemyIdSum - impact.friendlyIdSum;
        if (score > bestScore) {
            bestScore = score;
            bestDir = dir;
        }
    });

    const enemyOnBoard = getEnemySoldiersOnBoardCount(currentPlayer);

    // Gun probability:
    // - enemy soldiers on board <= 4: deterministic like main2 (if score > 0, fire).
    // - otherwise: probabilistic 3/4P curve.
    let chance = 0;
    if (enemyOnBoard <= 4) {
      chance = bestScore > 0 ? 1 : 0;
    } else {
      if (bestScore <= 0) chance = 0;
      else if (bestScore < 2) chance = 0.30;
      else if (bestScore < 3) chance = 0.40;
      else if (bestScore < 5) chance = 0.60;
      else if (bestScore < 7) chance = 0.80;
      else chance = 1;
    }

    if (DEBUG) console.log(`[AI POWER 4P] Checking GUN (Best Score: ${bestScore}, EnemyOnBoard: ${enemyOnBoard}, Chance: ${chance})`);

    if (Math.random() < chance) {
        return { type: "gun", id: 3, param1: bestDir };
    }
    return null;
}

function aiEvaluateFreeze() {
    // 1. Find the Freeze Unit (ID 4)
    // Must be on board, not frozen, power not used
    const s = soldiers.find(o => o.team === currentPlayer && o.id === 4 && o.state === "board" && o.frozenBy === undefined && !o.powerUsed);
    if (!s) return null;

    // 2. Scan the 3x3 Area (Range 1)
    let enemiesFrozen = 0;
    let friendsFrozen = 0;

    // Identify all valid targets in range (excluding self)
    const potentialVictims = soldiers.filter(target => 
        target.state === "board" && 
        target !== s && // ID-4 is immune to own freeze
        Math.abs(target.x - s.x) <= 1 && 
        Math.abs(target.y - s.y) <= 1
    );

    // Sort them into Friend vs Foe
    potentialVictims.forEach(v => {
        if (v.team !== currentPlayer) {
            enemiesFrozen++;
        } else {
            friendsFrozen++;
        }
    });

    // 3. Calculate Net Score (User Spec)
    const netScore = enemiesFrozen - friendsFrozen;

    // 4. Probability Logic
    let execute = false;

    if (netScore >= 2) {
        execute = true; // 100%
    } else if (netScore === 1) {
        // 70% Chance
        if (Math.random() < 0.70) {
            execute = true;
        }
    } else {
        // 0 or Negative Score -> Never freeze
        execute = false; 
    }

    if (DEBUG) console.log(`[AI POWER] Checking FREEZE (Enemies: ${enemiesFrozen}, Friends: ${friendsFrozen}, Net: ${netScore}) -> Execute: ${execute}`);

    if (execute) {
        return { type: "freeze", id: 4 };
    }
    return null;
}

function aiEvaluateBarricade() {
    const s = soldiers.find(o => o.team === currentPlayer && o.id === 2 && o.state === "board" && o.frozenBy===undefined && !o.powerUsed);
    if (!s) return null;

    // Detect Threat in Wake (1-3 squares behind)
    let threatFound = false;
    for (let dist = 1; dist <= 3; dist++) {
        let checkX = s.x;
        let checkY = s.y;

        // Check BEHIND based on team movement direction
        if (s.team === "blue") checkY -= dist; // Blue moves Right, threat is right
        else checkX -= dist; // Red moves Up, threat is Down

        if (checkX >= 0 && checkX < BOARD_SIZE && checkY >= 0 && checkY < BOARD_SIZE) {
            const occupant = board[`${checkX},${checkY}`];
            if (occupant && occupant.team !== s.team) {
                threatFound = true;
                break;
            }
        }
    }

    if (!threatFound) return null;

    // Spec Rules: Blue (Horizontal Backward), Red (Vertical Backward)
    const orientation = s.team === "blue" ? "horizontal" : "vertical";
    const direction = "backward"; // Fixed per spec

    // Validate legality
    if (!canDeployBarricade(s.x, s.y, orientation, direction)) return null;

    // 40% Chance
    const roll = Math.random();
    if (DEBUG) console.log(`[AI POWER] Checking BARRICADE (Threat: Yes, Roll: ${roll.toFixed(2)})`);

    if (roll < 0.40) {
        return { type: "barricade", id: 2, param1: orientation, param2: direction };
    }
    return null;
}

function aiEvaluateBarricade4() {
    const s = soldiers.find(o => o.team === currentPlayer && o.id === 2 && o.state === "board" && o.frozenBy===undefined && !o.powerUsed);
    if (!s) return null;

    function laneValue(rayDx, rayDy, enemyTeam) {
      let unrevealed = 0;
      let revealedIdSum = 0;

      for (let dist = 1; dist <= 3; dist++) {
        const x = s.x + rayDx * dist;
        const y = s.y + rayDy * dist;
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) continue;
        const occ = board[`${x},${y}`];
        if (!occ || occ.team !== enemyTeam) continue;
        if (occ.revealed) revealedIdSum += occ.id;
        else unrevealed++;
      }

      return 2.5 * unrevealed + revealedIdSum;
    }

    let orientation = null;
    let forwardValue = 0;
    let backwardValue = 0;

    // Blue/Yellow: horizontal barricade. Compare +Y (forward) vs -Y (backward).
    // +Y lane checks GREEN threat, -Y lane checks RED threat.
    if (s.team === "blue" || s.team === "yellow") {
      orientation = "horizontal";
      forwardValue = laneValue(0, 1, "green");
      backwardValue = laneValue(0, -1, "red");
    }

    // Red/Green: vertical barricade. Compare +X (forward) vs -X (backward).
    // +X lane checks YELLOW threat, -X lane checks BLUE threat.
    if (s.team === "red" || s.team === "green") {
      orientation = "vertical";
      forwardValue = laneValue(1, 0, "yellow");
      backwardValue = laneValue(-1, 0, "blue");
    }

    if (!orientation) return null;
    if (forwardValue <= 0 && backwardValue <= 0) return null;

    let direction = null;
    if (forwardValue > backwardValue) direction = "forward";
    else if (backwardValue > forwardValue) direction = "backward";
    else direction = Math.random() < 0.5 ? "forward" : "backward";

    if (!canDeployBarricade(s.x, s.y, orientation, direction)) return null;

    if (Math.random() < 0.40) {
      return { type: "barricade", id: 2, param1: orientation, param2: direction };
    }
    return null;
}

function aiDecidePower4() {
    const nukeAction = aiEvaluateNuke4();
    if (nukeAction) return nukeAction;

    const freezeAction = aiEvaluateFreeze();
    if (freezeAction) return freezeAction;

    const gunAction = aiEvaluateGun4();
    if (gunAction) return gunAction;

    const barricadeAction = aiEvaluateBarricade4();
    if (barricadeAction) return barricadeAction;

    return null;
}

function calculateThreat4(x, y, myTeam) {
    const result = { score: 0, unrevealedCount: 0 };
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return result;
    const enemyOnBoard = getEnemySoldiersOnBoardCount(myTeam);

    function hasStartThreatFromTeam(team) {
        return soldiers.some(s => {
            if (s.team !== team || s.state !== "start") return false;

            const start = getVirtualStartPosition(s);
            const vec = getDirectionVector(s.direction);

            // Horizontal movers (blue/yellow)
            if (vec.dx !== 0) {
                if (start.y !== y) return false;
                const steps = (x - start.x) / vec.dx;
                return Number.isInteger(steps) && steps >= 1 && steps <= 3;
            }

            // Vertical movers (red/green)
            if (vec.dy !== 0) {
                if (start.x !== x) return false;
                const steps = (y - start.y) / vec.dy;
                return Number.isInteger(steps) && steps >= 1 && steps <= 3;
            }

            return false;
        });
    }

    let meleeThreat = false;

    // Include start-line soldiers that can enter and melee-kill this square in 1..3 steps.
    if (myTeam === "blue" || myTeam === "yellow") {
        if (hasStartThreatFromTeam("red") || hasStartThreatFromTeam("green")) {
            meleeThreat = true;
        }
    }
    if (myTeam === "red" || myTeam === "green") {
        if (hasStartThreatFromTeam("blue") || hasStartThreatFromTeam("yellow")) {
            meleeThreat = true;
        }
    }

    for (let dist = 1; dist <= 3 && !meleeThreat; dist++) {
        // Blue/Yellow: check Red in -Y and Green in +Y
        if (myTeam === "blue" || myTeam === "yellow") {
            const downY = y - dist;
            const upY = y + dist;

            if (downY >= 0) {
                const downOcc = board[`${x},${downY}`];
                if (downOcc && downOcc.team === "red") {
                    meleeThreat = true;
                    break;
                }
            }
            if (upY < BOARD_SIZE) {
                const upOcc = board[`${x},${upY}`];
                if (upOcc && upOcc.team === "green") {
                    meleeThreat = true;
                    break;
                }
            }
        }

        // Red/Green: check Yellow in +X and Blue in -X
        if (myTeam === "red" || myTeam === "green") {
            const eastX = x + dist;
            const westX = x - dist;

            if (eastX < BOARD_SIZE) {
                const eastOcc = board[`${eastX},${y}`];
                if (eastOcc && eastOcc.team === "yellow") {
                    meleeThreat = true;
                    break;
                }
            }
            if (westX >= 0) {
                const westOcc = board[`${westX},${y}`];
                if (westOcc && westOcc.team === "blue") {
                    meleeThreat = true;
                    break;
                }
            }
        }
    }

    let unrevealedCount = 0;
    let directLineThreat = false;
    for (const e of soldiers) {
        if (e.team === myTeam || e.state !== "board" || e.revealed) continue;
        const inVerticalBand = Math.abs(e.x - x) <= 1;
        const inHorizontalBand = Math.abs(e.y - y) <= 1;
        if (inVerticalBand || inHorizontalBand) {
            unrevealedCount++;
            if (e.x === x || e.y === y) directLineThreat = true;
        }
    }

    result.unrevealedCount = unrevealedCount;

    if (enemyOnBoard <= 4) {
        // 2P score mapping
        if (meleeThreat) result.score = 15;
        else if (unrevealedCount > 2 && directLineThreat) result.score = 12;
        else if (unrevealedCount > 1) result.score = 8;
        else if (unrevealedCount === 1) result.score = 5;
        else result.score = 0;
    } else {
        // 3P/4P score mapping
        if (meleeThreat && unrevealedCount > 5 && directLineThreat) result.score = 15;
        else if (meleeThreat && unrevealedCount > 3 && directLineThreat) result.score = 12;
        else if (unrevealedCount > 3 && directLineThreat) result.score = 9;
        else if (unrevealedCount >= 3) result.score = 7;
        else if (unrevealedCount > 2) result.score = 4;
        else if (unrevealedCount >= 1) result.score = 2;
        else result.score = 0;
    }

    return result;
}

function simulateMove4(id, steps) {
    const s = soldiers.find(o => o.id === id && o.team === currentPlayer);
    const meta = {
        soldier: s,
        steps: steps,
        finishes: false,
        kills: false,
        victimID: null,
        victimRevealed: false,
        advance: 0,
        threatLevel: 0,
        destX: s.x,
        destY: s.y,
        unrevealedCount: 0
    };

    const vec = getDirectionVector(s.direction);
    const start = getVirtualStartPosition(s);
    const destX = start.x + vec.dx * steps;
    const destY = start.y + vec.dy * steps;

    const finishes =
      (s.direction === "right" && destX === BOARD_SIZE) ||
      (s.direction === "left" && destX === -1) ||
      (s.direction === "up" && destY === BOARD_SIZE) ||
      (s.direction === "down" && destY === -1);

    if (finishes) {
        meta.finishes = true;
        meta.advance = 12;
        meta.threatLevel = 0;
        return meta;
    }

    meta.destX = destX;
    meta.destY = destY;

    let progress = 0;
    if (s.direction === "right") progress = destX + 1;
    else if (s.direction === "left") progress = BOARD_SIZE - destX;
    else if (s.direction === "up") progress = destY + 1;
    else if (s.direction === "down") progress = BOARD_SIZE - destY;

    if (progress < 3) meta.advance = 2;
    else if (progress < 6) meta.advance = 3;
    else if (progress < 9) meta.advance = 4;
    else meta.advance = 6;

    const victim = board[`${destX},${destY}`];
    if (victim && victim.team !== s.team) {
        meta.kills = true;
        meta.victimRevealed = victim.revealed;
        meta.victimID = victim.id;
    }

    const threatData = calculateThreat4(destX, destY, s.team);
    meta.threatLevel = threatData.score;
    meta.unrevealedCount = threatData.unrevealedCount;

    return meta;
}

function scoreNewPosition4(sim) {
    const s = sim.soldier;
    const id = s.id;

    if (sim.finishes) return id * 15;

    let val = 0;
    if (sim.kills) {
        // Mercy rule (4P variant):
        // If only 2 teams remain, enemy has lone active soldier,
        // and our ID-4 or ID-5 is not finished yet, remove kill bonus.
        const aliveTeams = getAliveTeams();
        const enemyTeam =
          aliveTeams.length === 2
            ? aliveTeams.find(team => team !== s.team)
            : null;
        const myBigGunsPending = soldiers.some(
          ally =>
            ally.team === s.team &&
            (ally.id === 4 || ally.id === 5) &&
            ally.state !== "finished"
        );

        if (
          enemyTeam &&
          isLoneSoldier(enemyTeam) &&
          myBigGunsPending
        ) {
          val += 0;
        } else {
          if (sim.victimRevealed) val += sim.victimID * 10;
          else val += 25;
        }
    }

    val += (sim.advance - sim.threatLevel) * id;

    if (!s.powerUsed) {
        let powerVal = 0;
        if (id === 2) powerVal = 1;
        else if (id === 3) powerVal = 3;
        else if (id === 4) powerVal = 2;
        else if (id === 5) powerVal = 4;
        val += powerVal;
    }

    if (sim.destX >= 0 && sim.destX < BOARD_SIZE && sim.destY >= 0 && sim.destY < BOARD_SIZE) {
        const vec = getDirectionVector(s.direction);
        const enemiesAhead = soldiers.filter(e => {
            if (e.team === s.team || e.state !== "board") return false;
            const dot = (e.x - sim.destX) * vec.dx + (e.y - sim.destY) * vec.dy;
            return dot >= 0;
        }).length;
        const enemyOnBoardCount = soldiers.filter(e =>
            e.team !== s.team && e.state === "board"
        ).length;
        let aheadWeight = 1;
        if (enemyOnBoardCount <= 4) aheadWeight = 2;
        else if (enemyOnBoardCount <= 8) aheadWeight = 1.5;
        else aheadWeight = 1;
        val += enemiesAhead * aheadWeight;
    }

    return val;
}

function chooselegalMove4(legalMoves, steps) {
    if (legalMoves.length === 0) return null;

    if (DEBUG) {
        console.log(`\n--- AI MOVEMENT ANALYSIS 4P (${currentPlayer.toUpperCase()}) ---`);
    }

    const evaluatedMoves = legalMoves.map(soldier => {
        const sim = simulateMove4(soldier.id, steps);

        let oldThreat = 0;
        if (sim.soldier.state !== "start") {
            oldThreat = calculateThreat4(sim.soldier.x, sim.soldier.y, sim.soldier.team).score;
        }

        const posValueOld = -(oldThreat + sim.soldier.id);
        const posValueNew = scoreNewPosition4(sim);
        const moveValue = posValueNew - posValueOld;

        return {
            soldier,
            moveValue,
            sim,
            debug: { threat: sim.threatLevel, advance: sim.advance }
        };
    });

    for (let i = evaluatedMoves.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [evaluatedMoves[i], evaluatedMoves[j]] = [evaluatedMoves[j], evaluatedMoves[i]];
    }

    evaluatedMoves.sort((a, b) => b.moveValue - a.moveValue);

    if (DEBUG) {
        const TEAM_CHAR = { blue: "B", red: "R", yellow: "Y", green: "G" };
        evaluatedMoves.forEach(m => {
            const s = m.sim.soldier;
            const prefix = TEAM_CHAR[s.team] || "?";
            const dest = m.sim.finishes ? "FINISH" : `(${m.sim.destX},${m.sim.destY})`;
            console.log(
              `${prefix}${s.id} -> ${dest.padEnd(9)} | ` +
              `Delta: ${m.moveValue.toFixed(0).padEnd(3)} | ` +
              `NewPos: (Thr:${m.debug.threat} Adv:${m.debug.advance} URev:${m.sim.unrevealedCount})`
            );
        });

        const winner = evaluatedMoves[0] ? evaluatedMoves[0].sim.soldier : { id: "?" };
        const wp = TEAM_CHAR[winner.team] || "?";
        console.log(`>>> SELECTED: ${wp}${winner.id}\n`);
    }

    return evaluatedMoves[0].soldier;
}

function aiPlayTurn_Main4() {
  if (phase !== "main") return;

  if (resurrectionPending && resurrectionPending.team === currentPlayer) {
    handleAIResurrection();
    return;
  }
  if (pendingPostMovePower && pendingPostMovePower.soldier.team === currentPlayer) {
    handleAIConfirmation();
    return;
  }

  if (pendingRoll === null) {
    const bestPowerAction = aiDecidePower4();
    if (bestPowerAction) {
        const powerUsed = takeTurnPower(
            currentPlayer,
            bestPowerAction.id,
            bestPowerAction.type,
            bestPowerAction.param1,
            bestPowerAction.param2
        );
        if (powerUsed) return;
    }
  }

  if (pendingRoll === null) {
    const dice = rollDice();
    pendingRoll = dice;
    const legalMovesAfterRoll = getLegalMoves(currentPlayer, dice);
    if (legalMovesAfterRoll.length === 0) {
      scheduleAction(() => endTurn(), getAiPostRollDelayMs());
      return;
    }
    scheduleAction(aiPlayTurn, getAiPostRollDelayMs());
    return;
  }

  const legalMoves = getLegalMoves(currentPlayer, pendingRoll);
  const choice = chooselegalMove4(legalMoves, pendingRoll);

  if (!choice) {
      endTurn();
      return;
  }

  const turnKeptOpen = takeTurnMovement(currentPlayer, choice.id, pendingRoll);
  if (turnKeptOpen) {
    scheduleAction(aiPlayTurn, 0);
  }
}
// --- SIMULATION HELPERS (Non-Destructive) ---

function simulateGunShot(shooter, direction) {
    let dx = 0, dy = 0;
    if (direction === "up") dy = 1;
    else if (direction === "down") dy = -1;
    else if (direction === "left") dx = -1;
    else if (direction === "right") dx = 1;

    let x = shooter.x;
    let y = shooter.y;
    
    let result = { unrevealedEnemies: 0, enemyIdSum: 0, friendlyIdSum: 0 };

    while (true) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
        
        // Stop at barricades (existing logic)
        if (gunBlocked(x, y, nx, ny)) break;

        const target = board[`${nx},${ny}`];
        x = nx;
        y = ny;

        if (target && target !== shooter) {
            if (target.team !== shooter.team) {
                if (!target.revealed) result.unrevealedEnemies++;
                else result.enemyIdSum += target.id;
            } else {
                result.friendlyIdSum += target.id;
            }
            // Gun is piercing, continue loop
        }
    }
    return result;
}

function simulateNukeBlast(shooter, orientation) {
    // Build rays exactly like fireNuke
    const rays = buildNukeRays(shooter, orientation); 
    
    let result = { unrevealedEnemies: 0, enemyIdSum: 0, friendlyIdSum: 0 };

    for (const ray of rays) {
        let dx = 0, dy = 0;
        if (ray.dir === "up") dy = 1;
        else if (ray.dir === "down") dy = -1;
        else if (ray.dir === "left") dx = -1;
        else if (ray.dir === "right") dx = 1;

        let x = ray.x;
        let y = ray.y;

        while (true) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (gunBlocked(x, y, nx, ny)) break;

            x = nx;
            y = ny;

            const target = board[`${x},${y}`];
            if (target && target !== shooter) {
                 if (target.team !== shooter.team) {
                    if (!target.revealed) result.unrevealedEnemies++;
                    else result.enemyIdSum += target.id;
                } else {
                    result.friendlyIdSum += target.id;
                }
                // Nuke is piercing
            }
        }
    }
    return result;
}
function getAvailableStartLanesForTeam(team) {
  const teamSoldiers = soldiers.filter(
    s => s.team === team && s.state === "start"
  );

  const usedLanes = teamSoldiers.map(getLaneValueForDirection);

  return [...Array(BOARD_SIZE).keys()].filter(
    lane => !usedLanes.includes(lane)
  );
}



/**********************
 * AI SCORING & SIMULATION (Jatin Hybrid v1.0)
 **********************/

// The "Brain" - Decides which move is best based on Delta
// 🔧 UPDATED: Now accepts 'steps' (dice roll) as the second argument
function chooselegalMove(legalMoves, steps) {
  if (legalMoves.length === 0) return null;

  // Debug Log
  if (DEBUG) {
      console.log(`\n--- AI MOVEMENT ANALYSIS (${currentPlayer.toUpperCase()}) ---`);
  }

  const evaluatedMoves = legalMoves.map(soldier => { // 'move' was actually a soldier object
    // 1. Simulate the Move using the PASSED 'steps'
    const sim = simulateMove(soldier.id, steps);

    // 2. Calculate "Old" Position Value
    let oldThreat = 0;
    
    if (sim.soldier.state === "start") {
        oldThreat = 0;
    } else {
        // 🔧 FIX: Unpack the score from the object!
        const threatData = calculateThreat(sim.soldier.x, sim.soldier.y, sim.soldier.team);
        oldThreat = threatData.score;
    }
    const posValueOld = -(oldThreat + sim.soldier.id);
   

    // 3. Calculate "New" Position Value
    const posValueNew = scoreNewPosition(sim);

    // 4. Calculate Delta (Move Value)
    const moveValue = posValueNew - posValueOld;

    return { 
      soldier, // Renamed for clarity 
      moveValue, 
      sim,
      debug: { threat: sim.threatLevel, advance: sim.advance } 
    };
  });

 // Randomize Ties
  for (let i = evaluatedMoves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [evaluatedMoves[i], evaluatedMoves[j]] = [evaluatedMoves[j], evaluatedMoves[i]];
  }

  // Sort by MoveValue (Descending)
  evaluatedMoves.sort((a, b) => b.moveValue - a.moveValue);
  // Debug Printing
  if (DEBUG) {
      evaluatedMoves.forEach(m => {
          const s = m.sim.soldier;
          const prefix = s.team === "blue" ? "B" : "R";
          const dest = m.sim.finishes ? "FINISH" : `(${m.sim.destX},${m.sim.destY})`;
          
          console.log(
            `${prefix}${s.id} -> ${dest.padEnd(9)} | ` +
            `Delta: ${m.moveValue.toFixed(0).padEnd(3)} | ` +
            // 🆕 ADDED: URev (Unrevealed Count)
            `NewPos: (Thr:${m.debug.threat} Adv:${m.debug.advance} URev:${m.sim.unrevealedCount})`
          );
      });
      
      const winner = evaluatedMoves[0] ? evaluatedMoves[0].sim.soldier : {id: "?"};
      console.log(`>>> SELECTED: ${currentPlayer === "blue" ? "B" : "R"}${winner.id}\n`);
  }

 

  // Return the SOLDIER object (which works as the 'move' choice)
  return evaluatedMoves[0].soldier;
}

// The "New Position" Scorer
function scoreNewPosition(sim) {
  const s = sim.soldier;
  const id = s.id;

  // CASE A: Finishing (Dominant Strategy)
  // 🔧 CHANGE 2: Nerfed finishing bonus (25 -> 15)
  if (sim.finishes) {
    return id * 15; 
  }

  // CASE B: Normal Move
  // Formula: KillBonus + (AdvanceLevel - ThreatLevel) * ID + PowerValue

  let val = 0;

  // 1. Kill Bonus
  if (sim.kills) {
    // 🛡️ MERCY RULE CHECK (Fix: Check Board + Start)
    const enemyTeam = s.team === "blue" ? "red" : "blue";
    
    const myBigGunsPending = soldiers.some(ally => 
        ally.team === s.team && 
        (ally.id === 4 || ally.id === 5) && 
        ally.state !== "finished"
    );

    // If this is the Last Enemy (Board or Inventory) and we have points to score...
    if (isLoneSoldier(enemyTeam) && myBigGunsPending) {
        val += 0; // Remove kill bonus. Don't hunt the last guy if we need to score.
    } else {
        // Standard Logic
        if (sim.victimRevealed) {
          // Confirmed Kill: ID * 10
          val += sim.victimID * 10;
        } else {
          // Mystery Kill: Flat 25 (Aggressive)
          val += 25; 
        }
    }
  }

  // 2. Advance vs Threat
  // (Advance - Threat) * ID
  const combinedScore = (sim.advance - sim.threatLevel) * id;
  val += combinedScore;

  // 🔧 CHANGE 1: PowerValue bonus (Latent Power Encouragement)
  // Only applies if power is NOT used yet.
  if (!s.powerUsed) {
    let powerVal = 0;
    switch (id) {
        case 2: powerVal = 1; break; // Barricade
        case 3: powerVal = 3; break; // Gun
        case 4: powerVal = 2; break; // Freeze
        case 5: powerVal = 4; break; // Nuke
        // ID 1 (Spy) gets 0
    }
    val += powerVal;
  }
// 🔧 CHANGE: Enemy Pressure Quadrant
  // Incentivize contesting space where enemies exist
  let enemyPressure = 0;
  
  // Ensure we are looking at valid board coordinates
  if (sim.destX >= 0 && sim.destX < BOARD_SIZE && sim.destY >= 0 && sim.destY < BOARD_SIZE) {
      const enemiesInQuadrant = soldiers.filter(e => 
          e.team !== s.team && 
          e.state === "board" &&
          (
              // Blue (Right): Presence Ahead (X+) and Below (Y-)
              (s.team === "blue" && e.x >= sim.destX && e.y <= sim.destY) ||
              // Red (Up): Presence Ahead (Y+) and Left (X-)
              (s.team === "red" && e.x <= sim.destX && e.y >= sim.destY)
          )
      ).length;

      enemyPressure = enemiesInQuadrant * 2;
  }

  val += enemyPressure;
  return val;
}

// The "Simulator" (Physics Engine)
function simulateMove(id, steps) {
  const s = soldiers.find(o => o.id === id && o.team === currentPlayer);
  
  // Metadata Object (Read-Only)
  let meta = {
    soldier: s,
    steps: steps,
    finishes: false,
    kills: false,
    victimID: null,
    victimRevealed: false,
    advance: 0,
    threatLevel: 0,
    destX: s.x,
    destY: s.y,
    unrevealedCount:0
  };

  // 1. Calculate Destination Coordinates
  let startX = s.x;
  let startY = s.y;
  
  // Handle Start Line Virtual Coords
  if (s.state === "start") {
     if (s.direction === "right") startX = -1;
     else startY = -1;
  }

  let destX = startX;
  let destY = startY;

  // Project Movement
  if (s.direction === "right") destX += steps; // Blue moves X+
  else destY += steps; // Red moves Y+

  // 2. Check Finish Condition
  if (destX >= BOARD_SIZE || destY >= BOARD_SIZE) {
    meta.finishes = true;
    meta.advance = 12; // Scorer ignores this for finishes anyway
    meta.threatLevel = 0; 
    return meta;
  }

  meta.destX = destX;
  meta.destY = destY;

  // 3. Calculate Advance Level (Bucketed 3/4/7/10)
  // 🔧 CHANGE 1: Replaced linear destIndex + 1 with buckets
  const destIndex = (s.direction === "right") ? destX : destY;
  
  if (destIndex < 3) {
      meta.advance = 2;
  } else if (destIndex < 6) {
      meta.advance = 3;
  } else if (destIndex < 9) {
      meta.advance = 4;
  } else {
      meta.advance = 6;
  }

  // 4. Check Kill (Collision detection)
  const key = `${destX},${destY}`;
  const victim = board[key];
  if (victim && victim.team !== s.team) {
    meta.kills = true;
    meta.victimRevealed = victim.revealed;
    meta.victimID = victim.id;
  }

 // 🔧 UPDATE: Unpack the object
  const threatData = calculateThreat(destX, destY, s.team);
  
  meta.threatLevel = threatData.score;       // For Math
  meta.unrevealedCount = threatData.unrevealedCount; // For Debugging

  return meta;
}

// The "Sensor" (Threat Detection)
function calculateThreat(x, y, myTeam) {
  
  // Default return structure
  let result = { score: 0, unrevealedCount: 0 };
  
  // Safe zones have 0 threat
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return result;

  // --- 1. MELEE THREAT (Range 1-3) ---
  // 🔧 FIX #1: Check FULL DICE RANGE (3 squares), not just 1
  let meleeThreat = false;
  
  for (let dist = 1; dist <= 3; dist++) {
      let checkX = x;
      let checkY = y;

      // Red (Up) checks LEFT (x-dist)
      // Blue (Right) checks RIGHT (y-dist) relative to board logic
      if (myTeam === "red") {
          checkX = x - dist; 
      } else {
          checkY = y - dist; 
      }

      if (checkX >= 0 && checkX < BOARD_SIZE && checkY >= 0 && checkY < BOARD_SIZE) {
          const neighbor = board[`${checkX},${checkY}`];
          if (neighbor && neighbor.team !== myTeam) {
              meleeThreat = true;
              break; // Found a threat, no need to check further
          }
      }
  }

  // --- 2. DANGER ZONE SCAN (3x3 Sweep) ---
  // Scans for UNREVEALED enemies in the bands covering rows/cols around us
  
  let unrevealedCount = 0;
  let directLineThreat = false; 

  const hiddenEnemies = soldiers.filter(e => 
      e.team !== myTeam && 
      e.state === "board" && 
      !e.revealed
  );

  for (const e of hiddenEnemies) {
      // 🔧 FIX #3: Clean Logic - Full Board Sweep on adjacent Rows/Cols
      // If enemy is in [x-1, x, x+1] (Vertical Band)
      // OR enemy is in [y-1, y, y+1] (Horizontal Band)
      
      const inVerticalBand = Math.abs(e.x - x) <= 1; 
      const inHorizontalBand = Math.abs(e.y - y) <= 1; 
      
      if (inVerticalBand || inHorizontalBand) {
          unrevealedCount++;
          
          // Check alignment (Tier 1 Condition: Direct firing line)
          if (e.x === x || e.y === y) {
              directLineThreat = true;
          }
      }
  }
if (unrevealedCount > 0) {
  console.assert(
    hiddenEnemies.every(e => board[`${e.x},${e.y}`] === e),
    "Ghost soldier detected in threat scan"
  );
}
// Store the raw count for debugging
  result.unrevealedCount = unrevealedCount;

// 3. TIER LOGIC
  if (meleeThreat) {
      result.score = 15;
  } else if (unrevealedCount > 2 && directLineThreat) {
      result.score = 12;
  } else if (unrevealedCount > 1) {
      result.score = 8;
  } else if (unrevealedCount === 1) {
      result.score = 5;
  } else {
      result.score = 0;
  }
  return result;
}

// --- AI MAIN TURN HANDLER ---
function aiPlayTurn_Main() {
  if (phase !== "main") return;

  // 1️⃣ HANDLE PENDING STATES
  if (resurrectionPending && resurrectionPending.team === currentPlayer) {
    handleAIResurrection();
    return;
  }
  if (pendingPostMovePower && pendingPostMovePower.soldier.team === currentPlayer) {
    handleAIConfirmation();
    return;
  }
// 2️⃣ NEW: POWER USAGE AI v1.0 (Priority over movement)
  // We check if any power should be used based on utility scores
  if (pendingRoll === null) {
    const bestPowerAction = aiDecidePower();
    
    if (bestPowerAction) {
        if (DEBUG) console.log(`[AI POWER] Decided to use ${bestPowerAction.type.toUpperCase()} with ${currentPlayer.toUpperCase()}${bestPowerAction.id}`);
        
        const powerUsed = takeTurnPower(
            currentPlayer, 
            bestPowerAction.id, 
            bestPowerAction.type, 
            bestPowerAction.param1, 
            bestPowerAction.param2
        );
        if (powerUsed) {
          return; // Turn ends after power usage
        }
    }
  }

  // 3️⃣ MOVEMENT
  if (pendingRoll === null) {
    const dice = rollDice();
    pendingRoll = dice;
    const legalMovesAfterRoll = getLegalMoves(currentPlayer, dice);

    if (legalMovesAfterRoll.length === 0) {
      scheduleAction(() => endTurn(), getAiPostRollDelayMs());
      return;
    }
    scheduleAction(aiPlayTurn, getAiPostRollDelayMs());
    return;
  }

  const legalMoves = getLegalMoves(currentPlayer, pendingRoll);
  
  // CALL THE NEW BRAIN
 const choice = chooselegalMove(legalMoves, pendingRoll);
  
  if (!choice) {
      endTurn();
      return;
  }

  const turnKeptOpen = takeTurnMovement(currentPlayer, choice.id, pendingRoll);

  // 4️⃣ FOLLOW-UP
  if (turnKeptOpen) {
    scheduleAction(aiPlayTurn, 0);
  }
}

// --- DISPATCHERS ---

function aiPlayTurn() {
    if (phase !== "main") return;
    if (playerAI[currentPlayer] === "human") return;
    if (playerAI[currentPlayer] === "none") return;
    const policy = AI_POLICIES[playerAI[currentPlayer]];
    
    // Dispatch Pending States First
    if (resurrectionPending && resurrectionPending.team === currentPlayer) {
        // 1s delay for AI resurrection decision.
        scheduleAction(() => {
          if (phase !== "main" || playerAI[currentPlayer] === "human") return;
          const p = AI_POLICIES[playerAI[currentPlayer]];
          if (resurrectionPending && resurrectionPending.team === currentPlayer) {
            if (p.resurrect) p.resurrect();
            else p.play();
          }
        }, getAiDecisionDelayMs());
        return;
    }
    if (pendingPostMovePower && pendingPostMovePower.soldier.team === currentPlayer) {
        // 1s delay for AI freeze yes/no decision.
        scheduleAction(() => {
          if (phase !== "main" || playerAI[currentPlayer] === "human") return;
          const p = AI_POLICIES[playerAI[currentPlayer]];
          if (pendingPostMovePower && pendingPostMovePower.soldier.team === currentPlayer) {
            if (p.confirm) p.confirm();
            else p.play();
          }
        }, getAiDecisionDelayMs());
        return;
    }

    // Normal Play
    policy.play();
}

function aiPlaceOneSoldier(team) {
    if (playerAI[team] === "human") return;
    if (playerAI[team] === "none") return;
    const policy = AI_POLICIES[playerAI[team]];
    policy.place(team);
}

function getConfiguredTeams() {
  const activeTeams = PLAYERS.filter(team => playerAI[team] !== "none");
  return activeTeams.length > 0 ? activeTeams : [...PLAYERS];
}

function hasAnyHumanPlayers() {
  return getConfiguredTeams().some(team => playerAI[team] === "human");
}

function scheduleCurrentMainTurnIfAI() {
  if (phase !== "main") return;
  if (playerAI[currentPlayer] === "human") return;
  if (playerAI[currentPlayer] === "none") return;
  scheduleAction(aiPlayTurn, getAiPreRollDelayMs());
}

function scheduleCurrentPlacementIfAI() {
  if (phase !== "placement") return;
  if (playerAI[currentPlayer] === "human") return;
  if (playerAI[currentPlayer] === "none") return;
  scheduleAction(() => aiPlaceOneSoldier(currentPlayer), getAiPlacementDelayMs());
}

// Helpers wrappers if invoked directly by engine (rare but safe to keep)
function handleAIResurrection() {
    const policy = AI_POLICIES[playerAI[currentPlayer]];
    if (policy.resurrect) policy.resurrect();
    else policy.play();
}
function handleAIConfirmation() {
    const policy = AI_POLICIES[playerAI[currentPlayer]];
    if (policy.confirm) policy.confirm();
    else policy.play();
}



/**********************
 * DICE
 **********************/
function rollDice() {
  const roll = Math.floor(Math.random() * 3) + 1;
  log(`${currentPlayer.toUpperCase()} rolled ${roll}`);
  return roll;
}

/**********************
 * HELPERS
 **********************/
function createInitialSoldiers() {
  return [
    // Blue
    { id: 1, team: "blue", direction: "right", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 2, team: "blue", direction: "right", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 3, team: "blue", direction: "right", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 4, team: "blue", direction: "right", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 5, team: "blue", direction: "right", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },

    // Red
    { id: 1, team: "red", direction: "up", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 2, team: "red", direction: "up", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 3, team: "red", direction: "up", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 4, team: "red", direction: "up", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 5, team: "red", direction: "up", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},

    // Yellow
    { id: 1, team: "yellow", direction: "left", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 2, team: "yellow", direction: "left", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 3, team: "yellow", direction: "left", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 4, team: "yellow", direction: "left", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },
    { id: 5, team: "yellow", direction: "left", state: "inventory", x: null, y: null,powerUsed:false, revealed:false },

    // Green
    { id: 1, team: "green", direction: "down", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 2, team: "green", direction: "down", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 3, team: "green", direction: "down", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 4, team: "green", direction: "down", state: "inventory", x: null, y: null,powerUsed:false, revealed:false},
    { id: 5, team: "green", direction: "down", state: "inventory", x: null, y: null,powerUsed:false, revealed:false}
  ];
}

function log(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

function hasPlayableSoldiers(team) {
  // NOTE: inventory is intentionally excluded because resurrection places immediately
  return soldiers.some(
    s =>
      s.team === team &&
      (s.state === "start" || s.state === "board")
  );
}

function getAliveTeams() {
  return PLAYERS.filter(hasPlayableSoldiers);
}

function getEnemySoldiersOnBoardCount(team) {
  return soldiers.filter(
    s => s.team !== team && s.state === "board"
  ).length;
}

function endTurn() {
  if (phase === "main") {
    SIM_MAIN_TURN_COUNTER++;
  }
  pendingRoll = null;
  endOfTurnCleanup();


  if (checkGameEnd()) {
    finalRanking = getScoreRanking();
    gameWinner = finalRanking[0].team;
    resolveEndgame(gameWinner, finalRanking);
    phase = "gameover";
    return;
  }

  let nextIdx = PLAYERS.indexOf(currentPlayer);
  for (let i = 0; i < PLAYERS.length; i++) {
    nextIdx = (nextIdx + 1) % PLAYERS.length;
    if (hasPlayableSoldiers(PLAYERS[nextIdx])) {
      currentPlayer = PLAYERS[nextIdx];
      break;
    }
  }
  log("Turn end: Next Player :", currentPlayer);
  // 🆕 NEW: Auto-print board ONLY in Observer Mode (and not during batch runs)
  // We check 'DEBUG' because batch mode turns DEBUG to false.
  if (gameMode === "ava" && DEBUG) {
      OBSERVER_TURNS_SINCE_PRINT++;
      const rotationSize = Math.max(1, getAliveTeams().length);
      if (OBSERVER_TURNS_SINCE_PRINT >= rotationSize) {
          OBSERVER_TURNS_SINCE_PRINT = 0;
          console.log(`\n--- ${currentPlayer.toUpperCase()}'s Turn ---`);
          printBoard();
      }
  }

  scheduleCurrentMainTurnIfAI();
}

// 🧠 AI Post-Move Decision (The "Freeze" Confirmation)
function handleAIConfirmation_Main() {
  if (!pendingPostMovePower) {
      endTurn();
      return;
  }

  // ♻️ REFACTOR: Single Source of Truth
  // We delegate the decision to the main Freeze Evaluator.
  // Since the soldier has already moved, aiEvaluateFreeze()
  // will naturally assess the targets at the NEW position.
  const decision = aiEvaluateFreeze();

  if (decision) {
      // If the brain says "Yes", we execute
      const s = pendingPostMovePower.soldier;
      applyFreeze(s);
      s.powerUsed = true;
      s.revealed = true; 
      log(`AI decided to FREEZE after moving.`);
  } else {
      log(`AI declined to freeze.`);
  }

  // Cleanup
  pendingPostMovePower = null;
  pendingRoll = null; 
  endTurn();
}


function decideWinnerByScore() {
  return getScoreRanking()[0].team;
}

function getScoreRanking() {
  const TIE_PRIORITY = ["yellow", "green", "blue", "red"];
  return [...PLAYERS]
    .sort((a, b) => (score[b] - score[a]) || (TIE_PRIORITY.indexOf(a) - TIE_PRIORITY.indexOf(b)))
    .map((team, index) => ({
      rank: index + 1,
      team,
      score: score[team]
    }));
}

function maybeAwardAllFinishedBonus(team) {
  if (finishedAllOrder.includes(team)) return;
  const teamSoldiers = soldiers.filter(s => s.team === team);
  if (teamSoldiers.length === 0) return;
  const allFinished = teamSoldiers.every(s => s.state === "finished");
  if (!allFinished) return;

  finishedAllOrder.push(team);
  const placeIndex = finishedAllOrder.length - 1;
  const bonus = FINISH_ALL_BONUS[placeIndex] || 0;
  if (bonus > 0) {
    score[team] += bonus;
    log(`${team.toUpperCase()} finished all soldiers (${placeIndex + 1}${placeIndex === 0 ? "st" : placeIndex === 1 ? "nd" : "rd"}) and gains +${bonus} bonus points`);
  }
}
// Helper for Random AI to get type string
function getTypeById(id) {
    if (id === 2) return "barricade";
    if (id === 3) return "gun";
    if (id === 4) return "freeze";
    if (id === 5) return "nuke";
    return "";
}



/**********************
 *  LEGALITY 
 **********************/
function getDirectionVector(direction) {
  if (direction === "right") return { dx: 1, dy: 0 };
  if (direction === "left") return { dx: -1, dy: 0 };
  if (direction === "up") return { dx: 0, dy: 1 };
  if (direction === "down") return { dx: 0, dy: -1 };
  return { dx: 0, dy: 0 };
}

function getVirtualStartPosition(s) {
  if (s.state !== "start") return { x: s.x, y: s.y };
  if (s.direction === "right") return { x: -1, y: s.y };
  if (s.direction === "left") return { x: BOARD_SIZE, y: s.y };
  if (s.direction === "up") return { x: s.x, y: -1 };
  if (s.direction === "down") return { x: s.x, y: BOARD_SIZE };
  return { x: s.x, y: s.y };
}

function getLaneValueForDirection(s) {
  return s.direction === "right" || s.direction === "left" ? s.y : s.x;
}

function canMoveSoldier(s, steps) {
  if (s.state !== "start" && s.state !== "board") return false;

  // 🔒 FREEZE CHECK
  if (isFrozen(s)) return false;

  const { dx, dy } = getDirectionVector(s.direction);
  const start = getVirtualStartPosition(s);
  let startX = start.x;
  let startY = start.y;

  let prevX = startX;
  let prevY = startY;

  for (let step = 1; step <= steps; step++) {
    let x = startX;
    let y = startY;

    x += dx * step;
    y += dy * step;

    // off board (exact finish handled elsewhere)
    if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) {
      if (step !== steps) return false;
    }

    // barricade blocks movement BETWEEN squares
      if (blocksMovement(prevX, prevY, x, y, s)) return false;
    

    const key = `${x},${y}`;
    if (board[key]) {
  const occupant = board[key];

  // blocked before destination
     if (step !== steps) {
    // Only revealed ID-4 may pass through frozen soldiers (enemy or friendly)
        if (!(s.id === 4 && s.revealed && occupant.frozenBy !== undefined)) {
      return false;
      }
    }

  // friendly block at destination (never allowed)
      if (step === steps && occupant.team === s.team) {
        return false;
      }
}


    prevX = x;
    prevY = y;
  }

  return true;
}

function getLegalMoves(team, dice) {
  return soldiers.filter(
    s =>
      s.team === team &&
      (s.state === "start" || s.state === "board") &&
      canMoveSoldier(s, dice)
  );
}
function getLegalPowers(team) {
  return soldiers.filter(s => {
    if (s.team !== team) return false;
    if (!canUsePower(s)) return false;

    // ID-1 has no power
    if (s.id === 1) return false;

    return true;
  });
}
function canUsePower(s) {
  if (s.state !== "board") return false;
  if (s.powerUsed) return false;
  if (isFrozen(s)) return false;
  return true;
}


function canFinishSoldier(s, steps) {
  if (s.state !== "start" && s.state !== "board") return false;
  const { dx, dy } = getDirectionVector(s.direction);
  const start = getVirtualStartPosition(s);
  const destX = start.x + dx * steps;
  const destY = start.y + dy * steps;
  if (s.direction === "right") return destX === BOARD_SIZE;
  if (s.direction === "left") return destX === -1;
  if (s.direction === "up") return destY === BOARD_SIZE;
  if (s.direction === "down") return destY === -1;
  return false;
}

/**********************
 * MOVE EXECUTION (COLLISION AWARE)
 **********************/

function moveSoldier(s, steps) {
  const { dx, dy } = getDirectionVector(s.direction);
  const start = getVirtualStartPosition(s);
  let startX = start.x;
  let startY = start.y;

  let destX = startX;
  let destY = startY;

  destX += dx * steps;
  destY += dy * steps;

  const destKey = `${destX},${destY}`;

  // melee kill at destination
  if (board[destKey]) {
    const victim = board[destKey];
    killSoldier(victim, "melee", s);
  }

  // remove old position
  if (s.state === "board") {
    delete board[`${s.x},${s.y}`];
  }

  // place soldier
  s.x = destX;
  s.y = destY;
  s.state = "board";
  board[destKey] = s;

  log(
    "Soldier",
    s.id,
    "moved to",
    `(${destX}, ${destY})`
  );
}


/**********************
 * Placement of Soldiers
 **********************/

function pickWeightedLane(id, availableLanes) {
  // 1. Get weights for this ID
  const weights = LANE_WEIGHTS[id];
  if (!weights) return availableLanes[Math.floor(Math.random() * availableLanes.length)];

  // 2. Filter weights for ONLY available lanes
  const candidates = availableLanes.map(lane => ({
    lane: lane,
    weight: weights[lane]
  }));

  // 3. Calculate Total Pool
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

  // 4. Fallback (if weights are somehow 0, usually impossible)
  if (totalWeight <= 0) {
    return availableLanes[Math.floor(Math.random() * availableLanes.length)];
  }

  // 5. Spin the Wheel (0 to Total)
  let randomVal = Math.random() * totalWeight;

  // 6. Select
  for (const c of candidates) {
    randomVal -= c.weight;
    if (randomVal <= 0) {
      return c.lane;
    }
  }

  // Rounding safety
  return candidates[candidates.length - 1].lane;
}
function aiPlaceOneSoldier_Main(team) {
  // 1. Idempotency Guard: If it's not my turn or not placement phase, stop.
  if (phase !== "placement" || currentPlayer !== team) return;

  log(`AI (${team}) is thinking about placement...`);

  const mySoldiers = soldiers.filter(s => s.team === team && s.state === "inventory");
  
  // If no soldiers left to place, we are done (shouldn't happen due to logic elsewhere, but safe)
  if (mySoldiers.length === 0) return;

  // 🧠 ORDER LOGIC (Per Turn Decision)
  // We re-roll the "Smart vs Chaos" decision every turn. 
  // This actually adds to the bluffing! (Sometimes it acts smart, sometimes random).
  let draftOrder;
  if (Math.random() < 0.40) {
    // 40%: Smart Order (Prioritize High Value)
    draftOrder = [5, 4, 3, 2, 1];
    
    // Occasional bluff swap
    if (Math.random() < 0.5) {
       [draftOrder[1], draftOrder[2]] = [draftOrder[2], draftOrder[1]];
    }
  } else {
    // 60%: Total Chaos
    draftOrder = [1, 2, 3, 4, 5];
    for (let i = draftOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [draftOrder[i], draftOrder[j]] = [draftOrder[j], draftOrder[i]];
    }
  }

  // 2. Find the FIRST available soldier in our decided order
  let soldierToPlace = null;
  for (const id of draftOrder) {
    const s = mySoldiers.find(soldier => soldier.id === id);
    if (s) {
      soldierToPlace = s;
      break; // Found our guy, stop looking
    }
  }

  if (!soldierToPlace) return; // Should never happen

  // 3. Pick a Lane
  const availableLanes = getAvailableStartLanesForTeam(team);
  if (availableLanes.length === 0) {
      log("Error: No lanes left for placement!");
      return;
  }

  const pickedLane = pickWeightedLane(soldierToPlace.id, availableLanes);

  // 4. Place JUST THIS ONE
  placeSoldierOnStart(soldierToPlace, pickedLane);
  
  // 5. Pass turn back to Human
  advancePlacementTurn();
}

function placeSoldierOnStart(s,lane) {
  const usedLanes = soldiers
    .filter(o =>
      o.team === s.team &&
      o.state === "start" &&
      o !== s
    )
    .map(getLaneValueForDirection);

  const availableLanes = [...Array(BOARD_SIZE).keys()]
    .filter(lane => !usedLanes.includes(lane));

  if (availableLanes.length === 0) {
    console.error("No available start lanes for", s.team);
    return;
  }
  if (!Number.isInteger(lane)) {
  log("Lane must be a number between 0 and 11");
  return;
}

 if (lane < 0 || lane >= BOARD_SIZE || !availableLanes.includes(lane)) {
  log("Invalid or occupied lane");
  return;
}

  s.state = "start";
  s.powerUsed=false;
  s.revealed=false;
  s.frozenBy= undefined;

  if (s.direction === "right" || s.direction === "left") {
    s.x = null;
    s.y = lane;
  } else {
    s.y = null;
    s.x = lane;
  }

  //  CENTRALIZED LOGGING
  log(
    `${s.team} soldier ${s.id} placed on start at`,
    (s.direction === "right" || s.direction === "left")
      ? `(start, y=${s.y})`
      : `(x=${s.x}, start)`
  );
 
}
function placeDuringPlacement(team, id,lane) {
  if (phase !== "placement") {
    log("Not in placement phase");
    return;
  }

  if (team !== currentPlayer) {
    log("Not your turn");
    return;
  }

  const s = soldiers.find(
    s => s.team === team && s.id === id && s.state === "inventory"
  );

  if (!s) {
    log("Invalid soldier for placement");
    return;
  }
  placeSoldierOnStart(s,lane); // ← your existing function
  advancePlacementTurn();
}
function advancePlacementTurn() {
  const turnOrder = getConfiguredTeams();
  const idx = turnOrder.indexOf(currentPlayer);
  currentPlayer = turnOrder[(idx + 1 + turnOrder.length) % turnOrder.length];
 
  const allAssigned = soldiers
    .filter(s => turnOrder.includes(s.team))
    .every(s => s.state === "start");

 if (allAssigned) {
    // ... (existing main game transition code) ...
    phase = "main";
    LAST_MAIN_PHASE_FIRST_PLAYER = currentPlayer;
    // Keep turn continuity:
    // advancePlacementTurn() already moved currentPlayer to the next player
    // after the one who just placed the final soldier.
    log("Placement complete.");
    log("Main game begins. First move:", currentPlayer.toUpperCase());
    log("Choose roll or power");
    
    scheduleCurrentMainTurnIfAI();
    return;
  }

  // Placement NOT complete -> Next turn
  log("Next placement:", currentPlayer.toUpperCase());
  
  scheduleCurrentPlacementIfAI();
}

/**********************
 * killing of Soldiers
 **********************/
function killSoldier(target, cause, by = null) {
  // Guard: already dead/finished
  if (target.state !== "board") return;

  // 2) Remove from board (centralized)
  removeSoldierFromBoard(target);

  // 3) State transition
  target.state = "dead";
  maybeAnnounceTeamAllDead(target.team);

  // 4) unReveal on death (locked rule)
  target.revealed = false;

  // 5) Log (visibility-safe)
  if (by && typeof by === "object") {
    logVisible(
      currentPlayer,
      "KILL:",
      target,
      cause ? `cause=${cause}` : "",
      "by",
      by
    );
  } else if (typeof by === "string") {
    logVisible(
      currentPlayer,
      "KILL:",
      target,
      cause ? `cause=${cause}` : "",
      "by",
      by.toUpperCase()
    );
  } else {
    logVisible(
      currentPlayer,
      "KILL:",
      target,
      cause ? `cause=${cause}` : ""
    );
  }

  killedThisTurn.push(target);
}

function removeSoldierFromBoard(s) {
  if (s.x !== null && s.x !== undefined &&
      s.y !== null && s.y !== undefined) {
    delete board[`${s.x},${s.y}`];
  }
  s.x = null;
  s.y = null;
}

/**********************
 * Resruction
 **********************/
function finishSoldier(s) {
  removeSoldierFromBoard(s);
  cleanupPersistentEffects(s);

  s.state = "finished";
  s.revealed = false;
  delete s.x;
  delete s.y;

  score[currentPlayer] += s.id;
  maybeAwardAllFinishedBonus(currentPlayer);
  logVisible(
    currentPlayer,
    "Soldier finished:",
    s
  );
  log(
    "Score =>",
    `Blue: ${score.blue}, Red: ${score.red}, Yellow: ${score.yellow}, Green: ${score.green}`
  );

  const dead = soldiers.filter(
    o => o.team === currentPlayer && o.state === "dead"
  );

  // 🚨 CHANGE: Return true if resurrection is pending
  if (dead.length > 0) {
    resurrectionPending = {
      team: currentPlayer,
      ids: dead.map(o => o.id)
    };

    log(
      "Choose soldier to resurrect:",
      resurrectionPending.ids.join(", ")
    );
    return true; // Keep turn open
  }

  return false; // Safe to close
}
function resurrectSoldierChoice(id, lane) {
  if (!resurrectionPending) {
    log("No resurrection pending");
    return;
  }

  if (currentPlayer !== resurrectionPending.team) {
    log("Not your resurrection");
    return;
  }

  if (!resurrectionPending.ids.includes(id)) {
    log("Invalid soldier for resurrection");
    return;
  }

  const s = soldiers.find(
    o => o.team === currentPlayer && o.id === id && o.state === "dead"
  );

  s.state = "inventory";
  s.powerUsed = false;
  s.revealed = false;
  s.frozenBy = undefined;
  s.x = null;
  s.y = null;

  placeSoldierOnStart(s, lane);

  logVisible(
  currentPlayer,
  "Resurrected soldier at lane",
  lane,
  s
);

  resurrectionPending = null;
  endTurn();
}
// Helper to avoid code duplication in AI
function handleAIResurrection_Main() {
  const choices = resurrectionPending.ids;
  if (!choices || choices.length === 0) {
    endTurn();
    return;
  }
  
  const lanes = getAvailableStartLanesForTeam(currentPlayer);
  if (lanes.length === 0) {
    endTurn();
    return;
  }
  
  // 🧠 SMART UPDATE: Use weighted logic
  // 70% highest ID, 30% random dead
const bestID = Math.random() < 0.7
  ? Math.max(...choices)
  : choices[Math.floor(Math.random() * choices.length)];

  const pickedLane = pickWeightedLane(bestID, lanes);
  
  resurrectSoldierChoice(bestID, pickedLane);
}

/**********************
 * Endgame logic
 **********************/
function checkGameEnd() {
  return getAliveTeams().length <= 1;
}

function clearNoMoveSkipPending() {
  if (noMoveSkipTimer !== null) {
    clearTimeout(noMoveSkipTimer);
    noMoveSkipTimer = null;
  }
  noMoveSkipPending = false;
}

function scheduleNoMoveSkip() {
  if (noMoveSkipPending) return;
  const delay = gameMode === "ava" ? 0 : 1000;
  noMoveSkipPending = true;
  noMoveSkipTimer = setTimeout(() => {
    noMoveSkipTimer = null;
    noMoveSkipPending = false;
    endTurn();
  }, delay);
}


function endOfTurnCleanup() {
  for (const s of killedThisTurn) {
    cleanupPersistentEffects(s);
  }
  killedThisTurn.length = 0;
}
function resolveEndgame(winner, ranking = []) {
  if (phase === "gameover") return;

  soldiers.forEach(s => {
    if (s.team !== winner && s.state === "board") {
      killSoldier(s, "endgame", null);
    }
  });
  console.assert(
    PLAYERS.includes(winner) || winner === "draw",
    "Invalid winner value"
  );


  log("GAME OVER");
  log("Winner:", winner);
  if (ranking.length > 0) {
    log(
      "Final Ranking:",
      ranking.map(r => `${r.rank}) ${r.team.toUpperCase()} (${r.score})`).join(" | ")
    );
  }
  log(
    "Score =>",
    `Blue: ${score.blue}, Red: ${score.red}, Yellow: ${score.yellow}, Green: ${score.green}`
  );

  endOfTurnCleanup();
}

/**********************
 * TURN HANDLER
 **********************/

function takeTurnMovement(team, id, steps) {
  if (team !== currentPlayer) {
    log("Not your turn");
    return false; // Signal: did not keep open
  }

  if (phase === "main" && pendingRoll === null) {
    log("You must roll before moving");
    return false;
  }

  const legalMoves = getLegalMoves(team, steps);

  if (legalMoves.length === 0) {
    log("No legal moves. Turn skipped.");
    endTurn();
    return false;
  }

  const s = legalMoves.find(s => s.id === id);
  if (!s) {
    log("Selected soldier cannot move with this roll");
    return false;
  }

  // 🔚 FINISH CHECK FIRST
  if (canFinishSoldier(s, steps)) {
    const keepOpen = finishSoldier(s); // Capture the signal
    if (keepOpen) {
        return true; // 🚨 Bubble up: Keep turn open
    }
    // If no resurrection, standard finish
    endTurn();
    return false;
  }

  // ▶️ NORMAL MOVE
  moveSoldier(s, steps);
  
  // 🟦 ID-4 POST-MOVE EXCEPTION
  if (
    s.id === 4 &&
    s.state === "board" &&
    !s.powerUsed &&
    !isFrozen(s)
  ) {
    pendingPostMovePower = { soldier: s };
    log("Use ID-4 freeze power? (yes / no)");
    return true; // 🚨 Bubble up: Keep turn open
  }

  endTurn();
  return false;
}
function takeTurnPower(team, id, powerType, param1,param2) {
  // Turn ownership
  if (team !== currentPlayer) {
    log("Not your turn");
    return false;
  }

  // Phase guard
  if (phase !== "main") {
    log("Cannot use power outside main phase");
    return false;
  }

  // Cannot mix roll & power
  if (pendingRoll !== null) {
    log("You already chose roll this turn");
    return false;
  }

  const legalPowers = getLegalPowers(team);

  if (legalPowers.length === 0) {
    log("No legal power available. Please choose roll.");
    return false;
  }

  const s = legalPowers.find(o => o.id === id);
  if (!s) {
    log("Selected soldier cannot use power");
    return false;
  }

  let powerExecuted = false;

  // ---- EXECUTE POWER ----
  switch (powerType) {
    case "gun":
      if (s.id !== 3) {
        log("This soldier cannot use gun");
        return false;
      }
      fireGun(s, param1); // param = direction
      powerExecuted = true;
      break;

    case "freeze":
      if (s.id !== 4) {
        log("This soldier cannot freeze");
        return false;
      }
      applyFreeze(s);
      powerExecuted = true;
      break;

    case "barricade":
      if (s.id !== 2) {
        log("This soldier cannot deploy barricade");
        return false;
      }
      powerExecuted = useManualBarricade(s, param1,param2); // param = {orientation, direction}
      break;

    case "nuke":
      if (s.id !== 5) {
        log("This soldier cannot fire nuke");
        return false;
      }
      fireNuke(s, param1); // param = orientation
      powerExecuted = true;
      break;

    default:
      log("Unknown power type");
      return false;
  }

  if (!powerExecuted) {
    return false;
  }

  // Mark power used
  s.powerUsed = true;
  s.revealed=true;
  // End turn cleanly
  endTurn();
  return true;
}
/**********************
 * BATCH SIMULATION FRAMEWORK v2.1 (Hardened)
 **********************/
// ⚠️ OVERRIDE Helper: Hijack Math.random for the batch run
// IMPORTANT: Paste this AFTER your existing rollDice function to override it
function rollDice() {
 
  const roll = Math.floor(Math.random() * 3) + 1;
  
  // 🔧 FIX: Update the global state!
  pendingRoll = roll; 
  
  // Only log if we are NOT in batch mode (or if debugging is manually forced)
  // We check 'DEBUG' because we set it to false during batch runs to prevent spam
  if (DEBUG) console.log(`${currentPlayer.toUpperCase()} rolled ${roll}`);
  
  return roll;
}
// 1. Seedable RNG (Mulberry32)
function seedRandom(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// 2. The Simulation Controller
function runBatchSimulation(count = 100, seed = null, blueType = "main", redType = "main") {
    console.log(`\n🚀 STARTING BATCH SIMULATION: ${count} Games`);
    console.log(`🤖 CONFIG: Blue=[${blueType}] vs Red=[${redType}]`);
    
    // Validate Inputs
    if (!AI_POLICIES[blueType] || !AI_POLICIES[redType]) {
        console.error("Invalid AI Type. Options: main, random, greedy");
        return;
    }
    
    // --- RNG HIJACK FOR DETERMINISM ---
    const originalMathRandom = Math.random; // Save original state
    const prevDebug = DEBUG;
    const prevSync = SIMULATION_SYNC_MODE;
    DEBUG = false; // Silence logs for speed
    SIMULATION_SYNC_MODE = true;

    // Data Storage
    const results = {
        meta: { totalGames: count, seed: seed, timestamp: new Date().toISOString() },
        summary: { blueWins: 0, redWins: 0, draws: 0, errors: 0, avgTurns: 0 },
        games: []
    };

    const startTime = Date.now();
    let totalTurnsAccumulated = 0;

    // 🛡️ SAFETY WRAPPER: Guarantees cleanup even if code crashes
    try {
        if (seed !== null) {
            console.log(`🔒 SEEDED RUN: ${seed} (Full Determinism)`);
            const seededRNG = seedRandom(seed);
            Math.random = seededRNG; // Overwrite global Math.random
        }

        for (let i = 1; i <= count; i++) {
            // A. RESET
            debugReset(); 
            gameMode = "ava"; 

            // 🆕 SET AI TYPES

            playerAI["blue"] = blueType;
            playerAI["red"] = redType;
            
            // B. EXECUTE FULL GAME
            const gameLog = runSingleHeadlessGame(i);
            
            // C. LOG DATA
            results.games.push(gameLog);
            
            if (gameLog.result === "blue") results.summary.blueWins++;
            else if (gameLog.result === "red") results.summary.redWins++;
            else if (gameLog.result === "draw") results.summary.draws++;
            else results.summary.errors++;

            totalTurnsAccumulated += gameLog.turns;

            // Progress Heartbeat (every 5%)
            if (i % Math.ceil(count / 20) === 0) process.stdout.write(".");
        }
        
        // Calculate Stats (only if we finished the loop)
        const duration = Date.now() - startTime;
        results.summary.avgTurns = Math.round(totalTurnsAccumulated / count);
        results.meta.durationMs = duration;

        // E. REPORT
        console.log(`\n\n📊 SIMULATION COMPLETE (${duration}ms)`);
        console.log("-------------------------------------");
        console.log(`Blue Wins: ${results.summary.blueWins} (${((results.summary.blueWins/count)*100).toFixed(1)}%)`);
        console.log(`Red Wins:  ${results.summary.redWins} (${((results.summary.redWins/count)*100).toFixed(1)}%)`);
        console.log(`Draws:     ${results.summary.draws}`);
        console.log(`Errors:    ${results.summary.errors}`);
        console.log(`Avg Turns: ${results.summary.avgTurns}`);
        console.log("-------------------------------------");

    } catch (criticalError) {
        console.error("\n💥 CRITICAL BATCH FAILURE:", criticalError);
    } finally {
        // 🧼 CLEANUP (Guaranteed to run)
        Math.random = originalMathRandom; // Restore standard RNG
        DEBUG = prevDebug; 
        SIMULATION_SYNC_MODE = prevSync;
        console.log("✅ RNG Restored. Debug mode reset.");
    }
    
    return results;
}

// (Keep runSingleHeadlessGame as is from previous version)
function runSingleHeadlessGame(gameId) {
    let turns = 0;
    const startTurnCount = SIM_MAIN_TURN_COUNTER;
    let safetyPlacement = 0;
    let safetyMain = 0;
    let firstMainPlayer = null;
    
    // Limits
    const LIMIT_PLACEMENT = 1000;
    const LIMIT_MAIN = 5000; 
    
    let errorFlag = false;
    let endReason = "unknown";

    try {
        while (phase === "placement") {
            if (safetyPlacement >= LIMIT_PLACEMENT) throw new Error("placement_fail");
            aiPlaceOneSoldier(currentPlayer);
            safetyPlacement++;
        }

        firstMainPlayer = LAST_MAIN_PHASE_FIRST_PLAYER;

        while (phase !== "gameover") {
            if (safetyMain >= LIMIT_MAIN) {
                endReason = "draw_limit";
                gameWinner = "draw";
                break; 
            }
            aiPlayTurn();
            turns++;
            safetyMain++;
        }

        if (phase === "gameover" && endReason === "unknown") endReason = "win";

    } catch (e) {
        errorFlag = true;
        if (e.message === "placement_fail") endReason = "placement_fail";
        else endReason = `exception: ${e.message}`;
    }

    return {
        id: gameId,
        result: errorFlag ? "error" : gameWinner,
        turns: Math.max(turns, SIM_MAIN_TURN_COUNTER - startTurnCount),
        endReason: endReason,
        firstMainPlayer
    };
}

/**********************
 * Test Phase
 **********************/
function printBoard() {
  const size = 12;

  // --- build grid ---
  let grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => " . ")
  );

  // place soldiers
  for (const s of soldiers) {
    if (s.state === "board") {

      // 👇 VISIBILITY LOGIC HERE
      let label = visibleName(s, currentPlayer);

      // freeze marker (does NOT reveal identity)
      if (isFrozen(s)) label = "*" + label;

      // power-used marker
      if (s.powerUsed) label = label + "!";

      grid[s.y][s.x] = label.padStart(3, " ");
    }
  }

  // header
  console.log(
    "\n     " +
      Array.from({ length: size }, (_, i) =>
        i.toString().padStart(2, " ")
      ).join("   ")
  );
  console.log("    -----------------------------------------------------------");

  for (let y = size - 1; y >= 0; y--) {

    // -------- main row (cells + vertical barricades) --------
    let row = y.toString().padStart(2, " ") + " |";

    for (let x = 0; x < size; x++) {
      row += grid[y][x];

      if (x < size - 1) {
        const b = getVerticalBarricadeAt(x + 1, y);
        if (b) {
          row += b.direction === "forward" ? "|>" : "<|";
        } else {
          row += "  ";
        }
      }
    }

    console.log(row);

    // -------- horizontal barricade row --------
    if (y > 0) {
      let hRow = "   |";

      for (let x = 0; x < size; x++) {
        const b = getHorizontalBarricadeAt(x, y);
        if (b) {
          hRow += b.direction === "forward" ? "^^^" : "vvv";
        } else {
          hRow += "   ";
        }
        hRow += "  ";
      }

      console.log(hRow);
    }
  }

  // footer
  if (barricades.length === 0) {
    console.log("\nNo barricades");
  } else {
    console.log("\nBarricades:");
    barricades.forEach((b, i) => {
      console.log(`${i}: (${b.x}, ${b.y}) ${b.orientation} ${b.direction}`);
    });
  }
}



function getVerticalBarricadeAt(edgeX, y) {
  return barricades.find(b =>
    b.orientation === "vertical" &&
    (
      (b.direction === "forward" && edgeX === b.x + 1) ||
      (b.direction === "backward" && edgeX === b.x)
    ) &&
    y >= b.y - 1 &&
    y <= b.y + 1
  );
}

function getHorizontalBarricadeAt(x, edgeY) {
  return barricades.find(b =>
    b.orientation === "horizontal" &&
    (
      (b.direction === "forward" && edgeY === b.y + 1) ||
      (b.direction === "backward" && edgeY === b.y)
    ) &&
    x >= b.x - 1 &&
    x <= b.x + 1
  );
}

function debugplaceSoldier(team, id, x, y) {
  if (phase !== "main") {
  console.log("change phase to main before using");
  return;
}
  const s = soldiers.find(
    soldier => soldier.team === team && soldier.id === id
  );

  if (!s) {
    console.log("No such soldier:", team, id);
    return;
  }

  // Bounds check
  if (x < 0 || x >= 12 || y < 0 || y >= 12) {
    console.log("Invalid board coordinates:", x, y);
    return;
  }

  const key = `${x},${y}`;

  // Prevent overlap
  if (board[key]) {
    console.log(
      `Square (${x}, ${y}) already occupied by ${board[key].team.toUpperCase()}${board[key].id}`
    );
    return;
  }

  // Remove from old board position if needed
  if (s.state === "board") {
    delete board[`${s.x},${s.y}`];
  }

  // Place soldier
  s.state = "board";
  s.x = x;
  s.y = y;
  board[key] = s;

  // Clear transient flags (important for tests)
  s.powerUsed = false;
  s.frozenBy = undefined;
  s.revealed = false;

  console.log(`DEBUG: Placed ${team.toUpperCase()}${id} at (${x}, ${y})`);
}


function debugRandomPlace(team) {
 

  // Clear existing board positions for this team
  for (const s of soldiers) {
    if (s.team === team) {
      if (s.state === "board") {
        delete board[`${s.x},${s.y}`];
      }
      s.state = "inventory";
      delete s.x;
      delete s.y;
    }
  }

  // Collect occupied squares (other team + already placed)
  const occupied = new Set(
    soldiers
      .filter(s => s.state === "board")
      .map(s => `${s.x},${s.y}`)
  );

  // Get this team's soldiers
  const teamSoldiers = soldiers.filter(s => s.team === team);

  for (const s of teamSoldiers) {
    let placed = false;

    while (!placed) {
      const x = Math.floor(Math.random() * 12);
      const y = Math.floor(Math.random() * 12);
      const key = `${x},${y}`;

      if (!occupied.has(key)) {
        s.x = x;
        s.y = y;
        s.state = "board";
        board[key] = s;
        occupied.add(key);
        placed = true;
      }
    }
  }

  log(`Randomly placed all ${team.toUpperCase()} soldiers on board`);
}


function debugReset() {
  clearNoMoveSkipPending();

  // clear board safely
  for (const key in board) {
    delete board[key];
  }

  // clear barricades safely
  barricades.length = 0;

  // reset soldiers
  for (const s of soldiers) {
    s.state = "inventory";
    s.powerUsed = false;
    s.revealed = false;
    s.frozenBy= undefined;
    s.x = null;
    s.y = null;
  }

  score.blue = 0;
  score.red = 0;
  score.yellow = 0;
  score.green = 0;


endOfTurnCleanup();
 pendingRoll = null;
resurrectionPending = null;
pendingPostMovePower = null;
gameWinner = null;
finalRanking = [];
finishedAllOrder = [];
teamAllDeadAnnounced = {
  blue: false,
  red: false,
  yellow: false,
  green: false
};
powerVisualSeq = 0;
powerVisualEvents = [];
SIM_MAIN_TURN_COUNTER = 0;
OBSERVER_TURNS_SINCE_PRINT = 0;
LAST_MAIN_PHASE_FIRST_PLAYER = null;

  phase = "placement";

  const turnOrder = getConfiguredTeams();
  placementFirstPlayer = turnOrder[Math.floor(Math.random() * turnOrder.length)];
  placementSecondPlayer = turnOrder[(turnOrder.indexOf(placementFirstPlayer) + 1) % turnOrder.length];

  currentPlayer = placementFirstPlayer;

  log("Game reset.");
  log("Placement starts with", placementFirstPlayer.toUpperCase());
}

function debugKillSoldier(team, id) {
  const s = soldiers.find(
    s => s.team === team && s.id === id
  );

  if (!s) {
    console.log("No such soldier:", team, id);
    return;
  }

  // killing
   killSoldier(s, "debug");

  console.log(`Killed ${team.toUpperCase()}${id}`);
}

function forceGameState({ phase: newPhase, turn: newTurn }) {
  if (newPhase !== undefined) {
    if (!PHASES.includes(newPhase)) {
      log("Invalid phase:", newPhase);
      return;
    }
    phase = newPhase;
    log("Phase forced to:", phase);
  }

  if (newTurn !== undefined) {
    if (!PLAYERS.includes(newTurn)) {
      log("Invalid player:", newTurn);
      return;
    }
    currentPlayer = newTurn;
    log("Turn forced to:", currentPlayer.toUpperCase());
  }
}
function autoplay(games = 10) {
  const prevDebug = DEBUG;
  DEBUG = false; // 🔇 silence move-by-move logs
  gameMode = "ava";
  let stats = {
  games: 0,
  blueWins: 0,
  redWins: 0,
  yellowWins: 0,
  greenWins: 0,
  draws: 0,
  maxTurns: 0,
   totalTurns: 0
};

  log(`Starting autoplay for ${games} games`);

  for (let g = 1; g <= games; g++) {
    log(`\n--- Game ${g} ---`);

    debugReset();
    forceGameState({ phase: "main", turn: "red" });

    debugRandomPlace("red");
    debugRandomPlace("blue");

    let safety = 0;

    while (phase !== "gameover" && safety < 5000) {
      aiPlayTurn();
      safety++;  
    }

   if (safety >= 5000) {
  console.log(`⚠️ Infinite loop detected in game ${g}`);
  stats.games++;
  stats.maxTurns = Math.max(stats.maxTurns, safety);
  stats.draws++; // treat as draw
  continue; // move to next game
}


log(`Game ${g} finished safely`);
stats.games++;
stats.maxTurns = Math.max(stats.maxTurns, safety);
stats.totalTurns += safety;

if (gameWinner === "blue") stats.blueWins++;
else if (gameWinner === "red") stats.redWins++;
else if (gameWinner === "yellow") stats.yellowWins++;
else if (gameWinner === "green") stats.greenWins++;
else stats.draws++;

}
    DEBUG = prevDebug; // 🔊 restore normal logging
stats.avgTurns = Math.round(stats.totalTurns / stats.games);
delete stats.totalTurns;
  console.log("STATS:", stats);
  console.log("Autoplay complete");
  
}

function runBatchSimulation4(
  count = 100,
  seed = null,
  blueType = "main",
  redType = "main",
  yellowType = "main",
  greenType = "main"
) {
  console.log(`\nSTARTING 4P BATCH SIMULATION: ${count} Games`);
  console.log(
    `CONFIG: BLUE=[${blueType}] RED=[${redType}] YELLOW=[${yellowType}] GREEN=[${greenType}]`
  );

  if (
    !AI_POLICIES[blueType] ||
    !AI_POLICIES[redType] ||
    !AI_POLICIES[yellowType] ||
    !AI_POLICIES[greenType]
  ) {
    console.error("Invalid AI Type. Options: main, main4, random, greedy, human, none");
    return;
  }

  const originalMathRandom = Math.random;
  const prevDebug = DEBUG;
  const prevSync = SIMULATION_SYNC_MODE;
  DEBUG = false;
  SIMULATION_SYNC_MODE = true;

  const results = {
    meta: { totalGames: count, seed: seed, timestamp: new Date().toISOString() },
    summary: {
      blueWins: 0,
      redWins: 0,
      yellowWins: 0,
      greenWins: 0,
      firstMainBlue: 0,
      firstMainRed: 0,
      firstMainYellow: 0,
      firstMainGreen: 0,
      draws: 0,
      errors: 0,
      avgTurns: 0
    },
    games: []
  };

  const startTime = Date.now();
  let totalTurnsAccumulated = 0;

  try {
    if (seed !== null) {
      console.log(`SEEDED RUN: ${seed} (Full Determinism)`);
      Math.random = seedRandom(seed);
    }

    for (let i = 1; i <= count; i++) {
      playerAI["blue"] = blueType;
      playerAI["red"] = redType;
      playerAI["yellow"] = yellowType;
      playerAI["green"] = greenType;
      debugReset();
      gameMode = "ava";

      const gameLog = runSingleHeadlessGame(i);
      results.games.push(gameLog);

      if (gameLog.result === "blue") results.summary.blueWins++;
      else if (gameLog.result === "red") results.summary.redWins++;
      else if (gameLog.result === "yellow") results.summary.yellowWins++;
      else if (gameLog.result === "green") results.summary.greenWins++;
      else if (gameLog.result === "draw") results.summary.draws++;
      else results.summary.errors++;

      if (gameLog.firstMainPlayer === "blue") results.summary.firstMainBlue++;
      else if (gameLog.firstMainPlayer === "red") results.summary.firstMainRed++;
      else if (gameLog.firstMainPlayer === "yellow") results.summary.firstMainYellow++;
      else if (gameLog.firstMainPlayer === "green") results.summary.firstMainGreen++;

      totalTurnsAccumulated += gameLog.turns;

      if (i % Math.ceil(count / 20) === 0) process.stdout.write(".");
    }

    const duration = Date.now() - startTime;
    results.summary.avgTurns = Math.round(totalTurnsAccumulated / count);
    results.meta.durationMs = duration;

    console.log(`\n\nSIMULATION COMPLETE (${duration}ms)`);
    console.log("-------------------------------------");
    console.log(
      `Blue Wins:   ${results.summary.blueWins} (${((results.summary.blueWins / count) * 100).toFixed(1)}%)`
    );
    console.log(
      `Red Wins:    ${results.summary.redWins} (${((results.summary.redWins / count) * 100).toFixed(1)}%)`
    );
    console.log(
      `Yellow Wins: ${results.summary.yellowWins} (${((results.summary.yellowWins / count) * 100).toFixed(1)}%)`
    );
    console.log(
      `Green Wins:  ${results.summary.greenWins} (${((results.summary.greenWins / count) * 100).toFixed(1)}%)`
    );
    console.log(`Draws:       ${results.summary.draws}`);
    console.log(`Errors:      ${results.summary.errors}`);
    console.log(`Avg Turns:   ${results.summary.avgTurns}`);
    console.log(
      `First Main:  BLUE ${results.summary.firstMainBlue} (${((results.summary.firstMainBlue / count) * 100).toFixed(1)}%) | ` +
      `RED ${results.summary.firstMainRed} (${((results.summary.firstMainRed / count) * 100).toFixed(1)}%) | ` +
      `YELLOW ${results.summary.firstMainYellow} (${((results.summary.firstMainYellow / count) * 100).toFixed(1)}%) | ` +
      `GREEN ${results.summary.firstMainGreen} (${((results.summary.firstMainGreen / count) * 100).toFixed(1)}%)`
    );
    console.log("-------------------------------------");
  } catch (criticalError) {
    console.error("\nCRITICAL BATCH FAILURE:", criticalError);
  } finally {
    Math.random = originalMathRandom;
    DEBUG = prevDebug;
    SIMULATION_SYNC_MODE = prevSync;
    console.log("RNG Restored. Debug mode reset.");
  }

  return results;
}

function buildStateSnapshot() {
  const activeSoldierPositions = soldiers
    .filter(s => s.state === "start" || s.state === "board")
    .map(s => {
      if (s.state === "board") {
        return `${s.team.toUpperCase()}${s.id}: board (${s.x},${s.y})`;
      }
      if (s.direction === "right" || s.direction === "left") {
        return `${s.team.toUpperCase()}${s.id}: start (lane y=${s.y})`;
      }
      return `${s.team.toUpperCase()}${s.id}: start (lane x=${s.x})`;
    });

  const barricadeState = barricades.map(b => {
    const owner =
      b.owner && b.owner.team && typeof b.owner.id === "number"
        ? `${b.owner.team.toUpperCase()}${b.owner.id}`
        : "UNKNOWN";
    return `${owner}: (${b.x},${b.y}) ${b.orientation}/${b.direction}`;
  });

  const frozenOnBoard = soldiers
    .filter(s => s.state === "board" && s.frozenBy)
    .map(s => {
      const by = `${s.frozenBy.team.toUpperCase()}${s.frozenBy.id}`;
      return `${s.team.toUpperCase()}${s.id} at (${s.x},${s.y}) frozenBy ${by}`;
    });

  return {
    phase,
    currentPlayer,
    pendingRoll,
    resurrectionPending: resurrectionPending
      ? { team: resurrectionPending.team, ids: [...resurrectionPending.ids] }
      : null,
    pendingPostMovePower: pendingPostMovePower
      ? {
          team: pendingPostMovePower.soldier.team,
          id: pendingPostMovePower.soldier.id
        }
      : null,
    score: { ...score },
    aliveTeams: getAliveTeams(),
    legalMovesNow:
      phase === "main" && pendingRoll !== null
        ? getLegalMoves(currentPlayer, pendingRoll).map(s => s.id)
        : [],
    legalPowersNow:
      phase === "main" ? getLegalPowers(currentPlayer).map(s => s.id) : [],
    activeSoldierPositions,
    barricadeState,
    frozenOnBoard
  };
}

function runMovementOnlySim(games = 10, maxTicksPerGame = 20000, baseSeed = null) {
  const prevDebug = DEBUG;
  const prevRandom = Math.random;
  DEBUG = false;
  const simSeed =
    Number.isInteger(baseSeed) && baseSeed >= 0
      ? baseSeed
      : Math.floor(Date.now() % 2147483647);

  const stats = {
    baseSeed: simSeed,
    games: 0,
    completed: 0,
    drawLimit: 0,
    blueWins: 0,
    redWins: 0,
    yellowWins: 0,
    greenWins: 0,
    stalledGames: [],
    totalTicks: 0,
    maxTicks: 0
  };

  for (let g = 1; g <= games; g++) {
    const gameSeed = (simSeed + g * 9973) >>> 0;
    Math.random = seedRandom(gameSeed);

    debugReset();
    gameMode = "hvh"; // keep deterministic command-style flow for tick/placeall
    placeAllRandomTurnByTurn();

    let ticks = 0;
    while (phase !== "gameover" && ticks < maxTicksPerGame) {
      tickCurrentPlayer(0.25);
      ticks++;
    }

    stats.games++;
    stats.totalTicks += ticks;
    stats.maxTicks = Math.max(stats.maxTicks, ticks);

    if (phase !== "gameover") {
      stats.drawLimit++;
      if (stats.stalledGames.length < 10) {
        stats.stalledGames.push({
          game: g,
          seed: gameSeed,
          ticks,
          snapshot: buildStateSnapshot()
        });
      }
      continue;
    }

    stats.completed++;
    if (gameWinner === "blue") stats.blueWins++;
    else if (gameWinner === "red") stats.redWins++;
    else if (gameWinner === "yellow") stats.yellowWins++;
    else if (gameWinner === "green") stats.greenWins++;
  }

  stats.avgTicks = stats.games > 0 ? Math.round(stats.totalTicks / stats.games) : 0;
  delete stats.totalTicks;

  Math.random = prevRandom;
  DEBUG = prevDebug;
  console.log("Simulation stats (25% power usage):", stats);
  return stats;
}

function replayMovementSeed(seed, maxTicksPerGame = 20000) {
  if (!Number.isFinite(seed)) {
    console.log("Usage: replaymove <seed> [maxTicksPerGame]");
    return;
  }

  const prevDebug = DEBUG;
  const prevRandom = Math.random;
  DEBUG = true;
  Math.random = seedRandom((Number(seed) >>> 0));

  debugReset();
  gameMode = "hvh";
  placeAllRandomTurnByTurn();

  let ticks = 0;
  while (phase !== "gameover" && ticks < maxTicksPerGame) {
    tickCurrentPlayer(0.25);
    ticks++;
  }

  const snapshot = buildStateSnapshot();
  Math.random = prevRandom;
  DEBUG = prevDebug;

  console.log("Replay result:", {
    seed: Number(seed) >>> 0,
    ticks,
    phase,
    gameWinner,
    snapshot
  });
}

function placeAllRandomTurnByTurn() {
  if (phase !== "placement") {
    log("placeall works only in placement phase");
    return;
  }

  while (phase === "placement") {
    const team = currentPlayer;
    const mySoldiers = soldiers.filter(
      s => s.team === team && s.state === "inventory"
    );
    const lanes = getAvailableStartLanesForTeam(team);

    if (mySoldiers.length === 0 || lanes.length === 0) {
      advancePlacementTurn();
      continue;
    }

    const s = mySoldiers[Math.floor(Math.random() * mySoldiers.length)];
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    placeSoldierOnStart(s, lane);
    advancePlacementTurn();
  }
}

function maybeAnnounceTeamAllDead(team) {
  if (teamAllDeadAnnounced[team]) return;
  const teamSoldiers = soldiers.filter(s => s.team === team);
  if (teamSoldiers.length === 0) return;
  const allDead = teamSoldiers.every(s => s.state === "dead");
  if (!allDead) return;
  teamAllDeadAnnounced[team] = true;
  log(`Team ${team.toUpperCase()} all soldiers killed out of game.`);
}

function tryRandomPowerForCurrentPlayer() {
  const legalPowers = getLegalPowers(currentPlayer);
  if (legalPowers.length === 0) return false;

  const shuffledPowers = [...legalPowers].sort(() => Math.random() - 0.5);
  for (const s of shuffledPowers) {
    if (s.id === 2) {
      const placements = [
        ["horizontal", "forward"],
        ["horizontal", "backward"],
        ["vertical", "forward"],
        ["vertical", "backward"]
      ].sort(() => Math.random() - 0.5);
      for (const [orientation, direction] of placements) {
        if (takeTurnPower(currentPlayer, s.id, "barricade", orientation, direction)) {
          return true;
        }
      }
      continue;
    }

    if (s.id === 3) {
      const dirs = ["up", "down", "left", "right"].sort(() => Math.random() - 0.5);
      for (const dir of dirs) {
        if (takeTurnPower(currentPlayer, s.id, "gun", dir)) {
          return true;
        }
      }
      continue;
    }

    if (s.id === 4) {
      if (takeTurnPower(currentPlayer, s.id, "freeze")) return true;
      continue;
    }

    if (s.id === 5) {
      const orients = ["horizontal", "vertical"].sort(() => Math.random() - 0.5);
      for (const orient of orients) {
        if (takeTurnPower(currentPlayer, s.id, "nuke", orient)) {
          return true;
        }
      }
    }
  }

  return false;
}

function tickCurrentPlayer(powerUseChance = 0) {
  if (phase !== "main") {
    log("tick works only in main phase");
    return;
  }

  if (resurrectionPending && resurrectionPending.team === currentPlayer) {
    const id =
      resurrectionPending.ids[
        Math.floor(Math.random() * resurrectionPending.ids.length)
      ];
    const lanes = getAvailableStartLanesForTeam(currentPlayer);
    if (lanes.length === 0) {
      resurrectionPending = null;
      endTurn();
      return;
    }
    const lane = lanes[Math.floor(Math.random() * lanes.length)];
    resurrectSoldierChoice(id, lane);
    return;
  }

  if (
    pendingPostMovePower &&
    pendingPostMovePower.soldier &&
    pendingPostMovePower.soldier.team === currentPlayer
  ) {
    pendingPostMovePower = null;
    endTurn();
    return;
  }

  if (pendingRoll === null && Math.random() < powerUseChance) {
    if (tryRandomPowerForCurrentPlayer()) {
      return;
    }
  }

  if (pendingRoll === null) {
    const dice = rollDice();
    const legalMoves = getLegalMoves(currentPlayer, dice);
    if (legalMoves.length === 0) {
      log("No legal moves. Turn skipped.");
      clearNoMoveSkipPending();
      endTurn();
      return;
    }
    pendingRoll = dice;
  }

  const legalMoves = getLegalMoves(currentPlayer, pendingRoll);
  if (legalMoves.length === 0) {
    log("No legal moves with pending roll. Turn skipped.");
    pendingRoll = null;
    endTurn();
    return;
  }

  const choice = legalMoves[Math.floor(Math.random() * legalMoves.length)];
  const keepOpen = takeTurnMovement(currentPlayer, choice.id, pendingRoll);
  if (!keepOpen) return;

  if (resurrectionPending && resurrectionPending.team === currentPlayer) {
    const id =
      resurrectionPending.ids[
        Math.floor(Math.random() * resurrectionPending.ids.length)
      ];
    const lanes = getAvailableStartLanesForTeam(currentPlayer);
    if (lanes.length > 0) {
      const lane = lanes[Math.floor(Math.random() * lanes.length)];
      resurrectSoldierChoice(id, lane);
    } else {
      resurrectionPending = null;
      endTurn();
    }
    return;
  }

  if (
    pendingPostMovePower &&
    pendingPostMovePower.soldier &&
    pendingPostMovePower.soldier.team === currentPlayer
  ) {
    pendingPostMovePower = null;
    endTurn();
  }
}


function handleCommand(cmd) {
  const parts = cmd.trim().split(/\s+/); // Handle multiple spaces
  const command = parts[0].toLowerCase();

  // --- 1. GAME START HANDLER (Unified) ---
if (command === "start") {
    // Unified usage:
    // start <blue_policy> <red_policy> <yellow_policy> <green_policy>
    // Example: start main greedy human human
    // Backward-compatible aliases:
    // start pvp | start hvh
    // start ava [b] [r] [y] [g]
    // start <ai_policy> <team>  (legacy Hva shortcut)

    const knownPolicies = Object.keys(AI_POLICIES);
    const modeOrBlue = parts[1] ? parts[1].toLowerCase() : "human";

    const applyPoliciesAndStart = (b, r, y, g) => {
      playerAI.blue = b;
      playerAI.red = r;
      playerAI.yellow = y;
      playerAI.green = g;

      const anyHuman = hasAnyHumanPlayers();
      const allHuman = PLAYERS.every(t => playerAI[t] === "human");
      if (allHuman) gameMode = "hvh";
      else if (anyHuman) gameMode = "hva";
      else gameMode = "ava";

      aiTeam = null;
      debugReset();
      // debugReset keeps state; restore selected policies after reset
      playerAI.blue = b;
      playerAI.red = r;
      playerAI.yellow = y;
      playerAI.green = g;

      console.log(
        `Game Started: BLUE=${b.toUpperCase()}, RED=${r.toUpperCase()}, YELLOW=${y.toUpperCase()}, GREEN=${g.toUpperCase()}`
      );
      scheduleCurrentPlacementIfAI();
    };

    // Alias: full human game
    if (modeOrBlue === "pvp" || modeOrBlue === "hvh") {
      applyPoliciesAndStart("human", "human", "human", "human");
      return;
    }

    // Alias: all AI (defaults main)
    if (modeOrBlue === "ava" || modeOrBlue === "watch") {
      const b = parts[2] ? parts[2].toLowerCase() : "main";
      const r = parts[3] ? parts[3].toLowerCase() : "main";
      const y = parts[4] ? parts[4].toLowerCase() : "main";
      const g = parts[5] ? parts[5].toLowerCase() : "main";
      if (![b, r, y, g].every(p => knownPolicies.includes(p))) {
        console.log(`Invalid policy. Options: ${knownPolicies.join(", ")}`);
        return;
      }
      applyPoliciesAndStart(b, r, y, g);
      return;
    }

    // Legacy shortcut: start <ai_policy> <team>
    if (
      knownPolicies.includes(modeOrBlue) &&
      parts.length <= 3 &&
      ["blue", "red", "yellow", "green"].includes((parts[2] || "").toLowerCase())
    ) {
      const aiPolicy = modeOrBlue;
      const aiSide = parts[2].toLowerCase();
      const policies = { blue: "human", red: "human", yellow: "human", green: "human" };
      policies[aiSide] = aiPolicy;
      applyPoliciesAndStart(policies.blue, policies.red, policies.yellow, policies.green);
      return;
    }

    // Unified policy command
    const b = modeOrBlue;
    const r = parts[2] ? parts[2].toLowerCase() : "human";
    const y = parts[3] ? parts[3].toLowerCase() : "human";
    const g = parts[4] ? parts[4].toLowerCase() : "human";
    if (![b, r, y, g].every(p => knownPolicies.includes(p))) {
      console.log(
        `Usage: start <blue_policy> <red_policy> <yellow_policy> <green_policy>\n` +
        `Policies: ${knownPolicies.join(", ")}`
      );
      return;
    }
    applyPoliciesAndStart(b, r, y, g);
    return;
  }

  if (noMoveSkipPending) {
    const allowedDuringSkip = ["show", "exit", "reset", "start"];
    if (!allowedDuringSkip.includes(command)) {
      console.log("Turn will skip in a moment...");
      return;
    }
  }
  if (
    resurrectionPending &&
    parts[0] !== "resurrect" &&
    parts[0] !== "show" &&
    parts[0] !== "exit") 
    {
      console.log("You must resurrect a soldier first (resurrect <id> <lane>)");
      return;
  }
  if (
    pendingPostMovePower &&
    cmd !== "yes" &&
    cmd !== "no" &&
    cmd !== "show" &&
    cmd !== "exit"
  ) {
      console.log("Confirm freeze usage? (yes / no)");
      return;
  }


if (parts[0] === "batch") {
  // Usage: batch <count> [seed] [blueAI] [redAI]
  
  const count = parts.length >= 2 ? Number(parts[1]) : 100;
  
  let seed = null;
  let blueAI = "main";
  let redAI = "main";
  let nextArgIndex = 2;

  // 1. Check for Seed (Optional)
  if (parts.length > nextArgIndex) {
      const potentialSeed = Number(parts[nextArgIndex]);
      
      // If it is a valid number, use it as seed
      if (!Number.isNaN(potentialSeed)) {
          seed = potentialSeed;
          nextArgIndex++; // Consume this argument
      } 
      // If user typed "null", explicit skip
      else if (parts[nextArgIndex] === "null") {
          seed = null;
          nextArgIndex++;
      }
      // Otherwise (e.g., "main"), it's not a seed, it's the Blue AI name.
  }

  // 2. Check for Blue AI (Optional)
  if (parts.length > nextArgIndex) {
      blueAI = parts[nextArgIndex];
      nextArgIndex++;
  }

  // 3. Check for Red AI (Optional)
  if (parts.length > nextArgIndex) {
      redAI = parts[nextArgIndex];
  }

  if (Number.isNaN(count)) {
    console.log("Usage: batch <count> [seed] [blueAI] [redAI]");
    return;
  }

  runBatchSimulation(count, seed, blueAI, redAI);
  return;
}

if (parts[0] === "batch4") {
  // Usage: batch4 <count> [seed] [blueAI] [redAI] [yellowAI] [greenAI]
  const count = parts.length >= 2 ? Number(parts[1]) : 100;

  let seed = null;
  let blueAI = "main";
  let redAI = "main";
  let yellowAI = "main";
  let greenAI = "main";
  let nextArgIndex = 2;

  if (parts.length > nextArgIndex) {
    const potentialSeed = Number(parts[nextArgIndex]);
    if (!Number.isNaN(potentialSeed)) {
      seed = potentialSeed;
      nextArgIndex++;
    } else if (parts[nextArgIndex] === "null") {
      seed = null;
      nextArgIndex++;
    }
  }

  if (parts.length > nextArgIndex) {
    blueAI = parts[nextArgIndex];
    nextArgIndex++;
  }
  if (parts.length > nextArgIndex) {
    redAI = parts[nextArgIndex];
    nextArgIndex++;
  }
  if (parts.length > nextArgIndex) {
    yellowAI = parts[nextArgIndex];
    nextArgIndex++;
  }
  if (parts.length > nextArgIndex) {
    greenAI = parts[nextArgIndex];
  }

  if (Number.isNaN(count) || count <= 0) {
    console.log("Usage: batch4 <count> [seed] [blueAI] [redAI] [yellowAI] [greenAI]");
    return;
  }

  const configuredTypes = [blueAI, redAI, yellowAI, greenAI];
  const noneCount = configuredTypes.filter(t => t === "none").length;
  const activeCount = 4 - noneCount;
  if (activeCount === 0) {
    console.log("No games to run");
    return;
  }
  if (activeCount === 1) {
    console.log("Single player games not possible");
    return;
  }

  runBatchSimulation4(
    count,
    seed,
    blueAI,
    redAI,
    yellowAI,
    greenAI
  );
  return;
}

  if (parts[0] === "autoplay") {
  const games = parts.length === 2 ? Number(parts[1]) : 10;

  if (Number.isNaN(games) || games <= 0) {
    console.log("Usage: autoplay <number_of_games>");
    return;
  }

  autoplay(games);
  return;
}

  if (parts[0] === "random") {
  if (parts.length !== 2) {
    console.log(
      "Usage: random <team>"
    );
  }
    const team = parts[1];
    debugRandomPlace(team);//randomly place soldiers of a team on boards
    return;
  }

if (parts[0] === "force") {
  // Usage:
  // force phase main
  // force turn red
  // force phase main turn red

  let newPhase;
  let newTurn;

  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] === "phase") {
      newPhase = parts[i + 1];
    }
    if (parts[i] === "turn") {
      newTurn = parts[i + 1];
    }
  }

  forceGameState({ phase: newPhase, turn: newTurn });
  return;
}

if (parts[0] === "rl") {
  if (parts.length !== 2) {
    console.log("Usage: rl <number>");
    return;
  }
  if (phase !== "main") {
    console.log("Cannot roll outside main phase");
    return;
  }

  const dice = Number(parts[1]);

  const legalMoves = getLegalMoves(currentPlayer,dice);

  if (legalMoves.length === 0) {
    console.log("No legal moves. Turn skipped.");
    scheduleNoMoveSkip();
    return;
  }

  pendingRoll = dice;
  console.log("Select a soldier to move using: move <id>");
  return;
}

  if (parts[0] === "roll") {
  if (phase !== "main") {
    console.log("Cannot roll outside main phase");
    return;
  }
  if (pendingRoll !== null) {
  console.log("You already rolled this turn");
  return;
}

  const dice = rollDice();

  const legalMoves = getLegalMoves(currentPlayer,dice);

  if (legalMoves.length === 0) {
    console.log("No legal moves. Turn skipped.");
    scheduleNoMoveSkip();
    return;
  }

  pendingRoll = dice;
  console.log("Select a soldier to move using: move <id>");
  return;
}

if (parts[0] === "placep") {
  if (parts.length !== 4) {
    console.log("Usage: placep <team> <id> <lane>");
    return;
  }

  const team = parts[1];
  const id = Number(parts[2]);
  const lane = Number(parts[3]);
  placeDuringPlacement(team, id,lane);
  return;
}

if (parts[0] === "placeall") {
  placeAllRandomTurnByTurn();
  return;
}

if (parts[0] === "tick") {
  tickCurrentPlayer();
  return;
}

if (parts[0] === "simmove") {
  const games = parts[1] ? Number(parts[1]) : 10;
  const maxTicks = parts[2] ? Number(parts[2]) : 20000;
  const baseSeed = parts[3] ? Number(parts[3]) : null;
  if (!Number.isFinite(games) || games <= 0) {
    console.log("Usage: simmove <games> [maxTicksPerGame] [baseSeed]");
    return;
  }
  if (!Number.isFinite(maxTicks) || maxTicks <= 0) {
    console.log("Usage: simmove <games> [maxTicksPerGame] [baseSeed]");
    return;
  }
  if (parts[3] && (!Number.isFinite(baseSeed) || baseSeed < 0)) {
    console.log("Usage: simmove <games> [maxTicksPerGame] [baseSeed]");
    return;
  }
  runMovementOnlySim(
    Math.floor(games),
    Math.floor(maxTicks),
    baseSeed === null ? null : Math.floor(baseSeed)
  );
  return;
}

if (parts[0] === "replaymove") {
  const seed = parts[1] ? Number(parts[1]) : NaN;
  const maxTicks = parts[2] ? Number(parts[2]) : 20000;
  if (!Number.isFinite(seed) || seed < 0) {
    console.log("Usage: replaymove <seed> [maxTicksPerGame]");
    return;
  }
  if (!Number.isFinite(maxTicks) || maxTicks <= 0) {
    console.log("Usage: replaymove <seed> [maxTicksPerGame]");
    return;
  }
  replayMovementSeed(Math.floor(seed), Math.floor(maxTicks));
  return;
}

if (parts[0] === "resurrect") {
  if (parts.length !== 3) {
    console.log("Usage: resurrect <id> <lane>");
    return;
  }
  const id = Number(parts[1]);
  const lane = Number(parts[2]);
  resurrectSoldierChoice(id, lane);
  return;
}

  if (parts[0] === "reset") {
  debugReset();
  return;
}

if (parts[0] === "kill") {
  if (parts.length !== 3) {
    console.log("Usage: kill <team> <id>");
    return;
  }

  const team = parts[1];
  const id = Number(parts[2]);

  debugKillSoldier(team, id);
  return;
}
if (parts[0] === "power") {
  const id = Number(parts[1]);
  const powerType = parts[2];
  const param1 = parts[3];
  const param2 = parts[4];

  takeTurnPower(currentPlayer, id, powerType, param1, param2);
  return;
}
if (cmd === "yes") {
  if (!pendingPostMovePower) {
    console.log("Nothing to confirm");
    return;
  }

  const s = pendingPostMovePower.soldier;
  applyFreeze(s);
  s.powerUsed = true;
  s.revealed = true;

  pendingPostMovePower = null;
  endTurn();
  return;
}

if (cmd === "no") {
  if (!pendingPostMovePower) {
    console.log("Nothing to confirm");
    return;
  }

  pendingPostMovePower = null;
  endTurn();
  return;
}

if (parts[0] === "move") {
  if (parts.length !== 2) {
    console.log("Usage: move <id>");
    return;
  }

  const id = Number(parts[1]);
  takeTurnMovement(currentPlayer, id, pendingRoll);
  return;
}

if (parts[0] === "show") {
  printBoard();
  return;
}

if (parts[0] === "place") {
    if (parts.length !== 5) {
      console.log("Usage: place <team> <id> <x> <y>");
      return;
    }

    const team = parts[1];
    const id = Number(parts[2]);
    const x = Number(parts[3]);
    const y = Number(parts[4]);

    debugplaceSoldier(team, id, x, y);
    return;
  }

if (cmd === "exit") {
    console.log("Exiting game");
    process.exit(0);
  }

  console.log("Unknown command:", cmd);
}

// Node-only CLI harness for local engine testing.
// Keeps browser/Electron usage untouched.
if (
  typeof process !== "undefined" &&
  process.versions &&
  process.versions.node &&
  typeof require !== "undefined" &&
  require.main === module
) {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  console.log("CLI ready. Type commands (example: start pvp, placep blue 1 0, show, exit)");
  rl.setPrompt("> ");
  rl.prompt();

  rl.on("line", line => {
    const cmd = line.trim();
    if (cmd.length > 0) {
      handleCommand(cmd);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}


