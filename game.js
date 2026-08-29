"use strict";

// === Developer / debug tuning constants ===
const CONFIG = Object.freeze({
  BOARD_SIZE: 20,
  HAND_SIZE: 5,
  REGISTER_MIN: -8,
  REGISTER_MAX: 7,
  EXECUTION_LIMIT: 5,
  LOG_LIMIT: 10,
  ANIMATION_MS: 360
});
const REGISTERS = ["R0", "R1", "R2", "R3"];
const PLAYER_COLORS = ["#ff637d", "#52d9ff", "#ffd45b", "#a77bff"];

// === Game state ===
let gameState = null;
let registerHighlights = new Set();
const $ = selector => document.querySelector(selector);

// === Secret objectives ===
const OBJECTIVE_POOL = [
  { description: "R0 = 5", check: r => r.R0 === 5 },
  { description: "R1 = -3", check: r => r.R1 === -3 },
  { description: "R2 = 6", check: r => r.R2 === 6 },
  { description: "R3 = 7", check: r => r.R3 === 7 },
  { description: "R0 < 0", check: r => r.R0 < 0 },
  { description: "R1 > 3", check: r => r.R1 > 3 },
  { description: "R2 = R3 (and neither is 0)", check: r => r.R2 === r.R3 && r.R2 !== 0 },
  { description: "R0 = R1 (and neither is 0)", check: r => r.R0 === r.R1 && r.R0 !== 0 },
  { description: "R0 + R1 = 5", check: r => r.R0 + r.R1 === 5 },
  { description: "R2 + R3 = -4", check: r => r.R2 + r.R3 === -4 },
  { description: "Exactly two registers are 0", check: r => Object.values(r).filter(v => v === 0).length === 2 },
  { description: "All registers are non-negative, with at least one positive", check: r => Object.values(r).every(v => v >= 0) && Object.values(r).some(v => v > 0) },
  { description: "All four registers contain different values", check: r => new Set(Object.values(r)).size === 4 },
  { description: "R0 < R1", check: r => r.R0 < r.R1 },
  { description: "R2 > R3", check: r => r.R2 > r.R3 },
  { description: "R0 = -R1 (and neither is 0)", check: r => r.R0 === -r.R1 && r.R0 !== 0 },
  { description: "The sum of all registers is 0, but not all are 0", check: r => Object.values(r).reduce((a, b) => a + b, 0) === 0 && Object.values(r).some(v => v !== 0) },
  { description: "Exactly one register is negative", check: r => Object.values(r).filter(v => v < 0).length === 1 },
  { description: "Exactly three registers are positive", check: r => Object.values(r).filter(v => v > 0).length === 3 }
];

function generateObjective(available) {
  const index = Math.floor(Math.random() * available.length);
  return available.splice(index, 1)[0];
}

// === Setup and card generation ===
function createGame(playerCount) {
  const objectives = [...OBJECTIVE_POOL];
  gameState = {
    players: [], currentPlayerIndex: 0,
    registers: { R0: 0, R1: 0, R2: 0, R3: 0 },
    board: Array(CONFIG.BOARD_SIZE).fill(null),
    turnPhase: "handoff", selectedCardIndex: null, placedTile: null,
    log: ["Shared CPU initialized. All registers set to 0."], gameOver: false
  };
  for (let i = 0; i < playerCount; i += 1) {
    gameState.players.push({
      id: i + 1, name: `Player ${i + 1}`, color: PLAYER_COLORS[i],
      pc: Math.floor(i * CONFIG.BOARD_SIZE / playerCount),
      hand: Array.from({ length: CONFIG.HAND_SIZE }, generateInstruction),
      objective: generateObjective(objectives)
    });
  }
  $("#setup-overlay").classList.add("hidden");
  buildBoard();
  renderGame();
  showPassScreen();
}

function randomRegister() { return REGISTERS[Math.floor(Math.random() * REGISTERS.length)]; }
function randomNonZero(min, max) { let n = 0; while (n === 0) n = min + Math.floor(Math.random() * (max - min + 1)); return n; }
function signed(value) { return value > 0 ? `+${value}` : String(value); }

function generateInstruction() {
  const opcodes = ["MOVE", "ADD", "SUB", "INC", "DEC", "NEG", "CLR", "SWAP", "BRA"];
  const opcode = opcodes[Math.floor(Math.random() * opcodes.length)];
  if (["MOVE", "ADD", "SUB"].includes(opcode)) {
    const value = randomNonZero(-5, 5), register = randomRegister();
    return { opcode, register, value, display: `${opcode} #${value}, ${register}` };
  }
  if (["INC", "DEC", "NEG", "CLR"].includes(opcode)) {
    const register = randomRegister(); return { opcode, register, display: `${opcode} ${register}` };
  }
  if (opcode === "SWAP") {
    const registerA = randomRegister(); let registerB = randomRegister();
    while (registerB === registerA) registerB = randomRegister();
    return { opcode, registerA, registerB, display: `SWAP ${registerA}, ${registerB}` };
  }
  const offset = randomNonZero(-3, 3);
  return { opcode, offset, display: `BRA ${signed(offset)}` };
}

