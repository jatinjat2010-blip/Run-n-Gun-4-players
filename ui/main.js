console.log("System: Initializing Tactical Dashboard...");

if (typeof debugReset !== 'function') {
    console.error("CRITICAL: Engine not found. Check game.js path.");
} else {
    console.log("System: Engine Connected. Waiting for mode selection.");
}

const uiState = {
    selectedId: null,
    validTargets: [],
    powerMode: false,
    powerCandidates: [],
    selectedPowerId: null,
    powerHoverEdge: null,
    powerAim: null,
    
    selectedInventoryId: null,
    hoverLane: null,

    selectedResurrectionId: null,
    resurrectionHoverLane: null
};

const inputCanvas = document.getElementById('grid-canvas');
const viewportEl = document.getElementById('viewport');
const boardControlsEl = document.getElementById('board-controls');

const UI_CELL_SIZE = 50;
const UI_LEFT_PANEL_COLS = 4;
const UI_RIGHT_PANEL_COLS = 4;
const UI_TOP_PANEL_ROWS = 4;
const UI_VISUAL_GRID_SIZE = 14;
const MAIN_PANEL_BOX_WIDTH = (UI_LEFT_PANEL_COLS - 0.5) * UI_CELL_SIZE;
const MAIN_PANEL_BOX_HEIGHT = 3 * UI_CELL_SIZE;
const MAIN_PANEL_GAP = 10;
const MAIN_SIDE_PANEL_Y_SHIFT = UI_TOP_PANEL_ROWS * UI_CELL_SIZE;
const MAIN_BLUE_PANEL_X = 10;
const MAIN_BLUE_PANEL_Y = 80 + MAIN_SIDE_PANEL_Y_SHIFT;
const MAIN_BOARD_X = UI_LEFT_PANEL_COLS * UI_CELL_SIZE;
const MAIN_BOARD_Y = UI_TOP_PANEL_ROWS * UI_CELL_SIZE;
const MAIN_YELLOW_PANEL_X = MAIN_BOARD_X + (UI_VISUAL_GRID_SIZE * UI_CELL_SIZE) + 10;
const MAIN_YELLOW_PANEL_Y = MAIN_BLUE_PANEL_Y;
const MAIN_RED_PANEL_X = MAIN_BOARD_X + 100;
const MAIN_RED_PANEL_Y = MAIN_BOARD_Y + (UI_VISUAL_GRID_SIZE * UI_CELL_SIZE) + 10;
const MAIN_GREEN_PANEL_X = MAIN_RED_PANEL_X;
const MAIN_GREEN_PANEL_Y = 35;
const MAIN_TOKEN_PAD_X = 30;
const MAIN_TOKEN_PAD_Y = 40;
const MAIN_TOKEN_SPACING = 45;
const mainMenuOverlay = document.getElementById('main-menu-overlay');
const modeOverlay = document.getElementById('mode-overlay');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const rulesOverlay = document.getElementById('rules-overlay');
const menuPlayBtn = document.getElementById('menu-play');
const menuTutorialBtn = document.getElementById('menu-tutorial');
const menuRulesBtn = document.getElementById('menu-rules');
const menuAudioToggleBtn = document.getElementById('menu-audio-toggle');
const audioSettingsPanel = document.getElementById('audio-settings-panel');
const modeStartBtn = document.getElementById('mode-start');
const modeBackBtn = document.getElementById('mode-back');
const modeBluePolicy = document.getElementById('mode-blue-policy');
const modeRedPolicy = document.getElementById('mode-red-policy');
const modeYellowPolicy = document.getElementById('mode-yellow-policy');
const modeGreenPolicy = document.getElementById('mode-green-policy');
const modeValidationEl = document.getElementById('mode-validation');
const tutorialBackBtn = document.getElementById('tutorial-back');
const tutorialStartBtn = document.getElementById('tutorial-start');
const rulesBackBtn = document.getElementById('rules-back');
const bgmVolumeSlider = document.getElementById('bgm-volume');
const bgmVolumeValue = document.getElementById('bgm-volume-value');
const sfxVolumeSlider = document.getElementById('sfx-volume');
const sfxVolumeValue = document.getElementById('sfx-volume-value');
const gameOverOverlay = document.getElementById('gameover-overlay');
const gameOverWinner = document.getElementById('gameover-winner');
const gameOverScore = document.getElementById('gameover-score');
const playAgainBtn = document.getElementById('btn-play-again');
const infoPanelEl = document.getElementById('info-panel');
const infoTextEl = document.getElementById('info-text');
const quitToMenuBtn = document.getElementById('btn-quit-to-menu');
const rollDieBtn = document.getElementById('btn-roll-die');
const usePowerBtn = document.getElementById('btn-use-power');
const tutorialSceneEl = document.getElementById('tutorial-scene');
const tutorialDialogTextEl = document.getElementById('tutorial-dialog-text');
const tutorialArrowEl = document.getElementById('tutorial-arrow');
const tutorialNextBtn = document.getElementById('tutorial-next');
const tutorialEndBtn = document.getElementById('tutorial-end');
let lastStateSignature = null;
let lastEngineSignature = null;
let selectedHumanColor = "blue";
let gameOverShown = false;
const powerFlashEvents = [];
let powerFlashSeq = 0;
let lastEnginePowerFlashSeq = 0;
let infoHideTimer = null;
let infoSticky = false;
let wasResurrectionPromptActive = false;
let freezeDecisionTimer = null;
const BGM_VOLUME_KEY = "rng_bgm_volume";
const SFX_VOLUME_KEY = "rng_sfx_volume";
let bgmVolume = 0.7;
let sfxVolume = 0.7;
let bgmStarted = false;
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let bgmGainNode = null;
let bgmBuffer = null;
let bgmSource = null;
let bgmLoading = false;
let webAudioBgmDisabled = false;
const bgMusicFallback = new Audio("../music/background music.mp3");
bgMusicFallback.loop = true;
bgMusicFallback.preload = "auto";
bgMusicFallback.volume = bgmVolume;
const DICE_ROLL_SFX_PATHS = [
    "../music/dice roll1.wav",
    "../music/dice roll 2.wav",
    "../music/dice roll 3.wav",
    "../music/dice roll 4.wav"
];
const diceRollSfxPool = DICE_ROLL_SFX_PATHS.map((src) => {
    const a = new Audio(src);
    a.preload = "auto";
    a.volume = sfxVolume;
    return a;
});
const sfxTemplates = {
    uiClick: new Audio("../music/selct and click.wav"),
    finished: new Audio("../music/finished.wav"),
    gameOver: new Audio("../music/game over.wav"),
    power2: new Audio("../music/id2 barricade.wav"),
    power3: new Audio("../music/id 3 laser.wav"),
    power4: new Audio("../music/id 4 freeze.wav"),
    power5: new Audio("../music/id 5 nuke.wav"),
    meleeKill: new Audio("../music/melee kill.wav")
};
Object.values(sfxTemplates).forEach((a) => {
    a.preload = "auto";
    a.volume = sfxVolume;
});
let prevSoldierStateMap = new Map();
let engineSfxPrimed = false;
const TUTORIAL_RED_PLAN = [
    { id: 1, lane: 11 },
    { id: 2, lane: 2 },
    { id: 3, lane: 4 },
    { id: 4, lane: 1 },
    { id: 5, lane: 7 }
];
const tutorialState = {
    active: false,
    stepIndex: -1,
    completed: false,
    id4Used: false
};

function isHumanTeam(team) {
    if (!team || !playerAI) return true;
    return playerAI[team] === "human";
}

function getViewerTeamForVisibility() {
    if (tutorialState.active) return "blue";

    const configured = ["blue", "red", "yellow", "green"]
        .filter(t => playerAI && playerAI[t] !== "none");
    const hasHuman = configured.some(t => playerAI[t] === "human");
    const hasAI = configured.some(t => playerAI[t] !== "human");

    // Pure all-human or all-AI games: active turn team is visible.
    if (!hasHuman || !hasAI) return currentPlayer;

    // Mixed games: only human turns are visible.
    return isHumanTeam(currentPlayer) ? currentPlayer : null;
}

function applyBgmVolume(volume) {
    const v = Math.max(0, Math.min(1, Number(volume) || 0));
    bgmVolume = v;
    if (bgmGainNode) bgmGainNode.gain.value = v;
    bgMusicFallback.volume = v;
    if (bgmVolumeSlider) bgmVolumeSlider.value = String(Math.round(v * 100));
    if (bgmVolumeValue) bgmVolumeValue.textContent = `${Math.round(v * 100)}%`;
}

function applySfxVolume(volume) {
    const v = Math.max(0, Math.min(1, Number(volume) || 0));
    sfxVolume = v;
    diceRollSfxPool.forEach((a) => { a.volume = v; });
    Object.values(sfxTemplates).forEach((a) => { a.volume = v; });
    if (sfxVolumeSlider) sfxVolumeSlider.value = String(Math.round(v * 100));
    if (sfxVolumeValue) sfxVolumeValue.textContent = `${Math.round(v * 100)}%`;
}

function loadAudioVolumes() {
    try {
        const bgmRaw = localStorage.getItem(BGM_VOLUME_KEY);
        if (bgmRaw !== null) {
            const parsed = Number(bgmRaw);
            if (Number.isFinite(parsed)) applyBgmVolume(parsed);
        }
        const sfxRaw = localStorage.getItem(SFX_VOLUME_KEY);
        if (sfxRaw !== null) {
            const parsed = Number(sfxRaw);
            if (Number.isFinite(parsed)) applySfxVolume(parsed);
        }
    } catch (_) {
        // ignore storage errors
    }
}

function saveAudioVolumes() {
    try {
        localStorage.setItem(BGM_VOLUME_KEY, String(bgmVolume));
        localStorage.setItem(SFX_VOLUME_KEY, String(sfxVolume));
    } catch (_) {
        // ignore storage errors
    }
}

function ensureAudioGraph() {
    if (!AudioCtx) return false;
    if (audioCtx && bgmGainNode) return true;

    audioCtx = new AudioCtx();
    bgmGainNode = audioCtx.createGain();
    bgmGainNode.gain.value = bgmVolume;
    bgmGainNode.connect(audioCtx.destination);
    return true;
}

