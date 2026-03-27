const CELL_SIZE = 50; 
const VISUAL_GRID_SIZE = 14; 
const BOARD_OFFSET = 1; 

const LEFT_PANEL_COLS = 4;
const RIGHT_PANEL_COLS = 4;
const TOP_PANEL_ROWS = 4;
const BOTTOM_PANEL_ROWS = 4;

const CANVAS_COLS = VISUAL_GRID_SIZE + LEFT_PANEL_COLS + RIGHT_PANEL_COLS;
const CANVAS_ROWS = VISUAL_GRID_SIZE + TOP_PANEL_ROWS + BOTTOM_PANEL_ROWS;

const BOARD_PIXEL_X = LEFT_PANEL_COLS * CELL_SIZE;
const BOARD_PIXEL_Y = TOP_PANEL_ROWS * CELL_SIZE;
const BOARD_PIXEL_SIZE = VISUAL_GRID_SIZE * CELL_SIZE;

const PANEL_BOX_WIDTH = (LEFT_PANEL_COLS - 0.5) * CELL_SIZE;
const PANEL_BOX_HEIGHT = 3 * CELL_SIZE;
const PANEL_GAP = 10;
const SIDE_PANEL_Y_SHIFT = TOP_PANEL_ROWS * CELL_SIZE;
const BLUE_PANEL_X = 10;
const BLUE_PANEL_Y = 80 + SIDE_PANEL_Y_SHIFT;
const YELLOW_PANEL_X = BOARD_PIXEL_X + BOARD_PIXEL_SIZE + 10;
const YELLOW_PANEL_Y = BLUE_PANEL_Y;
const RED_PANEL_X = BOARD_PIXEL_X + 100;
const RED_PANEL_Y = BOARD_PIXEL_Y + BOARD_PIXEL_SIZE + 10;
const GREEN_PANEL_X = RED_PANEL_X;
const GREEN_PANEL_Y = 35;
const TOKEN_PAD_X = 30;
const TOKEN_PAD_Y = 40;
const TOKEN_SPACING = 45;
const RENDER_BOARD_SIZE = 12;
const FREEZE_FLASH_MS = 3000;
const POWER_FLASH_MS = 1000;

const freezeFlashEvents = [];
const previousId4PowerUsed = new Map();
const powerLaserFlashEvents = [];
let lastPowerFlashSeq = 0;
let freezeAnimRaf = null;

const canvas = document.getElementById("grid-canvas");
const ctx = canvas.getContext("2d");

const COLORS = {
    background: "#0a0a0a",
    blue: "#58a6ff",
    red: "#f85149",
    yellow: "#f2cc60",
    green: "#3fb950",
    grid: "#30363d",
    zoneBorder: "#8b949e",
    unknown: "#6e7681",
    highlight: "#d29922",
    target: "#2ea043",
    shadow: "rgba(0, 0, 0, 0.45)"
};

canvas.width = CANVAS_COLS * CELL_SIZE;
canvas.height = CANVAS_ROWS * CELL_SIZE;

function gameToCanvas(engineX, engineY) {
    const boardVisualX = engineX + BOARD_OFFSET;
    const boardVisualY = engineY + BOARD_OFFSET;

    const screenX = (boardVisualX + LEFT_PANEL_COLS) * CELL_SIZE;
    const screenY = BOARD_PIXEL_Y + (VISUAL_GRID_SIZE - 1 - boardVisualY) * CELL_SIZE;

    return { x: screenX, y: screenY };
}

function render(snapshot) {
    syncFreezeFlashEvents(snapshot);
    syncPowerFlashEvents(snapshot);
    clearCanvas();
    drawZones();
    drawGrid();
    drawBarricades();
    drawFreezeFlashes();
    drawSidePanels(snapshot);

    if (snapshot.phase === "main") {
        drawTargetHighlights(snapshot.validTargets || []);
    }

    // Draw Soldiers (Handles Board AND Panels now)
    drawAllSoldiers(
        snapshot.soldiers,
        snapshot.viewerTeam,
        snapshot.selectedInventoryId,
        snapshot.currentPlayer,
        snapshot.selectedResurrectionId,
        snapshot.currentPlayer,
        snapshot.resurrectionPending,
        {
            powerMode: !!snapshot.powerMode,
            powerCandidates: snapshot.powerCandidates || [],
            selectedPowerId: snapshot.selectedPowerId
        }
    );

    if (snapshot.phase === "main" && snapshot.powerMode) {
        drawPowerHighlights(
            snapshot.soldiers,
            snapshot.powerCandidates || [],
            snapshot.currentPlayer,
            snapshot.selectedPowerId
        );

        if (snapshot.selectedPowerId === 2 && snapshot.powerHoverEdge) {
            drawBarricadeEdgePreview(
                snapshot.soldiers,
                snapshot.currentPlayer,
                snapshot.selectedPowerId,
                snapshot.powerHoverEdge
            );
        }

        if (snapshot.selectedPowerId === 3 && snapshot.powerAim) {
            drawGunLaserPreview(
                snapshot.soldiers,
                snapshot.currentPlayer,
                snapshot.selectedPowerId,
                snapshot.powerAim
            );
        }

        if (snapshot.selectedPowerId === 5 && snapshot.powerAim) {
            drawNukeLaserPreview(
                snapshot.soldiers,
                snapshot.currentPlayer,
                snapshot.selectedPowerId,
                snapshot.powerAim
            );
        }
    }

    if (snapshot.phase === "main" && snapshot.selectedId !== null) {
        drawSelectionRing(snapshot.soldiers, snapshot.selectedId, snapshot.currentPlayer);
    }

    if (
        snapshot.phase === "placement" &&
        snapshot.selectedInventoryId !== null &&
        snapshot.hoverLane !== null
    ) {
        drawPlacementGhost(snapshot.currentPlayer, snapshot.selectedInventoryId, snapshot.hoverLane);
    }

    if (
        snapshot.phase === "main" &&
        snapshot.resurrectionPending &&
        snapshot.resurrectionPending.team === snapshot.currentPlayer &&
        snapshot.selectedResurrectionId !== null &&
        snapshot.resurrectionHoverLane !== null
    ) {
        drawPlacementGhost(snapshot.currentPlayer, snapshot.selectedResurrectionId, snapshot.resurrectionHoverLane);
    }

    drawFreezeDecisionTimer(snapshot);
    drawPowerFlashes();
    scheduleFreezeAnimationFrame();
}