// === Board generation and rendering ===
function tileGridPosition(index) {
  if (index < 6) return [1, index + 1];
  if (index < 11) return [index - 4, 6];
  if (index < 16) return [6, 16 - index];
  return [21 - index, 1];
}

function buildBoard() {
  $("#board").querySelectorAll(".tile").forEach(tile => tile.remove());
  for (let i = 0; i < CONFIG.BOARD_SIZE; i += 1) {
    const tile = document.createElement("button");
    const [row, column] = tileGridPosition(i);
    tile.type = "button"; tile.className = "tile"; tile.dataset.index = i;
    tile.style.gridArea = `${row} / ${column}`;
    tile.addEventListener("click", () => placeInstruction(i));
    $("#board").appendChild(tile);
  }
}

function renderGame() { if (!gameState) return; renderBoard(); renderSharedCPU(); renderPlayerPanel(); renderActionLog(); }

function renderBoard() {
  document.querySelectorAll(".tile").forEach((tile, index) => {
    const instruction = gameState.board[index];
    const occupants = gameState.players.filter(player => player.pc === index);
    tile.classList.toggle("empty", !instruction);
    tile.classList.toggle("selected-target", gameState.placedTile === index);
    tile.disabled = gameState.turnPhase !== "placement" || gameState.selectedCardIndex === null;
    tile.setAttribute("aria-label", `Tile ${index}: ${instruction ? instruction.display : "empty"}. ${occupants.map(p => p.name).join(", ")}`);
    tile.innerHTML = `<span class="tile-number">MEM ${String(index).padStart(2, "0")}</span><span class="tile-instruction">${instruction ? instruction.display : "— NOP —"}</span><span class="tokens">${occupants.map(p => `<i class="token" title="${p.name}" style="background:${p.color};color:${p.color}"><span>${p.id}</span></i>`).join("")}</span>`;
  });
}

function formatRegister(value) { return value > 0 ? `+${value}` : String(value); }
function renderSharedCPU() {
  $("#registers").innerHTML = REGISTERS.map(register => `<div class="register ${registerHighlights.has(register) ? "changed" : ""}" data-register="${register}"><span class="register-name">${register}</span><span class="register-value">${formatRegister(gameState.registers[register])}</span></div>`).join("");
}

function renderPlayerPanel() {
  const panel = $("#private-panel"), player = gameState.players[gameState.currentPlayerIndex];
  const privateVisible = ["placement", "ready", "executing"].includes(gameState.turnPhase) && !gameState.gameOver;
  panel.classList.toggle("private-hidden", !privateVisible);
  if (!privateVisible) return;
  $("#current-player").textContent = `${player.name} // PC ${String(player.pc).padStart(2, "0")}`;
  $("#current-player").style.color = player.color;
  $("#objective-text").textContent = player.objective.description;
  $("#phase-badge").textContent = gameState.turnPhase === "placement" ? "PLACE 1 CARD" : gameState.turnPhase.toUpperCase();
  $("#turn-hint").textContent = gameState.turnPhase === "placement" ? (gameState.selectedCardIndex === null ? "Select one card, then choose any memory slot." : "Instruction selected. Now choose a board tile.") : gameState.turnPhase === "ready" ? `Instruction installed on tile ${gameState.placedTile}. Run the CPU.` : "CPU executing...";
  renderHand();
  $("#run-turn").disabled = gameState.turnPhase !== "ready";
}

function renderHand() {
  const player = gameState.players[gameState.currentPlayerIndex];
  $("#hand").innerHTML = player.hand.map((card, index) => `<button type="button" class="card ${gameState.selectedCardIndex === index ? "selected" : ""}" data-card="${index}" ${gameState.turnPhase !== "placement" ? "disabled" : ""}>${card.display}</button>`).join("");
  $("#hand").querySelectorAll(".card").forEach(button => button.addEventListener("click", () => selectCard(Number(button.dataset.card))));
}

// === Card placement ===
function selectCard(index) {
  if (gameState.turnPhase !== "placement") return;
  gameState.selectedCardIndex = index; renderGame();
}
function placeInstruction(tileIndex) {
  if (gameState.turnPhase !== "placement" || gameState.selectedCardIndex === null) return;
  const player = gameState.players[gameState.currentPlayerIndex];
  const [card] = player.hand.splice(gameState.selectedCardIndex, 1);
  gameState.board[tileIndex] = card;
  player.hand.push(generateInstruction());
  gameState.selectedCardIndex = null; gameState.placedTile = tileIndex; gameState.turnPhase = "ready";
  addLog(`${player.name} placed ${card.display} on tile ${tileIndex}.`); renderGame();
}