function isElectronRuntime() {
    if (typeof navigator === "undefined" || !navigator.userAgent) return false;
    return navigator.userAgent.includes("Electron");
}

async function loadBackgroundMusicBuffer() {
    if (webAudioBgmDisabled) return null;
    if (bgmBuffer) return bgmBuffer;
    if (bgmLoading) return null;
    if (!ensureAudioGraph()) return null;
    // Browser file:// cannot fetch audio reliably, but Electron file:// can.
    if (window.location && window.location.protocol === "file:" && !isElectronRuntime()) {
        webAudioBgmDisabled = true;
        return null;
    }

    bgmLoading = true;
    try {
        const res = await fetch("../music/background music.mp3");
        if (!res.ok) throw new Error(`Failed to load BGM: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        return bgmBuffer;
    } catch (err) {
        webAudioBgmDisabled = true;
        console.warn("BGM WebAudio disabled, using fallback loop:", err);
        return null;
    } finally {
        bgmLoading = false;
    }
}

function startBufferLoop() {
    if (!bgmBuffer || !audioCtx || !bgmGainNode) return false;

    if (bgmSource) {
        try { bgmSource.stop(); } catch (_) {}
        bgmSource.disconnect();
        bgmSource = null;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = bgmBuffer;
    source.loop = true;
    source.connect(bgmGainNode);
    source.start(0);
    bgmSource = source;
    return true;
}

async function startBackgroundMusic() {
    if (bgmStarted) return;
    if (webAudioBgmDisabled || !ensureAudioGraph()) {
        bgMusicFallback.play().then(() => {
            bgmStarted = true;
        }).catch(() => {
            bgmStarted = false;
        });
        return;
    }

    if (audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch (_) {}
    }

    if (!bgmBuffer) {
        await loadBackgroundMusicBuffer();
    }
    if (!bgmBuffer) {
        bgMusicFallback.play().then(() => {
            bgmStarted = true;
        }).catch(() => {
            bgmStarted = false;
        });
        return;
    }

    const started = startBufferLoop();
    if (started) {
        bgmStarted = true;
        try { bgMusicFallback.pause(); } catch (_) {}
    } else {
        bgMusicFallback.play().then(() => {
            bgmStarted = true;
        }).catch(() => {
            bgmStarted = false;
        });
    }
}

function playRandomDiceRollSfx() {
    if (diceRollSfxPool.length === 0) return;
    const template = diceRollSfxPool[Math.floor(Math.random() * diceRollSfxPool.length)];
    const shot = template.cloneNode(true);
    shot.volume = sfxVolume;
    shot.play().catch(() => {});
}

function playSfx(name) {
    const template = sfxTemplates[name];
    if (!template) return;
    const shot = template.cloneNode(true);
    shot.volume = sfxVolume;
    shot.play().catch(() => {});
}

function soldierStateKey(s) {
    return `${s.team}:${s.id}`;
}

function buildSoldierStateMap() {
    const map = new Map();
    if (!Array.isArray(soldiers)) return map;
    soldiers.forEach((s) => {
        map.set(soldierStateKey(s), {
            team: s.team,
            id: s.id,
            state: s.state,
            x: s.x,
            y: s.y,
            powerUsed: !!s.powerUsed
        });
    });
    return map;
}

function playEngineStateSfx() {
    const currentMap = buildSoldierStateMap();
    if (!engineSfxPrimed) {
        prevSoldierStateMap = currentMap;
        engineSfxPrimed = true;
        return;
    }

    let finishedTriggered = false;
    const deathsFromBoard = [];
    const movedSoldiers = [];

    currentMap.forEach((cur, key) => {
        const prev = prevSoldierStateMap.get(key);
        if (!prev) return;

        if (!finishedTriggered && prev.state !== "finished" && cur.state === "finished") {
            finishedTriggered = true;
            playSfx("finished");
        }

        if (prev.state === "board" && cur.state === "board" && (prev.x !== cur.x || prev.y !== cur.y)) {
            movedSoldiers.push({
                team: cur.team,
                fromX: prev.x, fromY: prev.y,
                toX: cur.x, toY: cur.y
            });
        } else if (prev.state === "start" && cur.state === "board") {
            const fromX = prev.team === "blue" ? -1 : (prev.team === "yellow" ? 12 : prev.x);
            const fromY = prev.team === "red" ? -1 : (prev.team === "green" ? 12 : prev.y);
            movedSoldiers.push({
                team: cur.team,
                fromX, fromY,
                toX: cur.x, toY: cur.y
            });
        }

        if (prev.state === "board" && cur.state === "dead") {
            deathsFromBoard.push({
                team: cur.team,
                x: prev.x,
                y: prev.y
            });
        }

        if (!prev.powerUsed && cur.powerUsed) {
            if (cur.id === 2) playSfx("power2");
            else if (cur.id === 3) playSfx("power3");
            else if (cur.id === 4) playSfx("power4");
            else if (cur.id === 5) playSfx("power5");
        }
    });

    const meleeDetected = deathsFromBoard.some((dead) =>
        movedSoldiers.some((mv) => mv.team !== dead.team && mv.toX === dead.x && mv.toY === dead.y)
    );
    if (meleeDetected) {
        playSfx("meleeKill");
    }

    prevSoldierStateMap = currentMap;
}

function enqueuePowerFlashEvent(event) {
    powerFlashSeq += 1;
    powerFlashEvents.push({
        ...event,
        seq: powerFlashSeq,
        createdAt: Date.now()
    });
    if (powerFlashEvents.length > 80) {
        powerFlashEvents.splice(0, powerFlashEvents.length - 80);
    }
}

function syncPowerFlashEventsFromEngine() {
    if (typeof powerVisualEvents === "undefined" || !Array.isArray(powerVisualEvents)) return;

    for (const ev of powerVisualEvents) {
        if (!ev || typeof ev.seq !== "number") continue;
        if (ev.seq <= lastEnginePowerFlashSeq) continue;
        lastEnginePowerFlashSeq = ev.seq;

        if (ev.kind !== "gun" && ev.kind !== "nuke") continue;

        enqueuePowerFlashEvent({
            kind: ev.kind,
            team: ev.team,
            x: ev.x,
            y: ev.y,
            direction: ev.direction,
            orientation: ev.orientation
        });
    }
}

function buildEngineSignature() {
    const soldiersSig = Array.isArray(soldiers)
        ? soldiers.map((s) => {
            const frozenBy = s.frozenBy && s.frozenBy.team ? `${s.frozenBy.team}${s.frozenBy.id}` : "-";
            return `${s.team}${s.id}:${s.state}:${s.x}:${s.y}:${s.revealed ? 1 : 0}:${s.powerUsed ? 1 : 0}:${frozenBy}`;
        }).join("|")
        : "";

    const barricadesSig = (typeof barricades !== "undefined" && Array.isArray(barricades))
        ? barricades.map((b) => {
            const owner = b.owner && b.owner.team ? `${b.owner.team}${b.owner.id}` : "-";
            return `${b.x},${b.y},${b.orientation},${b.direction},${owner}`;
        }).join("|")
        : "";

    const resurrectionSig = resurrectionPending
        ? `${resurrectionPending.team}:${(resurrectionPending.ids || []).join(",")}`
        : "-";

    const pendingPowerSig = pendingPostMovePower && pendingPostMovePower.soldier
        ? `${pendingPostMovePower.soldier.team}${pendingPostMovePower.soldier.id}`
        : "-";
    const powerFlashSig = (typeof powerVisualEvents !== "undefined") && Array.isArray(powerVisualEvents) && powerVisualEvents.length > 0
        ? powerVisualEvents[powerVisualEvents.length - 1].seq
        : "-";

    return [
        phase,
        currentPlayer,
        pendingRoll,
        gameMode,
        aiTeam || "-",
        score && typeof score.blue !== "undefined" ? score.blue : "-",
        score && typeof score.red !== "undefined" ? score.red : "-",
        resurrectionSig,
        pendingPowerSig,
        powerFlashSig,
        soldiersSig,
        barricadesSig
    ].join("~");
}

function startEngineUiSyncLoop() {
    setInterval(() => {
        const signature = buildEngineSignature();
        const freezeTickActive = !!(
            freezeDecisionTimer &&
            pendingPostMovePower &&
            pendingPostMovePower.soldier &&
            pendingPostMovePower.soldier.team === currentPlayer &&
            isHumanTeam(currentPlayer)
        );
        if (signature !== lastEngineSignature || freezeTickActive) {
            lastEngineSignature = signature;
            updateUI();
        }
    }, 120);
}


function getGridFromClick(pixelX, pixelY) {
    const rect = inputCanvas.getBoundingClientRect();
    
    // NEW CONSTANTS MATCHING RENDERER
    const CELL_SIZE = UI_CELL_SIZE;
    const VISUAL_GRID_SIZE = UI_VISUAL_GRID_SIZE;
    const BOARD_OFFSET = 1; 
    const LEFT_PANEL_COLS = UI_LEFT_PANEL_COLS;
    const TOP_PANEL_ROWS = UI_TOP_PANEL_ROWS;

    const scaleX = inputCanvas.width / rect.width;
    const scaleY = inputCanvas.height / rect.height;

    const visualX = Math.floor((pixelX - rect.left) * scaleX / CELL_SIZE);
    const visualY = Math.floor((pixelY - rect.top) * scaleY / CELL_SIZE);

    // ADJUST FOR SHIFT: Subtract Left Panel!
    const x = (visualX - LEFT_PANEL_COLS) - BOARD_OFFSET;
    const y = (VISUAL_GRID_SIZE - 1 - (visualY - TOP_PANEL_ROWS)) - BOARD_OFFSET;

    return { x, y, visualX, visualY };
}

// --- TARGET CALCULATOR ---
// Rules: Blue -> Right, Red -> Up, Yellow -> Left, Green -> Down. Distance = pendingRoll.
function calculateTarget(soldier) {
    if (!soldier || pendingRoll === null) return [];

    const targets = [];
    let fromX = soldier.x;
    let fromY = soldier.y;

    if (soldier.state === "start") {
        if (soldier.team === "blue") fromX = -1;
        if (soldier.team === "yellow") fromX = 12;
        if (soldier.team === "red") fromY = -1;
        if (soldier.team === "green") fromY = 12;
    }
    
    if (soldier.team === "blue") {
        // Hard Fact: Blue moves Right (+X)
        targets.push({
            x: fromX + pendingRoll,
            y: fromY,
            direction: "right"
        });
    } else if (soldier.team === "red") {
        // Hard Fact: Red moves Up (+Y)
        targets.push({
            x: fromX,
            y: fromY + pendingRoll,
            direction: "up"
        });
    } else if (soldier.team === "yellow") {
        targets.push({
            x: fromX - pendingRoll,
            y: fromY,
            direction: "left"
        });
    } else if (soldier.team === "green") {
        targets.push({
            x: fromX,
            y: fromY - pendingRoll,
            direction: "down"
        });
    }
    
    return targets;
}

function getSoldierAtPosition(pos, team) {
    return soldiers.find(s => {
        if (s.team !== team) return false;

        if (s.state === "board") {
            return s.x === pos.x && s.y === pos.y;
        }

        if (s.state === "start") {
            if (s.team === "blue") {
                return pos.x === -1 && s.y === pos.y;
            }
            if (s.team === "yellow") {
                return pos.x === 12 && s.y === pos.y;
            }
            if (s.team === "red") {
                return pos.y === -1 && s.x === pos.x;
            }
            if (s.team === "green") {
                return pos.y === 12 && s.x === pos.x;
            }
        }

        return false;
    });
}

function clearPowerMode() {
    uiState.powerMode = false;
    uiState.powerCandidates = [];
    uiState.selectedPowerId = null;
    uiState.powerHoverEdge = null;
    uiState.powerAim = null;
}

function getCanvasMousePos(clientX, clientY) {
    const rect = inputCanvas.getBoundingClientRect();
    const scaleX = inputCanvas.width / rect.width;
    const scaleY = inputCanvas.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function positionBoardControls() {
    if (!inputCanvas || !viewportEl || !boardControlsEl) return;

    const canvasRect = inputCanvas.getBoundingClientRect();
    const viewportRect = viewportEl.getBoundingClientRect();

    const left = (canvasRect.left - viewportRect.left) + MAIN_BLUE_PANEL_X;
    const top = (canvasRect.top - viewportRect.top) + MAIN_BLUE_PANEL_Y + (3 * (MAIN_PANEL_BOX_HEIGHT + MAIN_PANEL_GAP))+20;

    boardControlsEl.style.left = `${Math.round(left)}px`;
    boardControlsEl.style.top = `${Math.round(top)}px`;
}

function clearFreezeDecisionTimer() {
    if (freezeDecisionTimer && freezeDecisionTimer.timeoutId) {
        clearTimeout(freezeDecisionTimer.timeoutId);
    }
    freezeDecisionTimer = null;
}

function ensureFreezeDecisionTimer() {
    if (
        !pendingPostMovePower ||
        !pendingPostMovePower.soldier ||
        pendingPostMovePower.soldier.team !== currentPlayer ||
        !isHumanTeam(currentPlayer)
    ) {
        clearFreezeDecisionTimer();
        return;
    }

    const s = pendingPostMovePower.soldier;
    const key = `${s.team}:${s.id}:${s.x}:${s.y}`;
    if (freezeDecisionTimer && freezeDecisionTimer.key === key) return;

    clearFreezeDecisionTimer();
    const deadline = Date.now() + 4000;
    const timeoutId = setTimeout(() => {
        if (
            pendingPostMovePower &&
            pendingPostMovePower.soldier &&
            pendingPostMovePower.soldier.team === currentPlayer &&
            isHumanTeam(currentPlayer)
        ) {
            handleCommand("no");
            setInfoMessage("Freeze skipped");
            updateUI();
        }
        clearFreezeDecisionTimer();
    }, 4000);

    freezeDecisionTimer = { key, deadline, timeoutId };
}

function clearInfoMessage() {
    if (infoHideTimer) {
        clearTimeout(infoHideTimer);
        infoHideTimer = null;
    }
    infoSticky = false;
    if (infoTextEl) infoTextEl.textContent = "";
}

function setInfoMessage(message, options = {}) {
    if (!infoPanelEl || !infoTextEl) return;
    const sticky = !!options.sticky;

    if (infoHideTimer) {
        clearTimeout(infoHideTimer);
        infoHideTimer = null;
    }

    infoSticky = sticky;
    infoTextEl.textContent = message;

    if (!sticky) {
        infoHideTimer = setTimeout(() => {
            if (infoSticky) return;
            if (infoTextEl) infoTextEl.textContent = "";
            infoHideTimer = null;
        }, 5000);
    }
}

function isAiThinkingTurn(state) {
    if (tutorialState.active) return false;
    if (!state || state.phase !== "main") return false;
    const team = state.currentPlayer || currentPlayer;
    if (!team || typeof playerAI !== "object" || !playerAI) return false;
    const policy = playerAI[team];
    return policy !== "human" && policy !== "none";
}

function syncActionButtons(state) {
    const disable = isAiThinkingTurn(state);
    if (rollDieBtn) rollDieBtn.disabled = disable;
    if (usePowerBtn) usePowerBtn.disabled = disable;
}

const tutorialSteps = [
    {
        kind: "hero",
        text: "Welcome commander!!! we need to move our units to eastern fronts but enemy is at crossroad and looking to get his units across too.Our mission is simple get our units across finish line and stop enemy units. For this tutorial we play as blue...",
        nextOnly: true
    },
    {
        kind: "action",
        text: "Battlefield is 12x12. Right now all units are in inventory. Go ahead and place our units at start line.",
        expect: "placement_complete",
        arrow: "inventory",
        effect() {
            resetUiSelections();
            hideGameOverOverlay();
            handleCommand("start human human none none");
            handleCommand("force turn blue");
            updateUI();
        }
    },
    {
        kind: "hero",
        text: "Placement done. Enemy goes first in this drill. Current Player is indicated by glowing team Sign",
        nextOnly: true,
        effect() {
            handleCommand("force phase main turn red");
            handleCommand("rl 2");
            handleCommand("move 1");
            updateUI();
        }
    },
    {
        kind: "action",
        text: "Your turn. Click ROLL the D3 DICE.",
        expect: "roll_clicked",
        forcedRoll: 3,
        arrow: "roll"
    },
    {
        kind: "action",
        text: "Select BLUE ID 5 to move.",
        expect: "select_soldier_5"
    },
    {
        kind: "action",
        text: "Now click the highlighted destination to move ID 5.",
        expect: "move_soldier_5"
    },
    {
        kind: "hero",
        text: "Power drill mode: we focus on BLUE powers now. Enemy units are ignored in this segment.",
        nextOnly: true
    },
    {
        kind: "action",
        text: "Click USE POWER.",
        expect: "use_power_clicked",
        arrow: "power"
    },
    {
        kind: "action",
        text: "Select BLUE ID 5 as the power soldier.",
        expect: "power_select_5"
    },
    {
        kind: "action",
        text: "Choose orientation and fire ID 5 Nuke.",
        expect: "power_used_5"
    },
    {
        kind: "hero",
        text: "Well done! Next is ID4.",
        nextOnly: true
    },
    {
        kind: "action",
        text: "Since we are in solo tutorial mode, Roll again.",
        expect: "roll_clicked",
        forcedRoll: 2,
        arrow: "roll"
    },
    {
        kind: "action",
        text: "Nice roll. Move BLUE ID 4.",
        expect: "select_soldier_4"
    },
    {
        kind: "action",
        text: "Click the highlighted destination to move ID 4.",
        expect: "move_soldier_4"
    },
    {
        kind: "action",
        text: "ID 4 can use power after movement. Click ID 4 within 4s to freeze now, or wait for timer to expire.",
        expect: "id4_post_move_choice"
    },
    {
        kind: "hero",
        text: "If you did not use post-move freeze, use USE POWER and select ID 4 now.",
        nextOnly: true
    },
    {
        kind: "action",
        text: "Click USE POWER.",
        expect: "use_power_clicked",
        arrow: "power",
        skipIfId4Used: true
    },
    {
        kind: "action",
        text: "Activate ID 4 Freeze.",
        expect: "power_used_4",
        skipIfId4Used: true
    },
    {
        kind: "hero",
        text: "ID 4 freeze affects all 8 adjacent squares. Frozen soldiers cannot move or use powers until freeze is removed.",
        nextOnly: true
    },
    {
        kind: "action",
        text: "Roll again.",
        expect: "roll_clicked",
        forcedRoll: 2,
        arrow: "roll"
    },
    {
        kind: "action",
        text: "Move BLUE ID 3.",
        expect: "select_soldier_3"
    },
    {
        kind: "action",
        text: "Click highlighted destination to move ID 3.",
        expect: "move_soldier_3"
    },
    {
        kind: "action",
        text: "Click USE POWER.",
        expect: "use_power_clicked",
        arrow: "power"
    },
    {
        kind: "action",
        text: "Select ID 3.",
        expect: "power_select_3"
    },
    {
        kind: "action",
        text: "Choose direction and fire ID 3 sniper.",
        expect: "power_used_3"
    },
    {
        kind: "hero",
        text: "Nice shot. ID 3 is a line-of-sight sniper.",
        nextOnly: true
    },
    {
        kind: "action",
        text: "Roll again.",
        expect: "roll_clicked",
        forcedRoll: 3,
        arrow: "roll"
    },
    {
        kind: "action",
        text: "Move BLUE ID 2.",
        expect: "select_soldier_2"
    },
    {
        kind: "action",
        text: "Click highlighted destination to move ID 2.",
        expect: "move_soldier_2"
    },
    {
        kind: "action",
        text: "Click USE POWER.",
        expect: "use_power_clicked",
        arrow: "power"
    },
    {
        kind: "action",
        text: "Select ID 2.",
        expect: "power_select_2"
    },
    {
        kind: "action",
        text: "Choose an edge and deploy ID 2 barricade.",
        expect: "power_used_2"
    },
    {
        kind: "hero",
        text: "Barricades block movement and ranged powers. Not all directions are legal depending on board geometry.",
        nextOnly: true
    },
    {
        kind: "hero",
        text: "ID 1 has no power and is often used for bluff. Melee kills happen by landing on enemies. Jumping over soldiers is not allowed.",
        nextOnly: true
    },
    {
        kind: "hero",
        text: "Now look at DEAD and FINISHED on your side. Dead soldiers can be resurrected.",
        nextOnly: true,
        effect() {
            tutorialSetupPhase3Board();
            updateUI();
        }
    },
    {
        kind: "action",
        text: "Go ahead and roll dice.",
        expect: "roll_clicked",
        forcedRoll: 3,
        arrow: "roll"
    },
    {
        kind: "action",
        text: "Click BLUE ID 3 to finish.",
        expect: "select_soldier_3"
    },
    {
        kind: "action",
        text: "Click highlighted destination to move ID 3 to finish line.",
        expect: "move_soldier_3"
    },
    {
        kind: "hero",
        text: "When a soldier finishes, it moves to FINISHED and resurrection triggers if a dead ally exists.",
        nextOnly: true
    },
    {
        kind: "action",
        text: "Select dead BLUE ID 5 from the DEAD panel.",
        expect: "resurrect_select_5",
        arrow: "dead"
    },
    {
        kind: "action",
        text: "Place resurrected ID 5 on any start-line lane.",
        expect: "resurrect_place_5"
    },
    {
        kind: "hero",
        text: "Great work. Resurrection restores power usage for that soldier.",
        nextOnly: true
    },
    {
        kind: "hero",
        text: "Finishing soldiers gives points equal to their ID.",
        nextOnly: true
    },
    {
        kind: "hero",
        text: "Game over triggers when only a single team left onboard. Higher final score wins.",
        nextOnly: true
    },
        {
        kind: "hero",
        text: "Remember team that finishes first gets +4 points and 2nd place gets +3 and third place gets +2. So keep it moving Commander!!!",
        nextOnly: true
    },
    {
        kind: "hero",
        text: "Special rule: if a team has only one soldier left, it ignores freeze and barricades.",
        nextOnly: true
    },
    {
        kind: "hero",
        text: "Good luck commander. Tutorial complete.",
        nextOnly: true
    }
];

function getCurrentTutorialStep() {
    if (!tutorialState.active) return null;
    if (tutorialState.stepIndex < 0 || tutorialState.stepIndex >= tutorialSteps.length) return null;
    return tutorialSteps[tutorialState.stepIndex];
}

function setTutorialArrow(target) {
    if (!tutorialArrowEl || !tutorialSceneEl) return;
    if (!target) {
        tutorialArrowEl.style.transform = "none";
        tutorialArrowEl.classList.add("hidden");
        return;
    }

    let anchor = null;
    if (target === "roll") anchor = document.getElementById("btn-roll-die");
    if (target === "power") anchor = document.getElementById("btn-use-power");
    if (target === "inventory") {
        if (!inputCanvas) {
            tutorialArrowEl.classList.add("hidden");
            return;
        }
        const sceneRect = tutorialSceneEl.getBoundingClientRect();
        const canvasRect = inputCanvas.getBoundingClientRect();
        const left = (canvasRect.left - sceneRect.left) + MAIN_BLUE_PANEL_X + 198;
        const top = (canvasRect.top - sceneRect.top) + MAIN_BLUE_PANEL_Y + (MAIN_PANEL_BOX_HEIGHT / 2) - 28;
        tutorialArrowEl.style.transform = "rotate(180deg)";
        tutorialArrowEl.style.left = `${Math.round(left)}px`;
        tutorialArrowEl.style.top = `${Math.round(top)}px`;
        tutorialArrowEl.classList.remove("hidden");
        return;
    }
    if (target === "dead") {
        if (!inputCanvas) {
            tutorialArrowEl.classList.add("hidden");
            return;
        }
        const sceneRect = tutorialSceneEl.getBoundingClientRect();
        const canvasRect = inputCanvas.getBoundingClientRect();
        const deadPanelY = MAIN_BLUE_PANEL_Y + (MAIN_PANEL_BOX_HEIGHT + MAIN_PANEL_GAP);
        const left = (canvasRect.left - sceneRect.left) + MAIN_BLUE_PANEL_X + 198;
        const top = (canvasRect.top - sceneRect.top) + deadPanelY + (MAIN_PANEL_BOX_HEIGHT / 2) - 28;
        tutorialArrowEl.style.transform = "rotate(180deg)";
        tutorialArrowEl.style.left = `${Math.round(left)}px`;
        tutorialArrowEl.style.top = `${Math.round(top)}px`;
        tutorialArrowEl.classList.remove("hidden");
        return;
    }
    if (!anchor) {
        tutorialArrowEl.style.transform = "none";
        tutorialArrowEl.classList.add("hidden");
        return;
    }

    const sceneRect = tutorialSceneEl.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const left = (anchorRect.left - sceneRect.left) - 95;
    const top = (anchorRect.top - sceneRect.top) + (anchorRect.height / 2) - 40;
    tutorialArrowEl.style.transform = "none";
    tutorialArrowEl.style.left = `${Math.round(left)}px`;
    tutorialArrowEl.style.top = `${Math.round(top)}px`;
    tutorialArrowEl.classList.remove("hidden");
}

function applyTutorialStep(step) {
    if (!tutorialDialogTextEl || !tutorialNextBtn) return;
    tutorialDialogTextEl.textContent = step && step.text ? step.text : "";
    tutorialNextBtn.classList.toggle("hidden", !(step && step.nextOnly));
    setTutorialArrow(step && step.arrow ? step.arrow : null);
    if (step && typeof step.effect === "function") step.effect();
}

function tutorialAdvanceStep() {
    while (true) {
        tutorialState.stepIndex += 1;
        if (tutorialState.stepIndex >= tutorialSteps.length) {
            tutorialState.completed = true;
            stopTutorial(true);
            return;
        }
        const candidate = tutorialSteps[tutorialState.stepIndex];
        if (candidate && candidate.skipIfId4Used && tutorialState.id4Used) {
            continue;
        }
        break;
    }
    if (tutorialState.stepIndex >= tutorialSteps.length) {
        tutorialState.completed = true;
        stopTutorial(true);
        return;
    }
    const step = tutorialSteps[tutorialState.stepIndex];
    applyTutorialStep(step);
}

function startTutorial() {
    tutorialState.active = true;
    tutorialState.completed = false;
    tutorialState.id4Used = false;
    tutorialState.stepIndex = -1;
    if (tutorialSceneEl) tutorialSceneEl.classList.remove("hidden");
    hideAllMenuOverlays();
    hideGameOverOverlay();
    document.body.classList.remove("mode-lock");
    tutorialAdvanceStep();
    updateUI();
}

function stopTutorial(showMenu) {
    tutorialState.active = false;
    if (tutorialSceneEl) tutorialSceneEl.classList.add("hidden");
    setTutorialArrow(null);
    handleCommand("reset");
    resetUiSelections();
    if (showMenu) showMainMenuOverlay();
    updateUI();
}

function tutorialEmit(action) {
    if (!tutorialState.active) return true;
    const step = getCurrentTutorialStep();
    if (!step || step.nextOnly) return false;
    if (step.expect !== action) {
        setInfoMessage(`Tutorial: ${step.text}`);
        return false;
    }
    tutorialAdvanceStep();
    return true;
}

function tutorialAutoPlaceRed() {
    if (!tutorialState.active) return;
    const step = getCurrentTutorialStep();
    if (!step || step.expect !== "placement_complete") return;
    if (phase !== "placement" || currentPlayer !== "red") return;

    const next = TUTORIAL_RED_PLAN.find((p) => {
        const s = getSoldierByTeamAndId("red", p.id);
        return s && s.state === "inventory";
    });
    if (!next) return;
    handleCommand(`placep red ${next.id} ${next.lane}`);
}

function tutorialCheckProgress() {
    if (!tutorialState.active) return;
    const step = getCurrentTutorialStep();
    if (!step || step.nextOnly) return;
    if (step.expect === "placement_complete" && phase === "main") {
        tutorialAdvanceStep();
        return;
    }
    if (step.expect === "id4_post_move_choice" && !pendingPostMovePower) {
        tutorialAdvanceStep();
    }
}

function tutorialSkipRedTurnIfNeeded() {
    if (!tutorialState.active) return false;
    if (phase !== "main") return false;
    if (currentPlayer !== "red") return false;
    if (resurrectionPending || pendingPostMovePower) return false;
    if (pendingRoll !== null) return false;

    handleCommand("force phase main turn blue");
    return true;
}

function tutorialSetupPhase3Board() {
    if (!Array.isArray(soldiers) || typeof board === "undefined") return;

    const b1 = getSoldierByTeamAndId("blue", 1);
    const b2 = getSoldierByTeamAndId("blue", 2);
    const b3 = getSoldierByTeamAndId("blue", 3);
    const b4 = getSoldierByTeamAndId("blue", 4);
    const b5 = getSoldierByTeamAndId("blue", 5);
    if (!b1 || !b2 || !b3 || !b4 || !b5) return;

    // Requested tutorial setup: B1/B2/B4 finished, B3 onboard near finish, B5 dead.
    b1.state = "finished"; b1.x = null; b1.y = null;
    b2.state = "finished"; b2.x = null; b2.y = null;
    b4.state = "finished"; b4.x = null; b4.y = null;
    b5.state = "dead"; b5.x = null; b5.y = null;
    b3.state = "board"; b3.x = 9; b3.y = 3; // roll 3 -> exact finish for blue

    // Clean temporary effects for tutorial clarity.
    [b1, b2, b3, b4, b5].forEach((s) => {
        s.frozenBy = null;
        s.revealed = false;
    });

    if (Array.isArray(barricades)) barricades.length = 0;
    powerVisualSeq = 0;
    powerVisualEvents = [];
    pendingRoll = null;
    resurrectionPending = null;
    pendingPostMovePower = null;
    phase = "main";
    currentPlayer = "blue";
    score.blue = 7;

    // Rebuild board map from all board soldiers (including existing red placements).
    board = {};
    soldiers.forEach((s) => {
        if (s.state === "board" && s.x !== null && s.y !== null) {
            board[`${s.x},${s.y}`] = s;
        }
    });
}

function getSoldierByTeamAndId(team, id) {
    return soldiers.find(s => s.team === team && s.id === id);
}

function hideModeOverlay() {
    if (modeOverlay) modeOverlay.classList.add('hidden');
    document.body.classList.remove('mode-lock');
}

function hideAllMenuOverlays() {
    if (mainMenuOverlay) mainMenuOverlay.classList.add('hidden');
    if (modeOverlay) modeOverlay.classList.add('hidden');
    if (tutorialOverlay) tutorialOverlay.classList.add('hidden');
    if (rulesOverlay) rulesOverlay.classList.add('hidden');
}

function showMainMenuOverlay() {
    hideAllMenuOverlays();
    if (mainMenuOverlay) mainMenuOverlay.classList.remove('hidden');
    document.body.classList.add('mode-lock');
}

function showModeOverlay() {
    hideAllMenuOverlays();
    if (modeOverlay) modeOverlay.classList.remove('hidden');
    if (modeValidationEl) {
        modeValidationEl.textContent = "";
        modeValidationEl.classList.add('hidden');
    }
    document.body.classList.add('mode-lock');
}

function showTutorialOverlay() {
    hideAllMenuOverlays();
    if (tutorialOverlay) tutorialOverlay.classList.remove('hidden');
    document.body.classList.add('mode-lock');
}

function showRulesOverlay() {
    hideAllMenuOverlays();
    if (rulesOverlay) rulesOverlay.classList.remove('hidden');
    document.body.classList.add('mode-lock');
}

function hideGameOverOverlay() {
    if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
    document.body.classList.remove('gameover-lock');
}

function showGameOverOverlay() {
    const winner = gameWinner === "draw"
        ? "Draw"
        : `Team ${String(gameWinner || "").toUpperCase()} Wins`;

    const hasRanking = Array.isArray(finalRanking) && finalRanking.length > 0;
    const ranking = hasRanking
        ? finalRanking
        : ["blue", "red", "yellow", "green"]
            .map(team => ({ team, score: (score && typeof score[team] === "number") ? score[team] : 0 }))
            .sort((a, b) => b.score - a.score)
            .map((entry, idx) => ({ rank: idx + 1, ...entry }));

    if (gameOverWinner) gameOverWinner.textContent = winner;
    if (gameOverScore) {
        gameOverScore.innerHTML = ranking
            .map(r => `${r.rank}. ${String(r.team).toUpperCase()} - ${r.score}`)
            .join("<br>");
    }
    if (gameOverOverlay) gameOverOverlay.classList.remove('hidden');
    document.body.classList.add('gameover-lock');
}

function resetUiSelections() {
    uiState.selectedId = null;
    uiState.validTargets = [];
    uiState.selectedInventoryId = null;
    uiState.hoverLane = null;
    uiState.selectedResurrectionId = null;
    uiState.resurrectionHoverLane = null;
    powerFlashEvents.length = 0;
    powerFlashSeq = 0;
    lastEnginePowerFlashSeq = 0;
    clearPowerMode();
}

function formatAiLabel(aiType) {
    const key = (aiType || "main").toLowerCase();
    if (key === "greedy") return "(Greedy AI)";
    if (key === "random") return "(Random AI)";
    return "(Main AI)";
}

function getTeamControllerLabel(team) {
    const policy = (playerAI && playerAI[team]) || "human";
    if (policy === "none") return "(None)";
    if (policy === "human") return "(Human)";
    return formatAiLabel(policy);
}

function mapUiPolicyToEngine(policy) {
    if (policy === "main") return "main4";
    return policy;
}

function showModeValidation(message) {
    if (!modeValidationEl) return;
    modeValidationEl.textContent = message;
    modeValidationEl.classList.remove('hidden');
}

function startConfiguredMode() {
    resetUiSelections();
    hideGameOverOverlay();

    const blue = mapUiPolicyToEngine(modeBluePolicy ? modeBluePolicy.value : "human");
    const red = mapUiPolicyToEngine(modeRedPolicy ? modeRedPolicy.value : "human");
    const yellow = mapUiPolicyToEngine(modeYellowPolicy ? modeYellowPolicy.value : "human");
    const green = mapUiPolicyToEngine(modeGreenPolicy ? modeGreenPolicy.value : "human");
    const picks = [blue, red, yellow, green];

    const noneCount = picks.filter(p => p === "none").length;
    if (noneCount === 4) {
        showModeValidation("No game to play");
        return;
    }
    if (noneCount === 3) {
        showModeValidation("Single player game not possible");
        return;
    }

    if (modeValidationEl) {
        modeValidationEl.textContent = "";
        modeValidationEl.classList.add('hidden');
    }

    handleCommand(`start ${blue} ${red} ${yellow} ${green}`);
    hideModeOverlay();
    updateUI();
    console.log(`UI: Mode selected -> BLUE=${blue} RED=${red} YELLOW=${yellow} GREEN=${green}`);
}

function getStartLaneFromGridPos(pos, team) {
    if (team === "blue") {
        if (pos.x === -1 && pos.y >= 0 && pos.y < 12) return pos.y;
    } else if (team === "yellow") {
        if (pos.x === 12 && pos.y >= 0 && pos.y < 12) return pos.y;
    } else if (team === "red") {
        if (pos.y === -1 && pos.x >= 0 && pos.x < 12) return pos.x;
    } else {
        if (pos.y === 12 && pos.x >= 0 && pos.x < 12) return pos.x;
    }
    return null;
}

function getBarricadeEdgeHit(soldier, mouseX, mouseY) {
    if (!soldier || soldier.state !== "board") return null;

    const square = gameToCanvas(soldier.x, soldier.y);
    const left = square.x;
    const top = square.y;
    const right = left + UI_CELL_SIZE;
    const bottom = top + UI_CELL_SIZE;
    const edgePx = 12;

    if (mouseX < left || mouseX > right || mouseY < top || mouseY > bottom) {
        return null;
    }

    const distances = [
        { edge: "top", d: Math.abs(mouseY - top) },
        { edge: "bottom", d: Math.abs(bottom - mouseY) },
        { edge: "left", d: Math.abs(mouseX - left) },
        { edge: "right", d: Math.abs(right - mouseX) }
    ];

    const nearEdges = distances.filter(e => e.d <= edgePx);
    if (nearEdges.length === 0) return null;
    nearEdges.sort((a, b) => a.d - b.d);

    const edge = nearEdges[0].edge;
    if (edge === "top") return { edge, orientation: "horizontal", direction: "forward" };
    if (edge === "bottom") return { edge, orientation: "horizontal", direction: "backward" };
    if (edge === "left") return { edge, orientation: "vertical", direction: "backward" };
    return { edge: "right", orientation: "vertical", direction: "forward" };
}

function getGunDirectionFromCell(shooter, cell) {
    if (!shooter || shooter.state !== "board") return null;
    if (cell.x === shooter.x && cell.y > shooter.y && cell.y <= 11) return "up";
    if (cell.x === shooter.x && cell.y < shooter.y && cell.y >= 0) return "down";
    if (cell.y === shooter.y && cell.x < shooter.x && cell.x >= 0) return "left";
    if (cell.y === shooter.y && cell.x > shooter.x && cell.x <= 11) return "right";
    return null;
}

function buildGunRayCells(shooter, direction) {
    if (!shooter || shooter.state !== "board") return [];

    let dx = 0;
    let dy = 0;
    if (direction === "up") dy = 1;
    else if (direction === "down") dy = -1;
    else if (direction === "left") dx = -1;
    else if (direction === "right") dx = 1;
    else return [];

    const cells = [];
    let x = shooter.x;
    let y = shooter.y;

    while (true) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 11 || ny < 0 || ny > 11) break;

        if (typeof gunBlocked === "function" && gunBlocked(x, y, nx, ny)) break;

        cells.push({ x: nx, y: ny });
        x = nx;
        y = ny;
    }

    return cells;
}

function getGunAimFromCell(shooter, cell) {
    const direction = getGunDirectionFromCell(shooter, cell);
    if (!direction) return null;

    const ray = buildGunRayCells(shooter, direction);
    if (ray.length === 0) return null;

    const isCellReachable = ray.some(c => c.x === cell.x && c.y === cell.y);
    if (!isCellReachable) return null;

    return {
        kind: "gun",
        direction,
        ray,
        reachableKeys: ray.map(c => `${c.x},${c.y}`)
    };
}

function getGunAimFromDirection(shooter, direction) {
    if (!direction) return null;
    const ray = buildGunRayCells(shooter, direction);
    if (ray.length === 0) return null;
    return {
        kind: "gun",
        direction,
        ray,
        reachableKeys: ray.map(c => `${c.x},${c.y}`)
    };
}

function traceRayCellsFrom(originX, originY, direction) {
    let dx = 0;
    let dy = 0;
    if (direction === "up") dy = 1;
    else if (direction === "down") dy = -1;
    else if (direction === "left") dx = -1;
    else if (direction === "right") dx = 1;
    else return [];

    const cells = [];
    let x = originX;
    let y = originY;

    while (true) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 11 || ny < 0 || ny > 11) break;
        if (typeof gunBlocked === "function" && gunBlocked(x, y, nx, ny)) break;

        cells.push({ x: nx, y: ny });
        x = nx;
        y = ny;
    }
    return cells;
}

function buildNukeAim(shooter, orientation) {
    if (!shooter || shooter.state !== "board") return null;

    const rays = [];
    if (orientation === "vertical") {
        for (let dx = -1; dx <= 1; dx++) {
            const ox = shooter.x + dx;
            const oy = shooter.y;
            if (ox < 0 || ox > 11 || oy < 0 || oy > 11) continue;
            rays.push({ originX: ox, originY: oy, direction: "up", cells: traceRayCellsFrom(ox, oy, "up") });
            rays.push({ originX: ox, originY: oy, direction: "down", cells: traceRayCellsFrom(ox, oy, "down") });
        }
    } else if (orientation === "horizontal") {
        for (let dy = -1; dy <= 1; dy++) {
            const ox = shooter.x;
            const oy = shooter.y + dy;
            if (ox < 0 || ox > 11 || oy < 0 || oy > 11) continue;
            rays.push({ originX: ox, originY: oy, direction: "left", cells: traceRayCellsFrom(ox, oy, "left") });
            rays.push({ originX: ox, originY: oy, direction: "right", cells: traceRayCellsFrom(ox, oy, "right") });
        }
    } else {
        return null;
    }

    const reachableKeys = new Set();
    rays.forEach(r => r.cells.forEach(c => reachableKeys.add(`${c.x},${c.y}`)));

    return {
        kind: "nuke",
        orientation,
        rays,
        reachableKeys: [...reachableKeys]
    };
}

function getNukeOrientationFromCell(shooter, cell) {
    if (!shooter || shooter.state !== "board") return null;
    if (cell.x < 0 || cell.x > 11 || cell.y < 0 || cell.y > 11) return null;

    const dx = cell.x - shooter.x;
    const dy = cell.y - shooter.y;
    if (dx === 0 && dy === 0) return null;

    // Click region gates: top/bottom three lanes => vertical, left/right three lanes => horizontal.
    const inVerticalBand = Math.abs(dx) <= 1 && dy !== 0;
    const inHorizontalBand = Math.abs(dy) <= 1 && dx !== 0;
    if (!inVerticalBand && !inHorizontalBand) return null;

    let orientation = null;
    if (inVerticalBand && inHorizontalBand) {
        orientation = Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";
    } else {
        orientation = inVerticalBand ? "vertical" : "horizontal";
    }

    return orientation;
}

function getNukeAimFromCell(shooter, cell) {
    const orientation = getNukeOrientationFromCell(shooter, cell);
    if (!orientation) return null;

    const aim = buildNukeAim(shooter, orientation);
    if (!aim) return null;
    const key = `${cell.x},${cell.y}`;
    if (!aim.reachableKeys.includes(key)) return null;
    return aim;
}
inputCanvas.addEventListener('mousemove', (e) => {
    if (phase !== "placement") return;

    const pos = getGridFromClick(e.clientX, e.clientY);
    const lane = getStartLaneFromGridPos(pos, currentPlayer);

    if (uiState.hoverLane !== lane) {
        uiState.hoverLane = lane;
        updateUI(); 
    }
});

inputCanvas.addEventListener('mousemove', (e) => {
    if (phase !== "main") return;
    if (!resurrectionPending || resurrectionPending.team !== currentPlayer) return;

    const pos = getGridFromClick(e.clientX, e.clientY);
    const lane = getStartLaneFromGridPos(pos, currentPlayer);

    if (uiState.resurrectionHoverLane !== lane) {
        uiState.resurrectionHoverLane = lane;
        updateUI();
    }
});

inputCanvas.addEventListener('mousemove', (e) => {
    if (phase !== "main") return;
    if (!uiState.powerMode) return;
    if (uiState.selectedPowerId === 2) {
        const selected = getSoldierByTeamAndId(currentPlayer, uiState.selectedPowerId);
        const mouse = getCanvasMousePos(e.clientX, e.clientY);
        const nextHover = getBarricadeEdgeHit(selected, mouse.x, mouse.y);
        const prevKey = uiState.powerHoverEdge
            ? `${uiState.powerHoverEdge.edge}|${uiState.powerHoverEdge.orientation}|${uiState.powerHoverEdge.direction}`
            : null;
        const nextKey = nextHover ? `${nextHover.edge}|${nextHover.orientation}|${nextHover.direction}` : null;

        if (prevKey !== nextKey) {
            uiState.powerHoverEdge = nextHover;
            updateUI();
        }
        return;
    }

    if (uiState.selectedPowerId === 3) {
        const pos = getGridFromClick(e.clientX, e.clientY);
        const selected = getSoldierByTeamAndId(currentPlayer, uiState.selectedPowerId);
        const direction = getGunDirectionFromCell(selected, pos);
        const nextAim = getGunAimFromDirection(selected, direction);
        const prevKey = uiState.powerAim
            ? `${uiState.powerAim.direction}|${uiState.powerAim.ray.length}`
            : null;
        const nextKey = nextAim ? `${nextAim.direction}|${nextAim.ray.length}` : null;

        if (prevKey !== nextKey) {
            uiState.powerAim = nextAim;
            updateUI();
        }
        return;
    }

    if (uiState.selectedPowerId === 5) {
        const pos = getGridFromClick(e.clientX, e.clientY);
        const selected = getSoldierByTeamAndId(currentPlayer, uiState.selectedPowerId);
        const orientation = getNukeOrientationFromCell(selected, pos);
        const nextAim = orientation ? buildNukeAim(selected, orientation) : null;
        const prevKey = uiState.powerAim
            ? `${uiState.powerAim.orientation}|${uiState.powerAim.reachableKeys.length}`
            : null;
        const nextKey = nextAim
            ? `${nextAim.orientation}|${nextAim.reachableKeys.length}`
            : null;

        if (prevKey !== nextKey) {
            uiState.powerAim = nextAim;
            updateUI();
        }
    }
});
// --- INPUT LISTENER ---
inputCanvas.addEventListener('mousedown', (e) => {
    const pos = getGridFromClick(e.clientX, e.clientY);
    
    // ============================
    // PHASE 4: PLACEMENT LOGIC
    // ============================

    if (phase === "placement") {
        // 1. Inventory Selection
        const clickedId = getClickedInventoryId(currentPlayer, e.clientX, e.clientY);
        if (clickedId) {
            playSfx("uiClick");
            uiState.selectedInventoryId = clickedId;
            updateUI();
            return;
        }

        // 3. Placing the Soldier (Strict: click must be on a valid start-lane cell)
        const clickedLane = getStartLaneFromGridPos(pos, currentPlayer);

        if (uiState.selectedInventoryId !== null && clickedLane !== null) {
            if (tutorialState.active) {
                const step = getCurrentTutorialStep();
                if (!step || step.nextOnly || step.expect !== "placement_complete") {
                    setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                    return;
                }
            }
            playSfx("uiClick");
            
            // EXECUTE: Send command to engine
            const cmd = `placep ${currentPlayer} ${uiState.selectedInventoryId} ${clickedLane}`;
            console.log(`UI: Executing -> "${cmd}"`);
            handleCommand(cmd);
            
            // Cleanup state
            uiState.selectedInventoryId = null;
            uiState.hoverLane = null;
            updateUI();
        }
        return;
    }

    // ============================
    // PHASE 3: MOVEMENT LOGIC (Main)
    // ============================
    if (phase === "main") {
        // Reset placement state just in case
        uiState.selectedInventoryId = null;

        if (
            pendingPostMovePower &&
            pendingPostMovePower.soldier &&
            pendingPostMovePower.soldier.team === currentPlayer &&
            isHumanTeam(currentPlayer)
        ) {
            if (tutorialState.active) {
                const step = getCurrentTutorialStep();
                if (!step || step.nextOnly || step.expect !== "id4_post_move_choice") {
                    setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                    return;
                }
            }
            const freezeSoldier = pendingPostMovePower.soldier;
            const clicked = getSoldierAtPosition(pos, currentPlayer);
            if (
                clicked &&
                clicked.id === freezeSoldier.id &&
                clicked.state === "board" &&
                clicked.x === freezeSoldier.x &&
                clicked.y === freezeSoldier.y
            ) {
                playSfx("uiClick");
                clearFreezeDecisionTimer();
                handleCommand("yes");
                if (tutorialState.active) tutorialState.id4Used = true;
                setInfoMessage("Freeze activated");
                if (tutorialState.active) tutorialEmit("id4_post_move_choice");
                updateUI();
            }
            return;
        }

        if (resurrectionPending && resurrectionPending.team === currentPlayer) {
            clearPowerMode();
            uiState.selectedId = null;
            uiState.validTargets = [];

            const clickedDeadId = getClickedPanelId(currentPlayer, "dead", e.clientX, e.clientY);
            if (
                clickedDeadId &&
                Array.isArray(resurrectionPending.ids) &&
                resurrectionPending.ids.includes(clickedDeadId)
            ) {
                if (tutorialState.active) {
                    const step = getCurrentTutorialStep();
                    if (!step || step.nextOnly || step.expect !== "resurrect_select_5" || clickedDeadId !== 5) {
                        setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                        return;
                    }
                }
                playSfx("uiClick");
                uiState.selectedResurrectionId = clickedDeadId;
                if (tutorialState.active) tutorialEmit("resurrect_select_5");
                updateUI();
                return;
            }

            const clickedLane = getStartLaneFromGridPos(pos, currentPlayer);
            if (uiState.selectedResurrectionId !== null && clickedLane !== null) {
                if (tutorialState.active) {
                    const step = getCurrentTutorialStep();
                    if (!step || step.nextOnly || step.expect !== "resurrect_place_5" || uiState.selectedResurrectionId !== 5) {
                        setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                        return;
                    }
                }
                playSfx("uiClick");
                const cmd = `resurrect ${uiState.selectedResurrectionId} ${clickedLane}`;
                console.log(`UI: Executing -> "${cmd}"`);
                handleCommand(cmd);

                uiState.selectedResurrectionId = null;
                uiState.resurrectionHoverLane = null;
                if (tutorialState.active) tutorialEmit("resurrect_place_5");
                updateUI();
            }
            return;
        }

        if (uiState.powerMode) {
            if (uiState.selectedPowerId === 2) {
                const selected = getSoldierByTeamAndId(currentPlayer, uiState.selectedPowerId);
                const mouse = getCanvasMousePos(e.clientX, e.clientY);
                const hit = getBarricadeEdgeHit(selected, mouse.x, mouse.y);

                // Priority: edge click should deploy barricade before any re-selection logic.
                if (hit) {
                    if (tutorialState.active) {
                        const step = getCurrentTutorialStep();
                        if (!step || step.nextOnly || step.expect !== "power_used_2") {
                            setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                            return;
                        }
                    }
                    playSfx("uiClick");
                    if (typeof canDeployBarricade === "function" && !canDeployBarricade(selected.x, selected.y, hit.orientation, hit.direction)) {
                        setInfoMessage("Barricade can't be deployed here");
                        return;
                    }
                    const cmd = `power 2 barricade ${hit.orientation} ${hit.direction}`;
                    console.log(`UI: Executing -> "${cmd}"`);
                    handleCommand(cmd);
                    if (tutorialState.active) tutorialEmit("power_used_2");

                    clearPowerMode();
                    uiState.selectedId = null;
                    uiState.validTargets = [];
                    updateUI();
                    return;
                }
            }

            if (uiState.selectedPowerId === 3) {
                const selected = getSoldierByTeamAndId(currentPlayer, uiState.selectedPowerId);
                const aim = getGunAimFromCell(selected, pos);
                if (aim) {
                    if (tutorialState.active) {
                        const step = getCurrentTutorialStep();
                        if (!step || step.nextOnly || step.expect !== "power_used_3") {
                            setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                            return;
                        }
                    }
                    playSfx("uiClick");
                    const cmd = `power 3 gun ${aim.direction}`;
                    console.log(`UI: Executing -> "${cmd}"`);
                    handleCommand(cmd);
                    if (tutorialState.active) tutorialEmit("power_used_3");

                    clearPowerMode();
                    uiState.selectedId = null;
                    uiState.validTargets = [];
                    updateUI();
                    return;
                }
            }

            if (uiState.selectedPowerId === 5) {
                const selected = getSoldierByTeamAndId(currentPlayer, uiState.selectedPowerId);
                const aim = getNukeAimFromCell(selected, pos);
                if (aim) {
                    if (tutorialState.active) {
                        const step = getCurrentTutorialStep();
                        if (!step || step.nextOnly || step.expect !== "power_used_5") {
                            setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                            return;
                        }
                    }
                    playSfx("uiClick");
                    const cmd = `power 5 nuke ${aim.orientation}`;
                    console.log(`UI: Executing -> "${cmd}"`);
                    handleCommand(cmd);
                    if (tutorialState.active) tutorialEmit("power_used_5");

                    clearPowerMode();
                    uiState.selectedId = null;
                    uiState.validTargets = [];
                    updateUI();
                    return;
                }
            }

            const clickedPowerSoldier = getSoldierAtPosition(pos, currentPlayer);
            const isCandidate = clickedPowerSoldier &&
                clickedPowerSoldier.state === "board" &&
                uiState.powerCandidates.includes(clickedPowerSoldier.id);

            if (isCandidate) {
                if (clickedPowerSoldier.id === 4) {
                    if (tutorialState.active) {
                        const step = getCurrentTutorialStep();
                        if (!step || step.nextOnly || step.expect !== "power_used_4") {
                            setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                            return;
                        }
                    }
                    playSfx("uiClick");
                    const cmd = `power 4 freeze`;
                    console.log(`UI: Executing -> "${cmd}"`);
                    handleCommand(cmd);
                    if (tutorialState.active) {
                        tutorialState.id4Used = true;
                        tutorialEmit("power_used_4");
                    }

                    clearPowerMode();
                    uiState.selectedId = null;
                    uiState.validTargets = [];
                    updateUI();
                    return;
                }

                // Avoid spam when repeatedly clicking the already selected candidate.
                if (uiState.selectedPowerId !== clickedPowerSoldier.id) {
                    if (tutorialState.active) {
                        const step = getCurrentTutorialStep();
                        const expected = step && !step.nextOnly ? step.expect : "";
                        const match = /^power_select_(\d)$/.exec(expected || "");
                        const requiredId = match ? Number(match[1]) : null;
                        if (requiredId === null || clickedPowerSoldier.id !== requiredId) {
                            setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                            return;
                        }
                    }
                    playSfx("uiClick");
                    uiState.selectedPowerId = clickedPowerSoldier.id;
                    uiState.powerHoverEdge = null;
                    uiState.powerAim = null;
                    console.log(`UI: Power candidate selected -> ${clickedPowerSoldier.id}.`);
                    if (tutorialState.active) tutorialEmit(`power_select_${clickedPowerSoldier.id}`);
                    updateUI();
                }
                return;
            }
            // Invalid click: keep current power selection (requested behavior).
            return;
        }

        const clickedSoldier = getSoldierAtPosition(pos, currentPlayer);

        // A. Selection
        if (clickedSoldier) {
            let tutorialSelectedStepMode = null;
            if (tutorialState.active) {
                const step = getCurrentTutorialStep();
                const expected = step && !step.nextOnly ? step.expect : "";
                let match = /^select_soldier_(\d)$/.exec(expected || "");
                if (match) tutorialSelectedStepMode = "select";
                if (!match) {
                    match = /^move_soldier_(\d)$/.exec(expected || "");
                    if (match) tutorialSelectedStepMode = "move";
                }
                const requiredId = match ? Number(match[1]) : null;
                if (requiredId === null) {
                    setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                    return;
                }
                if (clickedSoldier.id !== requiredId) {
                    setInfoMessage(`Tutorial: Select BLUE ID ${requiredId}`);
                    return;
                }
            }
            // TWEAK: Cannot select soldiers until you ROLL
            if (pendingRoll === null) {
                console.log("UI: You must ROLL DICE first!");
                return;
            }

            // Ask Engine WHO is allowed to move
            const legalSoldiers = getLegalMoves(currentPlayer, pendingRoll);
            const isLegal = legalSoldiers.some(s => s.id === clickedSoldier.id);

            if (isLegal) {
                playSfx("uiClick");
                clearPowerMode();
                uiState.selectedId = clickedSoldier.id;
                uiState.validTargets = calculateTarget(clickedSoldier);
                console.log(`UI: Selected ${clickedSoldier.id}. Target:`, uiState.validTargets);
                if (tutorialState.active && tutorialSelectedStepMode === "select") {
                    tutorialEmit(`select_soldier_${clickedSoldier.id}`);
                }
                updateUI();
            } else {
                console.log("UI: Soldier cannot move (Blocked or wrong phase).");
                setInfoMessage("Selected soldier can't move with this roll");
            }
            return;
        }

        // B. Movement Execution
        if (uiState.selectedId !== null) {
            const moveAction = uiState.validTargets.find(m => m.x === pos.x && m.y === pos.y);

            if (moveAction) {
                if (tutorialState.active) {
                    const step = getCurrentTutorialStep();
                    const expected = step && !step.nextOnly ? step.expect : "";
                    const match = /^move_soldier_(\d)$/.exec(expected || "");
                    const requiredId = match ? Number(match[1]) : null;
                    if (requiredId === null || uiState.selectedId !== requiredId) {
                        setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                        return;
                    }
                }
                playSfx("uiClick");
                // Fix: Strict command format (ID only)
                const cmd = `move ${uiState.selectedId}`;
                console.log(`UI: Executing -> "${cmd}"`);
                handleCommand(cmd);
                if (tutorialState.active) tutorialEmit(`move_soldier_${uiState.selectedId}`);
                
                uiState.selectedId = null;
                uiState.validTargets = [];
                clearPowerMode();
                updateUI();
            } else {
                // Deselect if clicking invalid space
                uiState.selectedId = null;
                uiState.validTargets = [];
                updateUI();
            }
        }
    }
});

function updateUI() {
    tutorialAutoPlaceRed();
    tutorialCheckProgress();
    if (tutorialSkipRedTurnIfNeeded()) {
        // Continue with fresh state after forced tutorial turn handoff.
    }
    ensureFreezeDecisionTimer();
    syncPowerFlashEventsFromEngine();
    playEngineStateSfx();

    if (!resurrectionPending) {
        uiState.selectedResurrectionId = null;
        uiState.resurrectionHoverLane = null;
    }

    const viewerTeam = getViewerTeamForVisibility();

    const snapshot = {
        currentPlayer: currentPlayer,
        viewerTeam: viewerTeam,
        blueControllerLabel: getTeamControllerLabel("blue"),
        redControllerLabel: getTeamControllerLabel("red"),
        yellowControllerLabel: getTeamControllerLabel("yellow"),
        greenControllerLabel: getTeamControllerLabel("green"),
        phase: phase,
        pendingRoll: pendingRoll,
        freezeDecision: (
            freezeDecisionTimer &&
            pendingPostMovePower &&
            pendingPostMovePower.soldier &&
            pendingPostMovePower.soldier.team === currentPlayer &&
            isHumanTeam(currentPlayer)
        )
            ? {
                x: pendingPostMovePower.soldier.x,
                y: pendingPostMovePower.soldier.y,
                remainingMs: Math.max(0, freezeDecisionTimer.deadline - Date.now())
            }
            : null,
        powerFlashEvents: powerFlashEvents.map((ev) => ({ ...ev })),
        soldiers: soldiers.map(s => ({...s})),
        resurrectionPending: resurrectionPending
            ? { team: resurrectionPending.team, ids: [...resurrectionPending.ids] }
            : null,
        
        // Phase 3
        selectedId: uiState.selectedId,
        validTargets: uiState.validTargets,
        powerMode: uiState.powerMode,
        powerCandidates: [...uiState.powerCandidates],
        selectedPowerId: uiState.selectedPowerId,
        powerHoverEdge: uiState.powerHoverEdge ? { ...uiState.powerHoverEdge } : null,
        powerAim: uiState.powerAim
            ? {
                kind: uiState.powerAim.kind,
                direction: uiState.powerAim.direction,
                ray: uiState.powerAim.ray ? uiState.powerAim.ray.map(c => ({ ...c })) : undefined,
                orientation: uiState.powerAim.orientation,
                rays: uiState.powerAim.rays
                    ? uiState.powerAim.rays.map(r => ({
                        originX: r.originX,
                        originY: r.originY,
                        direction: r.direction,
                        cells: r.cells.map(c => ({ ...c }))
                    }))
                    : undefined,
                reachableKeys: uiState.powerAim.reachableKeys ? [...uiState.powerAim.reachableKeys] : undefined
            }
            : null,

        // NEW Phase 4
        selectedInventoryId: uiState.selectedInventoryId,
        hoverLane: uiState.hoverLane,

        // Resurrection
        selectedResurrectionId: uiState.selectedResurrectionId,
        resurrectionHoverLane: uiState.resurrectionHoverLane
    };

    const stateSignature = `${snapshot.phase}|${snapshot.currentPlayer}|${snapshot.pendingRoll}`;
    if (stateSignature !== lastStateSignature) {
        lastStateSignature = stateSignature;
    }

    syncActionButtons(snapshot);
    if (tutorialState.active) {
        const step = getCurrentTutorialStep();
        setTutorialArrow(step && step.arrow ? step.arrow : null);
    }

    updateDashboard(snapshot);
    render(snapshot);
}

function updateDashboard(state) {
    const diceEl = document.getElementById('dice-value');
    diceEl.innerText = state.pendingRoll !== null ? state.pendingRoll : "--";

    if (state.phase === "gameover") {
        clearFreezeDecisionTimer();
        clearInfoMessage();
        if (!gameOverShown) {
            playSfx("gameOver");
            showGameOverOverlay();
            gameOverShown = true;
        }
    } else {
        if (gameOverShown) {
            hideGameOverOverlay();
            gameOverShown = false;
        }

        if (state.phase === "placement") {
            setInfoMessage("Place a soldier from inventory to start line", { sticky: true });
            wasResurrectionPromptActive = false;
        } else if (state.phase === "main") {
            const aiThinking = isAiThinkingTurn(state);
            if (aiThinking) {
                setInfoMessage("AI is thinking...", { sticky: true });
                wasResurrectionPromptActive = false;
                return;
            }
            if (infoSticky) clearInfoMessage();
            const resurrectionPromptActive = !!(
                resurrectionPending &&
                resurrectionPending.team === state.currentPlayer
            );
            if (resurrectionPromptActive && !wasResurrectionPromptActive) {
                setInfoMessage("Choose a dead player to resurrect");
            }
            const freezePromptActive = !!(
                pendingPostMovePower &&
                pendingPostMovePower.soldier &&
                pendingPostMovePower.soldier.team === state.currentPlayer &&
                isHumanTeam(state.currentPlayer)
            );
            if (freezePromptActive) {
                setInfoMessage("Click ID-4 within 4s to use freeze");
            }
            wasResurrectionPromptActive = resurrectionPromptActive;
        } else {
            clearFreezeDecisionTimer();
            clearInfoMessage();
            wasResurrectionPromptActive = false;
        }
    }
}

function panelIndexForState(state) {
    if (state === "inventory") return 0;
    if (state === "dead") return 1;
    if (state === "finished") return 2;
    return 0;
}

function getClickedPanelId(team, panelState, clientX, clientY) {
    const rect = inputCanvas.getBoundingClientRect();
    const scaleX = inputCanvas.width / rect.width;
    const scaleY = inputCanvas.height / rect.height;
    
    // Convert click to Canvas Pixels
    const mouseX = (clientX - rect.left) * scaleX;
    const mouseY = (clientY - rect.top) * scaleY;
    
    const candidates = soldiers.filter(s => s.team === team && s.state === panelState);
    
    // CONSTANTS FROM RENDERER
    const CELL_SIZE = UI_CELL_SIZE;
    const boxWidth = MAIN_PANEL_BOX_WIDTH;
    const boxHeight = MAIN_PANEL_BOX_HEIGHT;
    const panelIndex = panelIndexForState(panelState);

    for (const s of candidates) {
        let originX, originY;
        
        if (team === "blue") {
            originX = MAIN_BLUE_PANEL_X;
            originY = MAIN_BLUE_PANEL_Y + (panelIndex * (boxHeight + MAIN_PANEL_GAP));
        } else if (team === "yellow") {
            originX = MAIN_YELLOW_PANEL_X;
            originY = MAIN_YELLOW_PANEL_Y + (panelIndex * (boxHeight + MAIN_PANEL_GAP));
        } else if (team === "green") {
            originX = MAIN_GREEN_PANEL_X + (panelIndex * (boxWidth + MAIN_PANEL_GAP));
            originY = MAIN_GREEN_PANEL_Y;
        } else {
            originX = MAIN_RED_PANEL_X + (panelIndex * (boxWidth + MAIN_PANEL_GAP));
            originY = MAIN_RED_PANEL_Y;
        }

        const localCol = (s.id - 1) % 3; 
        const localRow = Math.floor((s.id - 1) / 3);
        
        // Center of the token
        const tokenCenterX = originX + MAIN_TOKEN_PAD_X + (localCol * MAIN_TOKEN_SPACING) + (CELL_SIZE / 2);
        const tokenCenterY = originY + MAIN_TOKEN_PAD_Y + (localRow * MAIN_TOKEN_SPACING) + (CELL_SIZE / 2);
        
        // Distance check (Radius ~20px)
        const dist = Math.sqrt((mouseX - tokenCenterX)**2 + (mouseY - tokenCenterY)**2);
        
        if (dist < 25) return s.id;
    }
    return null;
}

function getClickedInventoryId(team, clientX, clientY) {
    return getClickedPanelId(team, "inventory", clientX, clientY);
}
// Initial Boot
showMainMenuOverlay();
loadAudioVolumes();
applyBgmVolume(bgmVolume);
applySfxVolume(sfxVolume);
updateUI();
startEngineUiSyncLoop();
positionBoardControls();
startBackgroundMusic().catch(() => {});
window.addEventListener('resize', positionBoardControls);
window.addEventListener('pointerdown', startBackgroundMusic, { once: true });
window.addEventListener('keydown', startBackgroundMusic, { once: true });

if (rollDieBtn) {
    rollDieBtn.addEventListener('click', () => {
        if (tutorialState.active) {
            const step = getCurrentTutorialStep();
            if (!step || step.nextOnly || step.expect !== "roll_clicked") {
                setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
                return;
            }
            clearPowerMode();
            const forcedRoll = typeof step.forcedRoll === "number" ? step.forcedRoll : null;
            if (forcedRoll !== null) handleCommand(`rl ${forcedRoll}`);
            else handleCommand("roll");
            playRandomDiceRollSfx();
            tutorialEmit("roll_clicked");
            updateUI();
            return;
        }

        if (pendingRoll !== null) {
            setInfoMessage("You already rolled this turn");
            return;
        }
        const prevPendingRoll = pendingRoll;
        clearPowerMode();
        handleCommand("roll");
        if (prevPendingRoll === null && pendingRoll !== null) {
            playRandomDiceRollSfx();
        }
        if (typeof noMoveSkipPending !== "undefined" && noMoveSkipPending) {
            setInfoMessage("Turn skipped, no legal moves with current roll");
        }
        updateUI();
    });
}

document.getElementById('btn-use-power').addEventListener('click', () => {
    if (tutorialState.active) {
        const step = getCurrentTutorialStep();
        if (!step || step.nextOnly || step.expect !== "use_power_clicked") {
            setInfoMessage(step && step.text ? `Tutorial: ${step.text}` : "Tutorial action required");
            return;
        }
    }

    playSfx("uiClick");
    if (phase !== "main") {
        console.log("UI: Power can only be chosen in main phase.");
        return;
    }

    if (pendingPostMovePower && pendingPostMovePower.soldier.team === currentPlayer) {
        console.log("UI: ID-4 post-move freeze decision is pending; dedicated handling will be wired next.");
        return;
    }

    if (pendingRoll !== null) {
        console.log("UI: You already rolled this turn. Power is unavailable now.");
        setInfoMessage("Can't use power now, you already rolled");
        return;
    }

    if (uiState.powerMode) {
        clearPowerMode();
        console.log("UI: Power selection cancelled.");
        updateUI();
        return;
    }

    const legalPowers = getLegalPowers(currentPlayer);
    if (legalPowers.length === 0) {
        console.log("UI: No legal power available. Choose roll.");
        setInfoMessage("No legal powers available choose roll");
        return;
    }

    uiState.selectedId = null;
    uiState.validTargets = [];
    uiState.powerMode = true;
    uiState.powerCandidates = legalPowers.map(s => s.id);
    uiState.selectedPowerId = null;
    console.log(`UI: Power mode active. Choose soldier: ${uiState.powerCandidates.join(", ")}`);
    setInfoMessage("Choose a player to use power");
    if (tutorialState.active) tutorialEmit("use_power_clicked");
    updateUI();
});

if (modeStartBtn) {
    modeStartBtn.addEventListener('click', () => {
        playSfx("uiClick");
        startConfiguredMode();
    });
}

if (menuPlayBtn) {
    menuPlayBtn.addEventListener('click', () => {
        playSfx("uiClick");
        startBackgroundMusic();
        showModeOverlay();
    });
}

if (menuTutorialBtn) {
    menuTutorialBtn.addEventListener('click', () => {
        playSfx("uiClick");
        startBackgroundMusic();
        startTutorial();
    });
}

if (menuRulesBtn) {
    menuRulesBtn.addEventListener('click', () => {
        playSfx("uiClick");
        startBackgroundMusic();
        showRulesOverlay();
    });
}

if (modeBackBtn) {
    modeBackBtn.addEventListener('click', () => {
        playSfx("uiClick");
        showMainMenuOverlay();
    });
}

if (tutorialBackBtn) {
    tutorialBackBtn.addEventListener('click', () => {
        playSfx("uiClick");
        showMainMenuOverlay();
    });
}

if (tutorialStartBtn) {
    tutorialStartBtn.addEventListener('click', () => {
        playSfx("uiClick");
        startBackgroundMusic();
        startTutorial();
    });
}

if (tutorialNextBtn) {
    tutorialNextBtn.addEventListener('click', () => {
        playSfx("uiClick");
        if (!tutorialState.active) return;
        const step = getCurrentTutorialStep();
        if (!step || !step.nextOnly) return;
        tutorialAdvanceStep();
        updateUI();
    });
}

if (tutorialEndBtn) {
    tutorialEndBtn.addEventListener('click', () => {
        playSfx("uiClick");
        stopTutorial(true);
    });
}

if (rulesBackBtn) {
    rulesBackBtn.addEventListener('click', () => {
        playSfx("uiClick");
        showMainMenuOverlay();
    });
}

if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
        playSfx("uiClick");
        hideGameOverOverlay();
        gameOverShown = false;
        resetUiSelections();
        handleCommand("reset");
        showMainMenuOverlay();
        updateUI();
        console.log("UI: Game reset. Choose a mode to play again.");
    });
}

if (menuAudioToggleBtn && audioSettingsPanel) {
    menuAudioToggleBtn.addEventListener('click', () => {
        playSfx("uiClick");
        audioSettingsPanel.classList.toggle('hidden');
    });
}

if (bgmVolumeSlider) {
    bgmVolumeSlider.addEventListener('input', (e) => {
        const pct = Number(e.target.value);
        applyBgmVolume(pct / 100);
        saveAudioVolumes();
    });
}

if (sfxVolumeSlider) {
    sfxVolumeSlider.addEventListener('input', (e) => {
        const pct = Number(e.target.value);
        applySfxVolume(pct / 100);
        saveAudioVolumes();
    });
}

if (quitToMenuBtn) {
    quitToMenuBtn.addEventListener('click', () => {
        playSfx("uiClick");
        if (tutorialState.active) {
            stopTutorial(true);
            return;
        }
        hideGameOverOverlay();
        gameOverShown = false;
        clearFreezeDecisionTimer();
        clearInfoMessage();
        resetUiSelections();
        handleCommand("reset");
        showMainMenuOverlay();
        updateUI();
    });
}