function clearCanvas() {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
// ui/renderer.js

function drawSidePanels(snapshot) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.font = "14px Arial";

    const resurrectionActive = !!(
        snapshot &&
        snapshot.phase === "main" &&
        snapshot.resurrectionPending &&
        snapshot.resurrectionPending.team === snapshot.currentPlayer
    );
    const resurrectionTeam = resurrectionActive ? snapshot.currentPlayer : null;
    
    const labels = ["Inventory", "Dead", "Finished"];
    const boxWidth = PANEL_BOX_WIDTH;
    const boxHeight = PANEL_BOX_HEIGHT;
    const teamAccent = {
        blue: "#8fd1ff",
        red: "#ff8a8a",
        yellow: "#ffe08a",
        green: "#9ae6a4"
    };
    const teamLabelAccent = {
        blue: "#b8dfff",
        red: "#ffc4c4",
        yellow: "#fff1bf",
        green: "#c6f6d5"
    };

    function drawVerticalPanel(team, panelX, panelY, controllerLabel) {
        const accent = teamAccent[team];
        const turnActive = snapshot && snapshot.currentPlayer === team;
        ctx.save();
        if (turnActive) {
            ctx.shadowColor = accent;
            ctx.shadowBlur = 18;
        }
        ctx.fillStyle = accent;
        ctx.font = "italic bold 25px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("TEAM", panelX + 50, panelY - 80);
        ctx.fillText(team.toUpperCase(), panelX + 50, panelY - 50);
        if (snapshot && controllerLabel) {
            ctx.fillStyle = teamLabelAccent[team];
            ctx.font = "bold 14px Arial";
            ctx.fillText(controllerLabel, panelX + 55, panelY - 20);
        }
        ctx.restore();

        labels.forEach((label, i) => {
            const x = panelX;
            const y = panelY + (i * (boxHeight + PANEL_GAP));
            const isDeadPanelGlow = resurrectionActive && resurrectionTeam === team && label === "Dead";
            if (isDeadPanelGlow) {
                ctx.save();
                ctx.strokeStyle = accent;
                ctx.shadowColor = accent;
                ctx.shadowBlur = 16;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, boxWidth, boxHeight);
                ctx.restore();
            }
            ctx.strokeStyle = COLORS[team];
            ctx.strokeRect(x, y, boxWidth, boxHeight);
            ctx.fillStyle = isDeadPanelGlow ? accent : COLORS[team];
            ctx.font = isDeadPanelGlow ? "italic bold 21px Arial" : "italic 20px Arial";
            ctx.fillText(label, x + 50, y + 20);
        });
    }

    function drawHorizontalPanel(team, panelX, panelY, controllerLabel, labelOffsetY = 0) {
        const accent = teamAccent[team];
        const turnActive = snapshot && snapshot.currentPlayer === team;
        ctx.save();
        if (turnActive) {
            ctx.shadowColor = accent;
            ctx.shadowBlur = 18;
        }
        ctx.fillStyle = accent;
        ctx.font = "italic bold 25px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText("TEAM", panelX - 100, panelY + 60 + labelOffsetY);
        ctx.fillText(team.toUpperCase(), panelX - 100, panelY + 90 + labelOffsetY);
        if (snapshot && controllerLabel) {
            ctx.fillStyle = teamLabelAccent[team];
            ctx.font = "bold 14px Arial";
            ctx.fillText(controllerLabel, panelX - 95, panelY + 122 + labelOffsetY);
        }
        ctx.restore();

        labels.forEach((label, i) => {
            const x = panelX + (i * (boxWidth + PANEL_GAP));
            const y = panelY;
            const isDeadPanelGlow = resurrectionActive && resurrectionTeam === team && label === "Dead";
            if (isDeadPanelGlow) {
                ctx.save();
                ctx.strokeStyle = accent;
                ctx.shadowColor = accent;
                ctx.shadowBlur = 16;
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, boxWidth, boxHeight);
                ctx.restore();
            }
            ctx.strokeStyle = COLORS[team];
            ctx.strokeRect(x, y, boxWidth, boxHeight);
            ctx.fillStyle = isDeadPanelGlow ? accent : COLORS[team];
            ctx.font = isDeadPanelGlow ? "italic bold 21px Arial" : "italic 20px Arial";
            ctx.fillText(label, x + 50, y + 20);
        });
    }

    drawVerticalPanel("blue", BLUE_PANEL_X, BLUE_PANEL_Y, snapshot && snapshot.blueControllerLabel);
    drawVerticalPanel("yellow", YELLOW_PANEL_X, YELLOW_PANEL_Y, snapshot && snapshot.yellowControllerLabel);
    drawHorizontalPanel("red", RED_PANEL_X, RED_PANEL_Y, snapshot && snapshot.redControllerLabel);
    drawHorizontalPanel("green", GREEN_PANEL_X, GREEN_PANEL_Y, snapshot && snapshot.greenControllerLabel, -8);

    ctx.restore();
}
function drawZones() {
    ctx.save();
    // Left/Right side zones (Blue + Yellow)
    ctx.fillStyle = hexToRgba(COLORS.blue, 0.15);
    ctx.fillRect(BOARD_PIXEL_X, BOARD_PIXEL_Y, CELL_SIZE, BOARD_PIXEL_SIZE);
    ctx.fillStyle = hexToRgba(COLORS.yellow, 0.15);
    ctx.fillRect(
        BOARD_PIXEL_X + (VISUAL_GRID_SIZE - 1) * CELL_SIZE,
        BOARD_PIXEL_Y,
        CELL_SIZE,
        BOARD_PIXEL_SIZE
    );
    // Bottom/Top side zones (Red + Green)
    ctx.fillStyle = hexToRgba(COLORS.red, 0.15);
    ctx.fillRect(
        BOARD_PIXEL_X,
        BOARD_PIXEL_Y + (VISUAL_GRID_SIZE - 1) * CELL_SIZE,
        BOARD_PIXEL_SIZE,
        CELL_SIZE
    );
    ctx.fillStyle = hexToRgba(COLORS.green, 0.15);
    ctx.fillRect(BOARD_PIXEL_X, BOARD_PIXEL_Y, BOARD_PIXEL_SIZE, CELL_SIZE);
    ctx.restore();
}