// === Turn handling and instruction execution ===
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runTurn() {
  if (gameState.turnPhase !== "ready" || gameState.gameOver) return;
  gameState.turnPhase = "executing"; renderGame();
  const player = gameState.players[gameState.currentPlayerIndex];
  movePC(player, 1, `${player.name} advanced`);
  renderGame(); await pause(CONFIG.ANIMATION_MS);
  let executed = 0, continueExecution = true;
  while (continueExecution && executed < CONFIG.EXECUTION_LIMIT) {
    executed += 1;
    const tileIndex = player.pc, instruction = gameState.board[tileIndex];
    flashTile(tileIndex);
    if (!instruction) { addLog(`Tile ${tileIndex} was empty. NOP.`); continueExecution = false; }
    else { addLog(`Executed ${instruction.display}.`); continueExecution = executeInstruction(instruction, player); }
    renderGame(); await pause(CONFIG.ANIMATION_MS);
  }
  if (continueExecution && executed === CONFIG.EXECUTION_LIMIT) addLog("Execution limit reached. CPU timeslice ended.");
  if (checkObjective(player)) { showVictory(player); return; }
  addLog(`${player.name}'s objective was not completed.`); endTurn();
}

function executeInstruction(instruction, player) {
  const { opcode } = instruction;
  if (opcode === "BRA") { movePC(player, instruction.offset, `${player.name}'s PC branched`); return true; }
  if (opcode === "SWAP") {
    const a = instruction.registerA, b = instruction.registerB;
    const oldA = gameState.registers[a], oldB = gameState.registers[b];
    setRegister(a, oldB); setRegister(b, oldA); return false;
  }
  const register = instruction.register, current = gameState.registers[register];
  const operations = {
    MOVE: () => instruction.value, ADD: () => current + instruction.value,
    SUB: () => current - instruction.value, INC: () => current + 1,
    DEC: () => current - 1, NEG: () => -current, CLR: () => 0
  };
  setRegister(register, operations[opcode]()); return false;
}

function movePC(player, distance, label) {
  const oldPC = player.pc;
  player.pc = ((player.pc + distance) % CONFIG.BOARD_SIZE + CONFIG.BOARD_SIZE) % CONFIG.BOARD_SIZE;
  addLog(`${label} from tile ${oldPC} to tile ${player.pc}.`);
}
function normalizeRegister(value) {
  const range = CONFIG.REGISTER_MAX - CONFIG.REGISTER_MIN + 1;
  return ((value - CONFIG.REGISTER_MIN) % range + range) % range + CONFIG.REGISTER_MIN;
}
function setRegister(register, rawValue) {
  const oldValue = gameState.registers[register], newValue = normalizeRegister(rawValue);
  gameState.registers[register] = newValue;
  if (oldValue !== newValue) {
    registerHighlights.add(register);
    addLog(`Shared ${register} changed from ${oldValue} to ${newValue}.`);
    setTimeout(() => { registerHighlights.delete(register); renderSharedCPU(); }, 800);
  }
}
function flashTile(index) {
  const tile = document.querySelector(`.tile[data-index="${index}"]`);
  if (tile) { tile.classList.add("executing"); setTimeout(() => tile.classList.remove("executing"), 600); }
}
function checkObjective(player) { return player.objective.check(gameState.registers); }

function endTurn() {
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  gameState.turnPhase = "handoff"; gameState.selectedCardIndex = null; gameState.placedTile = null;
  renderGame(); showPassScreen();
}
function showPassScreen() {
  const player = gameState.players[gameState.currentPlayerIndex];
  gameState.turnPhase = "handoff"; renderGame();
  $("#pass-title").textContent = `Pass the computer to ${player.name}`;
  $("#start-turn").textContent = `START ${player.name.toUpperCase()} TURN`;
  $("#pass-overlay").classList.remove("hidden");
}
function startPlayerTurn() {
  if (!gameState || gameState.gameOver) return;
  $("#pass-overlay").classList.add("hidden"); gameState.turnPhase = "placement";
  addLog(`${gameState.players[gameState.currentPlayerIndex].name} began their turn.`); renderGame();
}
function showVictory(player) {
  gameState.gameOver = true; gameState.turnPhase = "victory";
  addLog(`${player.name} completed their objective and won!`); renderGame();
  $("#victory-title").textContent = `${player.name} wins!`;
  $("#victory-title").style.color = player.color;
  $("#victory-objective").textContent = `Completed: ${player.objective.description}`;
  $("#victory-overlay").classList.remove("hidden");
}

// === Public action log ===
function addLog(message) { gameState.log.unshift(message); gameState.log = gameState.log.slice(0, CONFIG.LOG_LIMIT); }
function renderActionLog() { $("#action-log").innerHTML = gameState.log.map(entry => `<li>${entry}</li>`).join(""); }

// === UI events ===
$("#create-game").addEventListener("click", () => createGame(Number(document.querySelector('input[name="player-count"]:checked').value)));
$("#start-turn").addEventListener("click", startPlayerTurn);
$("#run-turn").addEventListener("click", runTurn);
$("#new-game").addEventListener("click", () => window.location.reload());

// Small test/debug surface; gameplay does not depend on it.
window.AssemblyGame = { CONFIG, createGame, generateInstruction, normalizeRegister, executeInstruction, getState: () => gameState };