function drawGrid() {
    ctx.lineWidth = 1;
    for (let i = 0; i <= VISUAL_GRID_SIZE; i++) {
        const isZoneLine = (i === 0 || i === 1 || i === 13 || i === 14);
        ctx.strokeStyle = isZoneLine ? COLORS.zoneBorder : COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(BOARD_PIXEL_X + i * CELL_SIZE, BOARD_PIXEL_Y);
        ctx.lineTo(BOARD_PIXEL_X + i * CELL_SIZE, BOARD_PIXEL_Y + BOARD_PIXEL_SIZE);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(BOARD_PIXEL_X, BOARD_PIXEL_Y + i * CELL_SIZE);
        ctx.lineTo(BOARD_PIXEL_X + BOARD_PIXEL_SIZE, BOARD_PIXEL_Y + i * CELL_SIZE);
        ctx.stroke();
    }
}


function drawAllSoldiers(
    soldiers,
    viewerTeam,
    selectedInventoryId,
    selectedInventoryTeam,
    selectedDeadId,
    selectedDeadTeam,
    resurrectionPending,
    powerState
) {
    if (!soldiers) return;

    soldiers.forEach(s => {
        const powerEligible =
            powerState &&
            powerState.powerMode &&
            s.state === "board" &&
            s.team === viewerTeam &&
            powerState.powerCandidates.includes(s.id);
        const powerSelected = powerEligible && powerState.selectedPowerId === s.id;
        const resurrectionEligible =
            resurrectionPending &&
            resurrectionPending.team === viewerTeam &&
            s.state === "dead" &&
            s.team === viewerTeam &&
            Array.isArray(resurrectionPending.ids) &&
            resurrectionPending.ids.includes(s.id);

        // 1. BOARD & START LINE
        if (s.state === "board" || s.state === "start") {
             const isVisible = (s.team === viewerTeam) || s.revealed;

             let ex = s.x;
             let ey = s.y;

             // Engine stores start units with one axis as null:
             // blue start -> (x=null, y=lane), red start -> (x=lane, y=null).
             // Convert to explicit start-zone coords for rendering.
             if (s.state === "start") {
                 if (s.team === "blue") {
                     ex = -1;
                     ey = s.y;
                 } else if (s.team === "yellow") {
                     ex = 12;
                     ey = s.y;
                 } else if (s.team === "red") {
                     ex = s.x;
                     ey = -1;
                 } else {
                     ex = s.x;
                     ey = 12;
                 }
             }

             const pos = gameToCanvas(ex, ey);
             const showFrozenBadge = shouldShowFrozenBadge(s, soldiers);
             if (isVisible) drawToken(pos.x, pos.y, s.team, s.id, powerEligible, powerSelected, showFrozenBadge ? s.frozenBy : null);
             else drawToken(pos.x, pos.y, s.team, "?", false, false, null);
             return;
        }

        // 2. OFF-BOARD STATES (Inventory, Dead, Finished)
        // We calculate absolute screen coordinates for the boxes
        
        let panelIndex = 0; // 0=Inventory, 1=Dead, 2=Finished
        if (s.state === "dead") panelIndex = 1;
        if (s.state === "finished") panelIndex = 2;
        if (s.state === "inventory") panelIndex = 0;

        // BOX DIMENSIONS (Must match drawSidePanels)
        const boxWidth = PANEL_BOX_WIDTH;
        const boxHeight = PANEL_BOX_HEIGHT;

        let originX, originY;

        if (s.team === "blue") {
            // Left Side (Vertical Stack)
            originX = BLUE_PANEL_X;
            originY = BLUE_PANEL_Y + (panelIndex * (boxHeight + PANEL_GAP));
        } else if (s.team === "yellow") {
            // Right Side (Vertical Stack)
            originX = YELLOW_PANEL_X;
            originY = YELLOW_PANEL_Y + (panelIndex * (boxHeight + PANEL_GAP));
        } else if (s.team === "green") {
            // Top Side (Horizontal Stack)
            originX = GREEN_PANEL_X + (panelIndex * (boxWidth + PANEL_GAP));
            originY = GREEN_PANEL_Y;
        } else {
            // Bottom Side (Horizontal Stack)
            originX = RED_PANEL_X + (panelIndex * (boxWidth + PANEL_GAP));
            originY = RED_PANEL_Y;
        }

        // Place token inside the box (Simple row/col packing)
        // We use the ID to stagger them so they don't overlap perfectly
        // E.g. IDs 1-3 in row 1, IDs 4-5 in row 2
        const localCol = (s.id - 1) % 3; 
        const localRow = Math.floor((s.id - 1) / 3);
        
        const tokenX = originX + TOKEN_PAD_X + (localCol * TOKEN_SPACING);
        const tokenY = originY + TOKEN_PAD_Y + (localRow * TOKEN_SPACING);

        const offboardVisible = s.team === viewerTeam;
        const drawType = offboardVisible ? s.team : "unknown";
        const drawLabel = offboardVisible ? s.id : "?";

        // Draw off-board token (enemy identities stay hidden).
        drawTokenAtScreen(tokenX, tokenY, drawType, drawLabel, false, false, null);

        if (resurrectionEligible) {
            const glowByTeam = {
                blue: "#8fd1ff",
                red: "#ff8a8a",
                yellow: "#ffe08a",
                green: "#9ae6a4"
            };
            drawGlowHalo(tokenX, tokenY, glowByTeam[s.team] || "#d29922", 14);
        }

        // Selection Highlight (Only for Inventory)
        const isInventorySelected =
            s.state === "inventory" && s.id === selectedInventoryId && s.team === selectedInventoryTeam;
        const isDeadSelected =
            s.state === "dead" && s.id === selectedDeadId && s.team === selectedDeadTeam;

        if (isInventorySelected || isDeadSelected) {
            ctx.save();
            ctx.strokeStyle = COLORS.highlight;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(tokenX + CELL_SIZE/2, tokenY + CELL_SIZE/2, CELL_SIZE*0.45, 0, Math.PI*2);
            ctx.stroke();
            ctx.restore();
        }
    });
}

// Helper for raw screen coords
function drawTokenAtScreen(x, y, type, label, powerEligible = false, powerSelected = false, frozenBy = null) {
    drawToken(x, y, type, label, powerEligible, powerSelected, frozenBy);
}


function drawToken(screenX, screenY, type, label, powerEligible = false, powerSelected = false, frozenBy = null) {
    const cx = screenX + (CELL_SIZE / 2);
    const cy = screenY + (CELL_SIZE / 2);
    const radius = CELL_SIZE * 0.35;

    ctx.save();
    if (powerEligible && (type === "blue" || type === "red" || type === "yellow" || type === "green")) {
        ctx.shadowColor = powerSelected
            ? "#2ea043"
            : (type === "blue" ? "#8fd1ff" :
               type === "red" ? "#ff8a8a" :
               type === "yellow" ? "#ffe08a" : "#9ae6a4");
        ctx.shadowBlur = powerSelected ? 24 : 16;
        ctx.shadowOffsetY = 0;
    } else {
        ctx.shadowColor = COLORS.shadow;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
    }
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    
    if (type === "blue") {
        ctx.fillStyle = powerEligible ? "#82c6ff" : COLORS.blue;
    } else if (type === "red") {
        ctx.fillStyle = powerEligible ? "#ff736a" : COLORS.red;
    } else if (type === "yellow") {
        ctx.fillStyle = powerEligible ? "#ffeaa8" : COLORS.yellow;
    } else if (type === "green") {
        ctx.fillStyle = powerEligible ? "#89db95" : COLORS.green;
    }
    else ctx.fillStyle = COLORS.unknown;
    
    ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy + 1);

    if (frozenBy && frozenBy.team) {
        drawFrozenBadge(screenX, screenY, frozenBy.team);
    }
    ctx.restore();
}

function drawFrozenBadge(screenX, screenY, freezerTeam) {
    const badgeR = 10;
    const cx = screenX + CELL_SIZE * 0.78;
    const cy = screenY + CELL_SIZE * 0.23;
    const fill = COLORS[freezerTeam] || COLORS.unknown;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("F", cx, cy + 0.5);
    ctx.restore();
}

function drawGlowHalo(screenX, screenY, color, blur = 14) {
    const cx = screenX + (CELL_SIZE / 2);
    const cy = screenY + (CELL_SIZE / 2);
    const radius = CELL_SIZE * 0.42;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.stroke();

    // Soft outer bloom
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(color, 0.55);
    ctx.lineWidth = 2;
    ctx.shadowBlur = blur + 4;
    ctx.stroke();
    ctx.restore();
}

function shouldShowFrozenBadge(soldier, allSoldiers) {
    if (!soldier || !soldier.frozenBy) return false;
    if (soldier.state !== "board") return false;

    // Engine rule: lone soldier is never frozen.
    const activeTeamCount = allSoldiers.filter(
        o => o.team === soldier.team && (o.state === "board" || o.state === "start")
    ).length;
    if (activeTeamCount <= 1) return false;

    return true;
}

function drawSelectionRing(soldiers, selectedId, team) {
    const soldier = soldiers.find(s => s.id === selectedId && s.team === team);
    if (!soldier || soldier.state !== "board") return;

    const pos = gameToCanvas(soldier.x, soldier.y);
    const cx = pos.x + (CELL_SIZE / 2);
    const cy = pos.y + (CELL_SIZE / 2);
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, CELL_SIZE * 0.45, 0, Math.PI * 2); 
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.highlight; 
    ctx.stroke();
    ctx.restore();
}

function drawPowerHighlights(soldiers, candidateIds, team, selectedPowerId) {
}

function drawBarricadeEdgePreview(soldiers, team, selectedPowerId, hoverEdge) {
    const soldier = soldiers.find(s =>
        s.team === team &&
        s.id === selectedPowerId &&
        s.state === "board"
    );
    if (!soldier) return;

    const pos = gameToCanvas(soldier.x, soldier.y);
    const lineInset = 2;
    const teamColor = {
        blue: "#8fd1ff",
        red: "#ff8a8a",
        yellow: "#ffe08a",
        green: "#9ae6a4"
    };
    const color = teamColor[team] || "#d29922";
    const segments = [];

    if (hoverEdge.edge === "top" || hoverEdge.edge === "bottom") {
        for (let dx = -1; dx <= 1; dx++) {
            const ex = soldier.x + dx;
            const ey = soldier.y;
            if (ex < 0 || ex >= 12 || ey < 0 || ey >= 12) continue;

            const cellPos = gameToCanvas(ex, ey);
            const y = hoverEdge.edge === "top"
                ? cellPos.y + lineInset
                : cellPos.y + CELL_SIZE - lineInset;
            segments.push({
                sx: cellPos.x,
                sy: y,
                ex: cellPos.x + CELL_SIZE,
                ey: y
            });
        }
    } else {
        for (let dy = -1; dy <= 1; dy++) {
            const ex = soldier.x;
            const ey = soldier.y + dy;
            if (ex < 0 || ex >= 12 || ey < 0 || ey >= 12) continue;

            const cellPos = gameToCanvas(ex, ey);
            const x = hoverEdge.edge === "left"
                ? cellPos.x + lineInset
                : cellPos.x + CELL_SIZE - lineInset;
            segments.push({
                sx: x,
                sy: cellPos.y,
                ex: x,
                ey: cellPos.y + CELL_SIZE
            });
        }
    }

    if (segments.length === 0) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    segments.forEach((seg) => {
        ctx.beginPath();
        ctx.moveTo(seg.sx, seg.sy);
        ctx.lineTo(seg.ex, seg.ey);
        ctx.stroke();
    });
    ctx.restore();
}

function drawGunLaserPreview(soldiers, team, selectedPowerId, powerAim) {
    const shooter = soldiers.find(s =>
        s.team === team &&
        s.id === selectedPowerId &&
        s.state === "board"
    );
    if (!shooter || !powerAim || !Array.isArray(powerAim.ray) || powerAim.ray.length === 0) return;

    const laserColorByTeam = {
        blue: "rgba(88, 166, 255, 0.55)",
        red: "rgba(248, 81, 73, 0.55)",
        yellow: "rgba(242, 204, 96, 0.55)",
        green: "rgba(63, 185, 80, 0.55)"
    };
    const laserGlowByTeam = {
        blue: "rgba(88, 166, 255, 0.45)",
        red: "rgba(248, 81, 73, 0.45)",
        yellow: "rgba(242, 204, 96, 0.45)",
        green: "rgba(63, 185, 80, 0.45)"
    };
    const laserColor = laserColorByTeam[team] || "rgba(210, 153, 34, 0.55)";
    const laserGlow = laserGlowByTeam[team] || "rgba(210, 153, 34, 0.45)";
    const from = gameToCanvas(shooter.x, shooter.y);
    const lastCell = powerAim.ray[powerAim.ray.length - 1];
    const to = gameToCanvas(lastCell.x, lastCell.y);

    let startX = from.x + CELL_SIZE / 2;
    let startY = from.y + CELL_SIZE / 2;
    let endX = to.x + CELL_SIZE / 2;
    let endY = to.y + CELL_SIZE / 2;

    if (powerAim.direction === "up") {
        startY = from.y;
        endY = to.y;
    } else if (powerAim.direction === "down") {
        startY = from.y + CELL_SIZE;
        endY = to.y + CELL_SIZE;
    } else if (powerAim.direction === "left") {
        startX = from.x;
        endX = to.x;
    } else if (powerAim.direction === "right") {
        startX = from.x + CELL_SIZE;
        endX = to.x + CELL_SIZE;
    }

    ctx.save();
    ctx.strokeStyle = laserColor;
    ctx.lineWidth = 4;
    ctx.shadowColor = laserGlow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
}

function drawNukeLaserPreview(soldiers, team, selectedPowerId, powerAim) {
    const shooter = soldiers.find(s =>
        s.team === team &&
        s.id === selectedPowerId &&
        s.state === "board"
    );
    if (!shooter || !powerAim || !Array.isArray(powerAim.rays)) return;

    const laserColorByTeam = {
        blue: "rgba(88, 166, 255, 0.45)",
        red: "rgba(248, 81, 73, 0.45)",
        yellow: "rgba(242, 204, 96, 0.45)",
        green: "rgba(63, 185, 80, 0.45)"
    };
    const laserGlowByTeam = {
        blue: "rgba(88, 166, 255, 0.35)",
        red: "rgba(248, 81, 73, 0.35)",
        yellow: "rgba(242, 204, 96, 0.35)",
        green: "rgba(63, 185, 80, 0.35)"
    };
    const laserColor = laserColorByTeam[team] || "rgba(210, 153, 34, 0.45)";
    const laserGlow = laserGlowByTeam[team] || "rgba(210, 153, 34, 0.35)";

    ctx.save();
    ctx.strokeStyle = laserColor;
    ctx.lineWidth = 4;
    ctx.shadowColor = laserGlow;
    ctx.shadowBlur = 8;

    powerAim.rays.forEach((ray) => {
        if (!ray || !Array.isArray(ray.cells) || ray.cells.length === 0) return;

        const originPos = gameToCanvas(ray.originX, ray.originY);
        const lastCell = ray.cells[ray.cells.length - 1];
        const lastPos = gameToCanvas(lastCell.x, lastCell.y);

        let startX = originPos.x + CELL_SIZE / 2;
        let startY = originPos.y + CELL_SIZE / 2;
        let endX = lastPos.x + CELL_SIZE / 2;
        let endY = lastPos.y + CELL_SIZE / 2;

        if (ray.direction === "up") {
            startY = originPos.y;
            endY = lastPos.y;
        } else if (ray.direction === "down") {
            startY = originPos.y + CELL_SIZE;
            endY = lastPos.y + CELL_SIZE;
        } else if (ray.direction === "left") {
            startX = originPos.x;
            endX = lastPos.x;
        } else if (ray.direction === "right") {
            startX = originPos.x + CELL_SIZE;
            endX = lastPos.x + CELL_SIZE;
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    });

    ctx.restore();
}

function drawBarricades() {
    if (typeof barricades === "undefined" || !Array.isArray(barricades)) return;

    barricades.forEach((b) => {
        if (!b || !b.orientation || !b.direction) return;

        const ownerTeam = b.owner && b.owner.team ? b.owner.team : null;
        const colorByTeam = {
            blue: "#8fd1ff",
            red: "#ff8a8a",
            yellow: "#ffe08a",
            green: "#9ae6a4"
        };
        const color = colorByTeam[ownerTeam] || "#d29922";
        const lineInset = 2;

        if (b.orientation === "vertical") {
            const edgeX = b.direction === "forward" ? b.x + 1 : b.x;
            const yMin = Math.max(0, b.y - 1);
            const yMax = Math.min(11, b.y + 1);
            if (edgeX < 0 || edgeX > 11 || yMin > yMax) return;

            const topCell = gameToCanvas(edgeX, yMax);
            const bottomCell = gameToCanvas(edgeX, yMin);
            const x = topCell.x + lineInset;
            const y1 = topCell.y;
            const y2 = bottomCell.y + CELL_SIZE;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 6;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
            ctx.stroke();
            ctx.restore();
            return;
        }

        if (b.orientation === "horizontal") {
            const edgeY = b.direction === "forward" ? b.y + 1 : b.y;
            const xMin = Math.max(0, b.x - 1);
            const xMax = Math.min(11, b.x + 1);
            if (edgeY < 0 || edgeY > 11 || xMin > xMax) return;

            const leftCell = gameToCanvas(xMin, edgeY);
            const rightCell = gameToCanvas(xMax, edgeY);
            const y = leftCell.y + CELL_SIZE - lineInset;
            const x1 = leftCell.x;
            const x2 = rightCell.x + CELL_SIZE;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 6;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            ctx.stroke();
            ctx.restore();
        }
    });
}

function syncFreezeFlashEvents(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.soldiers)) return;
    const now = Date.now();

    // Keep only active events.
    for (let i = freezeFlashEvents.length - 1; i >= 0; i--) {
        if (now - freezeFlashEvents[i].startedAt > FREEZE_FLASH_MS) {
            freezeFlashEvents.splice(i, 1);
        }
    }

    snapshot.soldiers.forEach((s) => {
        if (s.id !== 4 || s.state !== "board") return;
        const key = `${s.team}:4`;
        const prev = previousId4PowerUsed.get(key) === true;
        const current = s.powerUsed === true;

        if (!prev && current) {
            freezeFlashEvents.push({
                team: s.team,
                x: s.x,
                y: s.y,
                startedAt: now
            });
        }
        previousId4PowerUsed.set(key, current);
    });
}

function drawFreezeFlashes() {
    const now = Date.now();

    freezeFlashEvents.forEach((ev) => {
        const elapsed = now - ev.startedAt;
        if (elapsed < 0 || elapsed > FREEZE_FLASH_MS) return;

        const t = elapsed / FREEZE_FLASH_MS;
        const alpha = 0.55 * (1 - t);
        if (alpha <= 0) return;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = ev.x + dx;
                const y = ev.y + dy;
                if (x < 0 || x >= RENDER_BOARD_SIZE || y < 0 || y >= RENDER_BOARD_SIZE) continue;

                const cell = gameToCanvas(x, y);
                ctx.save();
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
                ctx.fillRect(cell.x, cell.y, CELL_SIZE, CELL_SIZE);
                ctx.restore();
            }
        }
    });
}

function buildRayCells(originX, originY, direction) {
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
        if (nx < 0 || nx >= RENDER_BOARD_SIZE || ny < 0 || ny >= RENDER_BOARD_SIZE) break;
        if (typeof gunBlocked === "function" && gunBlocked(x, y, nx, ny)) break;
        x = nx;
        y = ny;
        cells.push({ x, y });
    }
    return cells;
}

function syncPowerFlashEvents(snapshot) {
    const now = Date.now();

    for (let i = powerLaserFlashEvents.length - 1; i >= 0; i--) {
        if (now - powerLaserFlashEvents[i].startedAt > POWER_FLASH_MS) {
            powerLaserFlashEvents.splice(i, 1);
        }
    }

    if (!snapshot || !Array.isArray(snapshot.powerFlashEvents)) return;

    // New game/reset guard: if sequence restarted, clear renderer-side trackers.
    if (
        snapshot.powerFlashEvents.length > 0 &&
        typeof snapshot.powerFlashEvents[snapshot.powerFlashEvents.length - 1].seq === "number" &&
        snapshot.powerFlashEvents[snapshot.powerFlashEvents.length - 1].seq < lastPowerFlashSeq
    ) {
        lastPowerFlashSeq = 0;
        powerLaserFlashEvents.length = 0;
    }

    snapshot.powerFlashEvents.forEach((ev) => {
        if (!ev || typeof ev.seq !== "number" || ev.seq <= lastPowerFlashSeq) return;
        lastPowerFlashSeq = ev.seq;

        if (ev.kind === "gun" && typeof ev.x === "number" && typeof ev.y === "number" && typeof ev.direction === "string") {
            const ray = buildRayCells(ev.x, ev.y, ev.direction);
            powerLaserFlashEvents.push({
                kind: "gun",
                team: ev.team || "blue",
                direction: ev.direction,
                originX: ev.x,
                originY: ev.y,
                cells: ray,
                startedAt: now
            });
            return;
        }

        if (ev.kind === "nuke" && typeof ev.x === "number" && typeof ev.y === "number" && typeof ev.orientation === "string") {
            const rays = [];
            if (ev.orientation === "vertical") {
                for (let dx = -1; dx <= 1; dx++) {
                    const ox = ev.x + dx;
                    const oy = ev.y;
                    if (ox < 0 || ox >= RENDER_BOARD_SIZE || oy < 0 || oy >= RENDER_BOARD_SIZE) continue;
                    rays.push({ originX: ox, originY: oy, direction: "up", cells: buildRayCells(ox, oy, "up") });
                    rays.push({ originX: ox, originY: oy, direction: "down", cells: buildRayCells(ox, oy, "down") });
                }
            } else if (ev.orientation === "horizontal") {
                for (let dy = -1; dy <= 1; dy++) {
                    const ox = ev.x;
                    const oy = ev.y + dy;
                    if (ox < 0 || ox >= RENDER_BOARD_SIZE || oy < 0 || oy >= RENDER_BOARD_SIZE) continue;
                    rays.push({ originX: ox, originY: oy, direction: "left", cells: buildRayCells(ox, oy, "left") });
                    rays.push({ originX: ox, originY: oy, direction: "right", cells: buildRayCells(ox, oy, "right") });
                }
            }
            powerLaserFlashEvents.push({
                kind: "nuke",
                team: ev.team || "blue",
                rays,
                startedAt: now
            });
        }
    });
}

function drawRayLine(originX, originY, direction, cells, strokeStyle, shadowStyle) {
    if (!Array.isArray(cells) || cells.length === 0) return;

    const originPos = gameToCanvas(originX, originY);
    const lastCell = cells[cells.length - 1];
    const lastPos = gameToCanvas(lastCell.x, lastCell.y);

    let startX = originPos.x + CELL_SIZE / 2;
    let startY = originPos.y + CELL_SIZE / 2;
    let endX = lastPos.x + CELL_SIZE / 2;
    let endY = lastPos.y + CELL_SIZE / 2;

    if (direction === "up") {
        startY = originPos.y;
        endY = lastPos.y;
    } else if (direction === "down") {
        startY = originPos.y + CELL_SIZE;
        endY = lastPos.y + CELL_SIZE;
    } else if (direction === "left") {
        startX = originPos.x;
        endX = lastPos.x;
    } else if (direction === "right") {
        startX = originPos.x + CELL_SIZE;
        endX = lastPos.x + CELL_SIZE;
    }

    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 4;
    ctx.shadowColor = shadowStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
}

function drawPowerFlashes() {
    const now = Date.now();

    powerLaserFlashEvents.forEach((ev) => {
        const elapsed = now - ev.startedAt;
        if (elapsed < 0 || elapsed > POWER_FLASH_MS) return;

        const t = elapsed / POWER_FLASH_MS;
        const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 6));
        const strokeAlpha = Math.min(0.9, 0.25 + (0.55 * pulse));
        const glowAlpha = Math.min(0.8, 0.2 + (0.45 * pulse));
        const strokeByTeam = {
            blue: `rgba(88, 166, 255, ${strokeAlpha.toFixed(3)})`,
            red: `rgba(248, 81, 73, ${strokeAlpha.toFixed(3)})`,
            yellow: `rgba(242, 204, 96, ${strokeAlpha.toFixed(3)})`,
            green: `rgba(63, 185, 80, ${strokeAlpha.toFixed(3)})`
        };
        const shadowByTeam = {
            blue: `rgba(88, 166, 255, ${glowAlpha.toFixed(3)})`,
            red: `rgba(248, 81, 73, ${glowAlpha.toFixed(3)})`,
            yellow: `rgba(242, 204, 96, ${glowAlpha.toFixed(3)})`,
            green: `rgba(63, 185, 80, ${glowAlpha.toFixed(3)})`
        };
        const strokeStyle = strokeByTeam[ev.team] || `rgba(210, 153, 34, ${strokeAlpha.toFixed(3)})`;
        const shadowStyle = shadowByTeam[ev.team] || `rgba(210, 153, 34, ${glowAlpha.toFixed(3)})`;

        if (ev.kind === "gun") {
            drawRayLine(ev.originX, ev.originY, ev.direction, ev.cells, strokeStyle, shadowStyle);
            return;
        }

        if (ev.kind === "nuke" && Array.isArray(ev.rays)) {
            ev.rays.forEach((ray) => {
                drawRayLine(ray.originX, ray.originY, ray.direction, ray.cells, strokeStyle, shadowStyle);
            });
        }
    });
}

function drawFreezeDecisionTimer(snapshot) {
    if (!snapshot || !snapshot.freezeDecision) return;
    const timer = snapshot.freezeDecision;
    if (typeof timer.x !== "number" || typeof timer.y !== "number") return;
    if (typeof timer.remainingMs !== "number" || timer.remainingMs <= 0) return;

    const pos = gameToCanvas(timer.x, timer.y);
    const secs = Math.ceil(timer.remainingMs / 1000);
    const bx = pos.x + 4;
    const by = pos.y + 4;
    const bw = 18;
    const bh = 16;

    ctx.save();
    ctx.fillStyle = "rgba(13, 17, 23, 0.92)";
    ctx.strokeStyle = "rgba(255, 210, 120, 0.95)";
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(secs), bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
}

function scheduleFreezeAnimationFrame() {
    if (freezeFlashEvents.length === 0 && powerLaserFlashEvents.length === 0) return;
    if (freezeAnimRaf !== null) return;

    freezeAnimRaf = requestAnimationFrame(() => {
        freezeAnimRaf = null;
        if (freezeFlashEvents.length === 0 && powerLaserFlashEvents.length === 0) return;
        if (typeof updateUI === "function") updateUI();
    });
}

function drawTargetHighlights(targets) {
    targets.forEach(target => {
        const pos = gameToCanvas(target.x, target.y);
        const cx = pos.x + (CELL_SIZE / 2);
        const cy = pos.y + (CELL_SIZE / 2);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, CELL_SIZE * 0.15, 0, Math.PI * 2); // Small dot
        ctx.fillStyle = COLORS.target; 
        ctx.fill();
        ctx.restore();
    });
}



function drawPlacementGhost(team, id, lane) {
    let ex, ey;
    
    // Map Lane + Team to specific start zone coordinate
    if (team === "blue") {
        ex = -1; // Left Start Zone
        ey = lane;
    } else if (team === "yellow") {
        ex = 12; // Right Start Zone
        ey = lane;
    } else if (team === "red") {
        ex = lane;
        ey = -1; // Bottom Start Zone
    } else {
        ex = lane;
        ey = 12; // Top Start Zone
    }

    const pos = gameToCanvas(ex, ey);
    
    ctx.save();
    ctx.globalAlpha = 0.5; // Neutral Ghost
    drawToken(pos.x, pos.y, team, id);
    ctx.restore();
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
