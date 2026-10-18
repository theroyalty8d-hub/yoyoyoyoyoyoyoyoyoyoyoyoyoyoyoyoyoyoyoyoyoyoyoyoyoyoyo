// (Full file with modifications: mouse/crosshair and projectile interception)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 900;
canvas.height = 560;

const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const partyTemplate = [
    {
        id: 1,
        name: 'Magatank',
        x: 70,
        y: 120,
        size: 52,
        color: 'red',
        maxHp: 100,
        hp: 100,
        maxPb: 10,
        pb: 0,
        speed: 3,
        alive: true,
        defending: false,
        defendStartAt: 0,
        defendCooldownUntil: 0,
        m1Gain: 1,
        m1Damage: 8,
        defendReduction: 0.5,
        specialCost: 10,
        specialDamage: 60,
        counterChance: 1.0,
        passiveCost: 5,
        passiveDamage: 25,
        m1Cooldown: 1000,
        lastM1: 0,
        passiveBlockedUntil: 0,
        stunnedUntil: 0,
        hitFlash: 0,
        text: 'Magatank'
    },
    {
        id: 2,
        name: 'Magaknight',
        x: 70,
        y: 240,
        size: 44,
        color: 'silver',
        maxHp: 75,
        hp: 75,
        maxPb: 10,
        pb: 0,
        speed: 3.5,
        alive: true,
        defending: false,
        defendStartAt: 0,
        defendCooldownUntil: 0,
        m1Gain: 1,
        m1Damage: 10,
        defendReduction: 0.25,
        specialCost: 10,
        specialDamage: 55,
        counterChance: 0.5,
        passiveCost: 5,
        passiveDamage: 25,
        passiveBlockedUntil: 0,
        stunnedUntil: 0,
        hitFlash: 0,
        m1Cooldown: 1000,
        lastM1: 0
    },
    {
        id: 3,
        name: 'True Mage',
        x: 70,
        y: 360,
        size: 34,
        color: 'green',
        maxHp: 40,
        hp: 40,
        maxPb: 10,
        pb: 0,
        speed: 2.5,
        alive: true,
        defending: false,
        defendStartAt: 0,
        defendCooldownUntil: 0,
        m1Gain: 1,
        m1Damage: 15,
        defendReduction: 0.15,
        specialCost: 10,
        specialDamage: 70,
        counterChance: 0.25,
        passiveCost: 3,
        passiveDamage: 0,
        passiveBlockedUntil: 0,
        stunnedUntil: 0,
        hitFlash: 0,
        m1Cooldown: 1000,
        lastM1: 0
    }
];

let party = partyTemplate.map((p) => ({ ...p }));
let selectedIndex = 0;
let nextCharacterSwapAt = 0;
let keys = {};
let projectiles = [];
let telegraphs = [];
let particles = [];
let robots = [];
let messages = [];
let enemy = null;
let currentEnemyIndex = 0;
let lastFrame = performance.now();
let gameStarted = false;
let gamePaused = false;
let runStartedAt = 0;
let runFinishedAt = null;
let pauseStartedAt = 0;
let pausedDuration = 0;
let bossBreakRemainingMs = 0;
let bossBreakTimerAtStart = null;
let bossBreakDurationTotal = 0;
const gameTimeouts = new Set();
let transferPending = null;
let onlyM1Phase = false;
let holdXStartedAt = null;
let tutorialMode = true;
let enemyTimer = 0;
let attackIndex = 0;
let pauseLabel = '';
let lastShotTime = 0;

// New cursor variables for turret phase interception
let cursorX = 0;
let cursorY = 0;
let lastCursorShot = 0;
const cursorCooldown = 200; // ms between cursor shots
const parryWindowMs = 350;
const finalAttackCost = 10;
const characterSwapCooldownMs = 3000;

const enemyRoster = [
    { key: 'lightwizard', name: 'Light Wizard', hp: 100, maxHp: 100, size: 72, color: '#f5d942', damage: 7 },
    { key: 'darkwizard', name: 'Dark Wizard', hp: 200, maxHp: 200, size: 70, color: '#8a2be2', damage: 8 },
    { key: 'blitz', name: 'Blitz', hp: 400, maxHp: 400, size: 82, color: '#3f78ff', damage: 10 },
    { key: 'cyberdio', name: 'Cyber Dio', hp: 500, maxHp: 500, size: 60, color: '#09050b', damage: 5 },
    { key: 'bitbunny', name: 'Bit Bunny', hp: 700, maxHp: 700, size: 76, color: '#b5122b', damage: 10 }
];
const LEADERBOARD_STORAGE_KEY = 'ascendanceLeaderboard';
let leaderboard = loadLeaderboard();

function log(msg) {
    messages.unshift(msg);
    if (messages.length > 8) messages.pop();
}

function loadLeaderboard() {
    try {
        const saved = JSON.parse(localStorage.getItem(LEADERBOARD_STORAGE_KEY) || '[]');
        return Array.isArray(saved)
            ? saved.filter((entry) => entry && Number.isFinite(entry.timeMs) && entry.timeMs >= 0)
                .sort((a, b) => a.timeMs - b.timeMs)
                .slice(0, 5)
            : [];
    } catch {
        return [];
    }
}

function recordWinTime(timeMs) {
    leaderboard.push({ timeMs });
    leaderboard = leaderboard.slice(0, 5);
    try {
        localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard));
    } catch {
        // Keep this run's score available for the current session if storage is unavailable.
    }
}

function formatRunTime(timeMs) {
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function getRunElapsedMs() {
    if (!gameStarted) return 0;
    if (bossBreakTimerAtStart !== null) return bossBreakTimerAtStart;
    const endTime = runFinishedAt ?? (gamePaused ? pauseStartedAt : performance.now());
    return Math.max(0, endTime - runStartedAt - pausedDuration - bossBreakDurationTotal);
}

function armGameTimeout(task) {
    task.startedAt = performance.now();
    task.timerId = setTimeout(() => {
        gameTimeouts.delete(task);
        task.timerId = null;
        task.callback();
    }, task.remaining);
}
function scheduleGameTimeout(callback, delay) {
    const task = { callback, remaining: delay, startedAt: 0, timerId: null };
    gameTimeouts.add(task);
    if (!gamePaused) armGameTimeout(task);
    return task;
}

function clearGameTimeout(task) {
    if (!task) return;
    if (task.timerId !== null) clearTimeout(task.timerId);
    gameTimeouts.delete(task);
}

function pauseGameTimeouts() {
    const now = performance.now();
    for (const task of gameTimeouts) {
        if (task.timerId === null) continue;
        clearTimeout(task.timerId);
        task.remaining = Math.max(0, task.remaining - (now - task.startedAt));
        task.timerId = null;
    }
}

function resumeGameTimeouts() {
    for (const task of gameTimeouts) armGameTimeout(task);
}

function clearPendingGameTimeouts() {
    for (const task of gameTimeouts) clearGameTimeout(task);
}

function getSelectedActor() {
    return party[selectedIndex] || null;
}

function getAliveParty() {
    return party.filter((p) => p.alive);
}

function getAliveEnemy() {
    return enemy && enemy.alive ? enemy : null;
}

function resetPartyForRound() {
    party.forEach((p) => {
        p.hp = p.maxHp;
        p.pb = 0;
        p.alive = true;
        p.defending = false;
        p.defendStartAt = 0;
        p.defendCooldownUntil = 0;
        p.lastM1 = 0;
        p.passiveBlockedUntil = 0;
        p.stunnedUntil = 0;
        p.hitFlash = 0;
        p.lockedUntil = 0;
        p.parryUntil = 0;
        p.parryFlashUntil = 0;
    });
}

function spawnEnemy(index) {
    const base = enemyRoster[index];
    if (!base) { enemy = null; return; }
    enemy = {
        ...base,
        x: canvas.width - 170,
        y: canvas.height / 2 - base.size / 2,
        alive: true,
        stunnedMs: 0,
        attackClock: 0,
        phase: 'normal',
        telegraph: null,
        robotCooldown: 0,
        lastActionAt: 0,
        lockTarget: false,
        specialMode: false,
        glitchTimer: 0,
        timeStopTimer: 0,
        turretLockTimer: 0,
        canMove: true,
        createdRobots: 0,
        attackFlags: {},
        debug: 'spawned',
        // bitbunny-specific
        bitPhase: null,
        bitPhaseTimer: 0,
        bitGuns: null,
        bitFall: null,
        bitHyper: null,
        bitTurret: null,
        bitFinale: null
    };
    attackIndex = 0;
    enemyTimer = 0;
    telegraphs = [];
    robots = [];
    onlyM1Phase = false;
}

function onEnemyDefeated() {
    if (!enemy) return;
    log(enemy.name + ' was defeated!');
    currentEnemyIndex += 1;
    if (currentEnemyIndex >= enemyRoster.length) {
        runFinishedAt = performance.now();
        recordWinTime(getRunElapsedMs());
        clearPendingGameTimeouts();
        enemy = null;
        log('YOU WIN!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        return;
    }
    resetPartyForRound();
    enemy = null;
    telegraphs = [];
    robots = [];
    clearPendingGameTimeouts();
    bossBreakTimerAtStart = getRunElapsedMs();
    bossBreakRemainingMs = 5000;
    log('Boss defeated. Next boss in 5 seconds.');
}

function transferPower(deadMember, receiverIndex) {
    const receiver = party[receiverIndex];
    if (!receiver || !receiver.alive) return;
    receiver.pb = clamp(receiver.pb + deadMember.pb, 0, receiver.maxPb);
    log(deadMember.name + "'s power bar has been passed to " + receiver.name + '.');
    transferPending = null;
    pauseLabel = '';
}

function handlePartyMemberDefeated(actor) {
    if (getAliveParty().length === 0) {
        transferPending = null;
        pauseLabel = '';
        log(actor.name + ' has fallen.');
        if (currentEnemyIndex < enemyRoster.length) {
            log('YOU LOSE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        }
        return;
    }
    log(actor.name + ' has fallen. Press 1/2/3 to transfer power.');
    transferPending = actor;
    pauseLabel = 'Select the receiver (1/2/3)';
}

function tryParry(actor, damage, sourceText, attacker = getAliveEnemy()) {
    if (!actor.parryUntil || performance.now() > actor.parryUntil) return false;
    actor.parryUntil = 0;
    actor.parryFlashUntil = performance.now() + 220;
    pushParticle(actor.x + actor.size / 2, actor.y + actor.size / 2, '#ffe45e');
    log(actor.name + ' parried ' + sourceText + '!');

    if (attacker === enemy && attacker.alive) {
        attacker.hp -= damage;
        pushParticle(attacker.x + attacker.size / 2, attacker.y + attacker.size / 2, '#ffe45e');
        log(actor.name + ' reflected ' + damage + ' HP back at ' + attacker.name + '.');
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            attacker.alive = false;
            onEnemyDefeated();
        }
    } else if (robots.includes(attacker)) {
        attacker.hp -= damage;
        pushParticle(attacker.x, attacker.y, '#ffe45e');
        log(actor.name + ' reflected ' + damage + ' HP back at the attacker.');
    }
    return true;
}

// helper that applies damage to a specific actor with optional "prevent one-shot" behavior
function applyDamageToActor(actor, amount, sourceText, preventOneShot = false, attacker = getAliveEnemy()) {
    if (!actor || !actor.alive) return;
    if (tryParry(actor, amount, sourceText, attacker)) return;
    let dmg = amount;
    if (actor.defending) dmg = Math.ceil(dmg * (1 - actor.defendReduction));
    if (preventOneShot && dmg >= actor.hp) {
        // cap damage so actor is left with at least 1 HP where possible;
        // if actor.hp is 1 this makes dmg = 0 (no instant-kill).
        dmg = Math.max(0, actor.hp - 1);
    }
    actor.hp -= dmg;
    actor.hitFlash = 200;
    log(sourceText + ' hit ' + actor.name + ' for ' + dmg + ' HP.');
    if (actor.hp <= 0) {
        actor.hp = 0;
        actor.alive = false;
        handlePartyMemberDefeated(actor);
    }
}

function damageSelected(amount, sourceText, attacker = getAliveEnemy()) {
    const actor = getSelectedActor();
    if (!actor || !actor.alive) return;
    if (tryParry(actor, amount, sourceText, attacker)) return;
    let dmg = amount;
    if (actor.defending) dmg = Math.ceil(dmg * (1 - actor.defendReduction));
    actor.hp -= dmg;
    actor.hitFlash = 200;
    log(sourceText + ' hit ' + actor.name + ' for ' + dmg + ' HP.');
    if (actor.hp <= 0) {
        actor.hp = 0;
        actor.alive = false;
        handlePartyMemberDefeated(actor);
    }
}

function pushParticle(x, y, color = '#fff') {
    particles.push({ x, y, ttl: 250, color });
}

function addTelegraph(x, y, w, h, color, ttl) {
    telegraphs.push({ x, y, w, h, color, ttl });
}

function firePlayerM1(actor) {
    if (!actor || !actor.alive) return;
    const now = performance.now();
    if (now < actor.lastM1 + actor.m1Cooldown) {
        log(actor.name + ' M1 is on cooldown.');
        return;
    }
    actor.lastM1 = now;
    const e = getAliveEnemy();
    // If turret phase, aim at cursor so shots can intercept missiles/bullets at cursor.
    let targetX, targetY;
    if (enemy && enemy.bitPhase === 'turret') {
        targetX = cursorX;
        targetY = cursorY;
    } else {
        if (!e) { log('There is no enemy to attack.'); return; }
        targetX = e.x + e.size / 2;
        targetY = e.y + e.size / 2;
    }

    const dx = targetX - (actor.x + actor.size / 2);
    const dy = targetY - (actor.y + actor.size / 2);
    const len = Math.hypot(dx, dy) || 1;
    projectiles.push({
        x: actor.x + actor.size / 2,
        y: actor.y + actor.size / 2,
        vx: (dx / len) * 7,
        vy: (dy / len) * 7,
        radius: 6,
        owner: 'player',
        damage: actor.m1Damage,
        kind: 'bullet',
        ttl: 5000
    });
    actor.pb = clamp(actor.pb + actor.m1Gain, 0, actor.maxPb);
    log(actor.name + ' used M1 for ' + actor.m1Damage + ' damage. PB +' + actor.m1Gain + '.');
}

function doPassive(actor) {
    if (!actor || !actor.alive) return;
    const e = getAliveEnemy();
    if (!e) return;
    const now = performance.now();
    if (actor.passiveBlockedUntil > now) {
        log(actor.name + " can't use passive because it was tampered with.");
        return;
    }

    if (actor.id === 1) {
        if (actor.pb < 5) { log(actor.name + ' needs 5 PB for passive.'); return; }
        actor.pb -= 5;
        e.hp -= 25;
        log(actor.name + ' used Passive: Magic Punch (-25 dmg).');
    } else if (actor.id === 2) {
        if (actor.pb < 5) { log(actor.name + ' needs 5 PB for passive.'); return; }
        actor.pb -= 5;
        e.hp -= 20;
        const steal = Math.max(1, Math.floor(e.maxHp * 0.015));
        actor.hp = clamp(actor.hp + steal, 0, actor.maxHp);
        log(actor.name + ' used Passive: Teleport + steal (-20 dmg, +' + steal + ' HP).');
    } else if (actor.id === 3) {
        if (actor.pb >= 10) {
            actor.pb -= 10;
            party.forEach((p) => {
                if (p.alive) p.hp = clamp(p.hp + Math.floor(p.maxHp * 0.75), 0, p.maxHp);
            });
            log(actor.name + ' used Passive: Heal All (+75% HP).');
        } else if (actor.pb >= 6) {
            actor.pb -= 6;
            party.filter((p) => p.alive).slice(0, 2).forEach((p) => {
                p.hp = clamp(p.hp + Math.floor(p.maxHp * 0.5), 0, p.maxHp);
            });
            log(actor.name + ' used Passive: Heal Two (+50% HP).');
        } else if (actor.pb >= 3) {
            actor.pb -= 3;
            actor.hp = clamp(actor.hp + Math.floor(actor.maxHp * 0.25), 0, actor.maxHp);
            log(actor.name + ' used Passive: Heal One (+25% HP).');
        } else {
            log(actor.name + ' does not have enough PB for passive.');
        }
    }

    if (e.hp <= 0) {
        e.hp = 0;
        e.alive = false;
        onEnemyDefeated();
    }
}

function doSpecial(actor) {
    if (!actor || !actor.alive) return;
    if (onlyM1Phase) {
        log('Only M1 is allowed during the Bit Bunny final phase.');
        return;
    }
    const e = getAliveEnemy();
    if (!e) return;
    if (actor.pb < actor.specialCost) {
        log(actor.name + ' does not have enough PB for Special.');
        return;
    }
    actor.pb -= actor.specialCost;
    for (let i = 0; i < 7; i++) {
        const dx = (e.x + e.size / 2) - (actor.x + actor.size / 2) + randInt(-50, 50);
        const dy = (e.y + e.size / 2) - (actor.y + actor.size / 2) + randInt(-50, 50);
        const len = Math.hypot(dx, dy) || 1;
        projectiles.push({
            x: actor.x + actor.size / 2,
            y: actor.y + actor.size / 2,
            vx: (dx / len) * 5.5,
            vy: (dy / len) * 5.5,
            radius: 8,
            owner: 'player',
            damage: actor.specialDamage / 7,
            kind: 'magic',
            ttl: 5000
        });
    }
    e.stunnedMs = 600;
    log(actor.name + ' used Special: barrage! (-' + actor.specialCost + ' PB).');
}

function doFinalAttack(actor) {
    if (!actor || !actor.alive) return;
    const boss = getAliveEnemy();
    if (!boss) return;
    if (actor.pb < finalAttackCost) {
        log(actor.name + ' needs ' + finalAttackCost + ' PB for the Final Attack.');
        return;
    }
    actor.pb -= finalAttackCost;
    for (let i = 0; i < 8; i++) {
        projectiles.push({
            x: randInt(16, canvas.width - 16),
            y: -50 - i * 40,
            vx: 0,
            vy: 3.2 + i * 0.35,
            radius: 16,
            owner: 'player',
            damage: boss.maxHp * 0.45,
            targetBoss: boss,
            piercing: true,
            pierceBoss: false,
            kind: 'meteor',
            ttl: 10000
        });
    }
    log(actor.name + ' used the Final Attack! (-' + finalAttackCost + ' PB).');
}

function spawnRobot(x, y) {
    robots.push({
        x, y,
        size: 24,
        hp: 6,
        alive: true,
        attackTimer: 0,
        color: '#ababab'
    });
}

function spawnMissile(x, y) {
    // missiles are just robots with different appearance and hp so they can be shot down
    robots.push({
        x, y,
        size: 18,
        hp: 3,
        alive: true,
        attackTimer: 0,
        vx: 0,
        vy: 0,
        missile: true,
        color: '#ff6666'
    });
}

function updateRobots(dt) {
    for (let i = robots.length - 1; i >= 0; i--) {
        const r = robots[i];
        const target = getSelectedActor();
        if (!target || !target.alive) continue;
        if (r.missile) {
            // missiles head straight toward the selected member at spawn
            if (!r.vx && !r.vy) {
                const dx = (target.x + target.size / 2) - r.x;
                const dy = (target.y + target.size / 2) - r.y;
                const len = Math.hypot(dx, dy) || 1;
                r.vx = (dx / len) * 3.5;
                r.vy = (dy / len) * 3.5;
            }
            r.x += r.vx * (dt / 16);
            r.y += r.vy * (dt / 16);
        } else {
            const dx = (target.x + target.size / 2) - r.x;
            const dy = (target.y + target.size / 2) - r.y;
            const len = Math.hypot(dx, dy) || 1;
            r.x += (dx / len) * 0.7 * (dt / 16);
            r.y += (dy / len) * 0.7 * (dt / 16);
        }
        r.attackTimer += dt;
        if (r.attackTimer > 1000) {
            r.attackTimer = 0;
            if (dist({ x: r.x + r.size / 2, y: r.y + r.size / 2 }, { x: target.x + target.size / 2, y: target.y + target.size / 2 }) < 40) {
                damageSelected(r.missile ? 15 : 1, r.missile ? 'Missile' : 'Robot', r);
            }
        }
        // remove destroyed robots
        if (r.hp <= 0) robots.splice(i, 1);
    }
}

function updateTelegraphs(dt) {
    for (let i = telegraphs.length - 1; i >= 0; i--) {
        const t = telegraphs[i];
        t.ttl -= dt;
        if (t.ttl <= 0) telegraphs.splice(i, 1);
    }
}

function attackEnemyFromProjectile(p) {
    const e = p.targetBoss || getAliveEnemy();
    if (!e || !e.alive) return false;
    if (p.piercing && p.pierceBoss && p.lastHitEnemy === e) return false;
    const hitX = p.x >= e.x && p.x <= e.x + e.size;
    const hitY = p.y >= e.y && p.y <= e.y + e.size;
    if (hitX && hitY) {
        if (p.piercing && p.pierceBoss) p.lastHitEnemy = e;
        e.hp -= p.damage;
        pushParticle(p.x, p.y, '#4fe9ff');
        if (e.hp <= 0) {
            e.hp = 0;
            e.alive = false;
            onEnemyDefeated();
        }
        return true;
    }
    return false;
}

function attackRobotFromProjectile(p) {
    // robots are drawn centered at r.x, r.y, so their box is r.x - size/2 .. r.x + size/2
    for (let i = robots.length - 1; i >= 0; i--) {
        const r = robots[i];
        const left = r.x - r.size / 2;
        const right = r.x + r.size / 2;
        const top = r.y - r.size / 2;
        const bottom = r.y + r.size / 2;
        const hitX = p.x >= left && p.x <= right;
        const hitY = p.y >= top && p.y <= bottom;
        if (hitX && hitY) {
            r.hp -= p.damage;
            pushParticle(p.x, p.y, '#ffd700');
            if (r.hp <= 0) {
                robots.splice(i, 1);
                log('A robot was destroyed!');
            }
            return true;
        }
    }
    return false;
}

function attackSelectedPlayerFromProjectile(p) {
    const actor = getSelectedActor();
    if (!actor || !actor.alive) return false;
    const hitX = p.x >= actor.x && p.x <= actor.x + actor.size;
    const hitY = p.y >= actor.y && p.y <= actor.y + actor.size;
    if (hitX && hitY) {
        if (tryParry(actor, p.damage, p.kind || 'projectile', enemy)) return true;
        let dmg = p.damage;
        if (actor.defending) dmg = Math.ceil(dmg * (1 - actor.defendReduction));
        actor.hp -= dmg;
        actor.hitFlash = 200;
        if (p.tamper) {
            // tamper knives temporarily block passives
            actor.passiveBlockedUntil = performance.now() + 4000;
            log(actor.name + "'s passive was tampered with!");
        }
        if (actor.hp <= 0) {
            actor.hp = 0;
            actor.alive = false;
            handlePartyMemberDefeated(actor);
        }
        return true;
    }
    return false;
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (p.owner === 'enemy' && !p.spreadApplied) {
            const speed = Math.hypot(p.vx, p.vy);
            const angle = Math.atan2(p.vy, p.vx) + (Math.random() * 10 - 5) * Math.PI / 180;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.spreadApplied = true;
        }
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        if (p.ttl !== undefined) {
            p.ttl -= dt;
            if (p.ttl <= 0) {
                projectiles.splice(i, 1);
                continue;
            }
        }

        // New: allow player projectiles to intercept enemy projectiles (projectile vs projectile)
        if (p.owner === 'player' && !p.piercing) {
            let intercepted = false;
            for (let j = projectiles.length - 1; j >= 0; j--) {
                const q = projectiles[j];
                if (q.owner === 'enemy') {
                    const dx = p.x - q.x;
                    const dy = p.y - q.y;
                    const rsum = (p.radius || 0) + (q.radius || 0) + 0.5;
                    if (Math.hypot(dx, dy) < rsum) {
                        // remove both safely by removing the higher index first
                        const idx1 = Math.max(i, j);
                        const idx2 = Math.min(i, j);
                        pushParticle(q.x, q.y, '#ffffff');
                        projectiles.splice(idx1, 1);
                        projectiles.splice(idx2, 1);
                        log('Enemy projectile intercepted!');
                        i = Math.min(i, j);
                        intercepted = true;
                        break;
                    }
                }
            }
            if (intercepted) continue;
        }

        if (p.owner === 'player') {
            // first allow player shots to hit robots
            if (!p.piercing && attackRobotFromProjectile(p)) {
                projectiles.splice(i, 1);
                continue;
            }
            if (attackEnemyFromProjectile(p)) {
                if (!p.piercing || !p.pierceBoss) projectiles.splice(i, 1);
                continue;
            }
        } else if (p.owner === 'enemy') {
            if (attackSelectedPlayerFromProjectile(p)) {
                projectiles.splice(i, 1);
                continue;
            }
        }

        if (p.x < -200 || p.x > canvas.width + 200 || p.y < -200 || p.y > canvas.height + 200) {
            projectiles.splice(i, 1);
        }
    }
}

function spawnSpellbookWarning(x, y, ttl = 1200) {
    addTelegraph(x - 25, y - 25, 50, 50, 'rgba(140, 0, 255, 0.42)', ttl);
}

// --- Bit Bunny custom behaviors/helpers ---
function startBitBunnyGuns() {
    const actor = getSelectedActor();
    if (!actor) return;
    enemy.bitPhase = 'guns';
    enemy.bitPhaseTimer = 0;
    const cx = actor.x + actor.size / 2;
    const cy = actor.y + actor.size / 2;
    const guns = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 / count) * i;
        guns.push({
            x: cx + Math.cos(ang) * 140,
            y: cy + Math.sin(ang) * 140,
            ang: ang
        });
    }
    enemy.bitGuns = { guns, cycleTimer: 0, duration: 10000, teleTimer: 0 };
    // show telegraphs
    guns.forEach(g => addTelegraph(g.x - 8, g.y - 8, 16, 16, 'rgba(255,200,0,0.35)', enemy.bitGuns.duration));
    log('Bit Bunny: Guns of Glory (trapping circle)');
}

function updateBitBunnyGuns(dt) {
    if (!enemy.bitGuns) return;
    enemy.bitGuns.cycleTimer += dt;
    enemy.bitGuns.teleTimer += dt;
    enemy.bitPhaseTimer += dt;
    // every 3000ms teleport player to center and fire inward bullets
    if (enemy.bitGuns.cycleTimer > 3000) {
        enemy.bitGuns.cycleTimer = 0;
        const actor = getSelectedActor();
        if (!actor || !actor.alive) return;
        const cx = actor.x + actor.size / 2;
        const cy = actor.y + actor.size / 2;
        // teleport actor to centre of circle
        actor.x = canvas.width / 2 - actor.size / 2;
        actor.y = canvas.height / 2 - actor.size / 2;
        // fire bullets inward from each gun
        for (const g of enemy.bitGuns.guns) {
            const dx = (actor.x + actor.size / 2) - g.x;
            const dy = (actor.y + actor.size / 2) - g.y;
            const len = Math.hypot(dx, dy) || 1;
            projectiles.push({ x: g.x, y: g.y, vx: (dx / len) * 4.5, vy: (dy / len) * 4.5, radius: 6, owner: 'enemy', damage: 5, kind: 'bullet', ttl: 4000 });
        }
        log('Guns of Glory: player teleported to the centre and guns fired!');
    }
    if (enemy.bitPhaseTimer > enemy.bitGuns.duration) {
        enemy.bitPhase = null;
        enemy.bitGuns = null;
        telegraphs = telegraphs.filter(t => t.color !== 'rgba(255,200,0,0.35)');
        log('Guns of Glory ended.');
    }
}

function startFallToHell() {
    enemy.bitPhase = 'fall';
    enemy.bitPhaseTimer = 0;
    enemy.bitFall = { duration: 9000, spawnTimer: 0 };
    log('Bit Bunny: Fall to Hell!');
}

function updateFallToHell(dt) {
    const f = enemy.bitFall;
    if (!f) return;
    f.spawnTimer += dt;
    enemy.bitPhaseTimer += dt;
    // spawn debris frequently
    if (f.spawnTimer > 300) {
        f.spawnTimer = 0;
        // debris falls from top
        const x = randInt(100, canvas.width - 100);
        projectiles.push({ x, y: -20, vx: randInt(-1, 1), vy: 2 + Math.random() * 2, radius: 10, owner: 'enemy', damage: 3, kind: 'debris', ttl: 6000 });
        // occasionally Bit Bunny itself falls quickly across the screen as a heavy hit
        if (Math.random() < 0.18) {
            projectiles.push({ x: randInt(200, canvas.width - 200), y: -80, vx: randInt(-2, 2), vy: 6 + Math.random() * 4, radius: 20, owner: 'enemy', damage: 12, kind: 'falling', ttl: 6000 });
        }
    }
    if (enemy.bitPhaseTimer > f.duration) {
        enemy.bitPhase = null;
        enemy.bitFall = null;
        log('Fall to Hell ended.');
    }
}

function startHyperBit() {
    enemy.bitPhase = 'hyper';
    enemy.bitPhaseTimer = 0;
    // place telegraphs (!) across the playfield
    const marks = [];
    for (let i = 0; i < 8; i++) {
        const x = randInt(150, canvas.width - 200);
        const y = randInt(80, canvas.height - 80);
        marks.push({ x, y, w: 40, h: 40, ttl: 8000 });
        addTelegraph(x - 20, y - 20, 40, 40, 'rgba(255,80,80,0.45)', 8000);
    }
    enemy.bitHyper = { marks, chargeTimer: 0, idx: 0, duration: 8000 };
    log('Bit Bunny: Hyper Bit Bunny (avoid the ! marks)');
}

function updateHyperBit(dt) {
    const h = enemy.bitHyper;
    if (!h) return;
    enemy.bitPhaseTimer += dt;
    h.chargeTimer += dt;
    // charge through marks one by one quickly
    if (h.chargeTimer > 350 && h.idx < h.marks.length) {
        const m = h.marks[h.idx++];
        h.chargeTimer = 0;
        // Bit Bunny charges through this mark - if player is on it, take damage
        const actor = getSelectedActor();
        if (actor && actor.alive) {
            const centerX = actor.x + actor.size / 2;
            const centerY = actor.y + actor.size / 2;
            const inside = centerX > m.x - 20 && centerX < m.x + 20 && centerY > m.y - 20 && centerY < m.y + 20;
            if (inside) applyDamageToActor(actor, 10, 'Hyper Bit Bunny');
        }
        // visual: spawn a fast projectile across the mark
        projectiles.push({ x: m.x, y: m.y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, radius: 10, owner: 'enemy', damage: 4, kind: 'fast', ttl: 2000 });
    }
    if (enemy.bitPhaseTimer > h.duration || h.idx >= h.marks.length) {
        enemy.bitPhase = null;
        enemy.bitHyper = null;
        // clear those telegraphs
        telegraphs = telegraphs.filter(t => t.color !== 'rgba(255,80,80,0.45)');
        log('Hyper Bit Bunny ended.');
    }
}

function startTurreteer() {
    // Delay the actual lock so the player isn't immediately immobilized when the fight starts.
    enemy.bitPhase = 'turret';
    enemy.bitPhaseTimer = 0;
    // store a small lockDelay and a place to keep the timeout id so we can cancel it if the phase ends early
    enemy.bitTurret = { duration: 9000, missileTimer: 0, lockDelay: 700, lockTimeout: null };
    const sel = selectedIndex;
    // show a telegraph on the selected member's lane so the player sees the incoming turret
    const actor = party[sel];
    if (actor) {
        addTelegraph(canvas.width - 160, actor.y - 40, 140, actor.size + 80, 'rgba(255,0,0,0.12)', enemy.bitTurret.lockDelay);
    }
    // schedule the lock shortly after the phase starts (gives player a window to move)
    enemy.bitTurret.lockTimeout = scheduleGameTimeout(() => {
        const actorLock = party[sel];
        if (actorLock) {
            actorLock.lockedUntil = performance.now() + enemy.bitTurret.duration;
            log('Bit Bunny: Turreteer - player locked on turret!');
        }
    }, enemy.bitTurret.lockDelay);
    log('Bit Bunny: Turreteer - turret incoming!');
}

function updateTurreteer(dt) {
    const t = enemy.bitTurret;
    if (!t) return;
    t.missileTimer += dt;
    enemy.bitPhaseTimer += dt;
    if (t.missileTimer > 800) {
        t.missileTimer = 0;
        // spawn a missile that will home in on the player; player must shoot it down
        spawnMissile(randInt(200, canvas.width - 200), -20);
    }
    if (enemy.bitPhaseTimer > t.duration) {
        // clear pending lock timeout if phase ends before the lock happens
        if (t.lockTimeout) { clearGameTimeout(t.lockTimeout); t.lockTimeout = null; }
        enemy.bitPhase = null;
        enemy.bitTurret = null;
        log('Turreteer ended.');
    }
}

function startTimedFinale() {
    enemy.bitPhase = 'timedfinale';
    enemy.bitPhaseTimer = 0;
    enemy.bitFinale = { duration: 9000, fireTimer: 0, bgTimer: 0 };
    log('Bit Bunny: Timed Finale!');
}

function updateTimedFinale(dt) {
    const f = enemy.bitFinale;
    if (!f) return;
    f.fireTimer += dt;
    f.bgTimer += dt;
    enemy.bitPhaseTimer += dt;
    const actor = getSelectedActor();
    if (f.fireTimer > 250) {
        f.fireTimer = 0;
        // swirl bullets around the player
        if (actor && actor.alive) {
            const cx = actor.x + actor.size / 2;
            const cy = actor.y + actor.size / 2;
            const count = 6;
            for (let i = 0; i < count; i++) {
                const ang = Math.random() * Math.PI * 2;
                projectiles.push({
                    x: enemy.x + enemy.size / 2,
                    y: enemy.y + enemy.size / 2,
                    vx: Math.cos(ang) * (2 + Math.random() * 3),
                    vy: Math.sin(ang) * (2 + Math.random() * 3),
                    radius: 6,
                    owner: 'enemy',
                    damage: 3,
                    kind: 'bullet',
                    ttl: 4000
                });
            }
        }
    }
    // visual background flicker effect - use telegraphs covering randomized rectangles
    if (f.bgTimer > 400) {
        f.bgTimer = 0;
        addTelegraph(randInt(0, canvas.width - 120), randInt(0, canvas.height - 80), randInt(60, 200), randInt(40, 140), 'rgba(200,255,255,0.08)', 600);
    }
    if (enemy.bitPhaseTimer > f.duration) {
        // glitch parts of screen then damage
        addTelegraph(0, 0, canvas.width, canvas.height, 'rgba(255,255,255,0.12)', 700);
        scheduleGameTimeout(() => {
            const current = getSelectedActor();
            if (current && current.alive) applyDamageToActor(current, 10, 'Timed Finale');
        }, 700);
        enemy.bitPhase = null;
        enemy.bitFinale = null;
        log('Timed Finale ended.');
    }
}

// --- end of Bit Bunny helpers ---

function updateEnemyAI(dt) {
    if (!enemy || !enemy.alive) return;
    const actor = getSelectedActor();
    if (!actor || !actor.alive) return;
    enemy.attackClock += dt;
    enemyTimer += dt;

    if (enemy.key === 'lightwizard') {
        if (enemy.attackClock > 1200) {
            enemy.attackClock = 0;
            const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
            const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
            const len = Math.hypot(dx, dy) || 1;
            projectiles.push({
                x: enemy.x + enemy.size / 2,
                y: enemy.y + enemy.size / 2,
                vx: (dx / len) * 3,
                vy: (dy / len) * 3,
                radius: 7,
                owner: 'enemy',
                damage: 7,
                kind: 'crystal',
                ttl: 5000
            });
            log('Light Wizard throws crystals at the selected member.');
        }
    }

    if (enemy.key === 'darkwizard') {
        if (enemy.attackClock > 1400) {
            enemy.attackClock = 0;
            enemy.attackFlags.darkWizardVolley = false;
            const wx = randInt(150, canvas.width - 250);
            const wy = randInt(80, canvas.height - 80);
            spawnSpellbookWarning(wx, wy, 1200);
            log('Dark Wizard marks a random spellbook zone.');
            const triggerTimer = scheduleGameTimeout(() => {
                const current = getSelectedActor();
                if (!current || !current.alive) return;
                const centerX = current.x + current.size / 2;
                const centerY = current.y + current.size / 2;
                const inside = centerX > wx - 25 && centerX < wx + 25 && centerY > wy - 25 && centerY < wy + 25;
                if (inside) damageSelected(10, 'Dark Wizard Spellbook');
            }, 1200);
            if (triggerTimer) {
                // keep it simple; game loop is still active and this is a one-time event
            }
        }

        if (enemy.attackClock > 700 && enemy.attackClock < 1200 && !enemy.attackFlags.darkWizardVolley) {
            enemy.attackFlags.darkWizardVolley = true;
            const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
            const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
            const len = Math.hypot(dx, dy) || 1;
            projectiles.push({
                x: enemy.x + enemy.size / 2,
                y: enemy.y + enemy.size / 2,
                vx: (dx / len) * 4,
                vy: (dy / len) * 4,
                radius: 10,
                owner: 'enemy',
                damage: 10,
                kind: 'crystal',
                ttl: 5000
            });
        }
    }

    if (enemy.key === 'blitz') {
        if (enemy.hp > 300) {
            if (enemy.attackClock > 1400) {
                enemy.attackClock = 0;
                const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
                const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
                const len = Math.hypot(dx, dy) || 1;
                projectiles.push({
                    x: enemy.x + enemy.size / 2,
                    y: enemy.y + enemy.size / 2,
                    vx: (dx / len) * 6,
                    vy: (dy / len) * 6,
                    radius: 10,
                    owner: 'enemy',
                    damage: 10,
                    kind: 'blast',
                    ttl: 4000
                });
                spawnRobot(enemy.x - 50 + randInt(-14, 14), enemy.y + randInt(-40, 40));
                log('Blitz fires a single heavy blast and spawns a robot.');
            }
        } else if (enemy.hp > 200) {
            if (enemy.attackClock > 1800) {
                enemy.attackClock = 0;
                spawnRobot(enemy.x - 40 + randInt(-25, 25), enemy.y + randInt(-40, 40));
                log('Creator Blitz spawns a robot.');
            }
        } else if (enemy.hp > 100) {
            if (enemy.attackClock > 260) {
                enemy.attackClock = 0;
                const ang = Math.random() * Math.PI * 2;
                const speed = 8 + Math.random() * 3;
                projectiles.push({
                    x: enemy.x + enemy.size / 2,
                    y: enemy.y + enemy.size / 2,
                    vx: Math.cos(ang) * speed,
                    vy: Math.sin(ang) * speed,
                    radius: 7,
                    owner: 'enemy',
                    damage: 6,
                    kind: 'fast',
                    ttl: 4000
                });
                log('Hyper Blitz fires fast random shots.');
            }
        } else {
            onlyM1Phase = true;
            if (enemy.attackClock > 900) {
                enemy.attackClock = 0;
                const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
                const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
                const len = Math.hypot(dx, dy) || 1;
                projectiles.push({
                    x: enemy.x + enemy.size / 2,
                    y: enemy.y + enemy.size / 2,
                    vx: (dx / len) * 7,
                    vy: (dy / len) * 7,
                    radius: 11,
                    owner: 'enemy',
                    damage: 10,
                    kind: 'heavy',
                    ttl: 4000
                });
                log('Special Blitz fires a heavy single blast.');
            }
        }
    }

    if (enemy.key === 'cyberdio') {
        if (enemy.attackClock > 8000) {
            enemy.attackClock = 0;
            enemy.attackFlags.cyberKnives = false;
            enemy.attackFlags.cyberStopSign = false;
            enemy.attackFlags.cyberRoadRoller = false;
            // avoid scheduling again while a time-hit is pending
            if (!enemy.timeHitScheduled) {
                enemy.timeHitScheduled = true;
                addTelegraph(0, 0, canvas.width, canvas.height, 'rgba(255,255,255,0.18)', 700);
                log('Cyber Dio hacks time and prepares to attack the selected member for 5 HP.');
                // delay the actual damage so the telegraph is a real warning
                scheduleGameTimeout(() => {
                    const current = getSelectedActor();
                    if (current && current.alive) {
                        // direct HP subtraction: unblockable/undodgeable/uncounterable 5 HP total
                        current.hp -= 10;
                        current.hitFlash = 200;
                        if (current.hp <= 0) {
                            current.hp = 0;
                            current.alive = false;
                            handlePartyMemberDefeated(current);
                        } else {
                            log('Cyber Dio time-hit damaged ' + current.name + ' for 5 HP.');
                        }
                    }
                    // clear flag so another time-hit can be scheduled later
                    enemy.timeHitScheduled = false;
                }, 700);
            }
        }

        if (enemy.attackClock > 1600 && !enemy.attackFlags.cyberKnives) {
            enemy.attackFlags.cyberKnives = true;
            const dx = (actor.x + actor.size / 2) - (enemy.x + enemy.size / 2);
            const dy = (actor.y + actor.size / 2) - (enemy.y + enemy.size / 2);
            const len = Math.hypot(dx, dy) || 1;
            for (let i = 0; i < 3; i++) {
                projectiles.push({
                    x: enemy.x + enemy.size / 2,
                    y: enemy.y + enemy.size / 2,
                    vx: (dx / len) * (5 + i * 0.15),
                    vy: (dy / len) * (5 + i * 0.15),
                    radius: 5,
                    owner: 'enemy',
                    damage: 7,
                    kind: 'knife',
                    ttl: 6000,
                    tamper: true,
                    passivesBlocked: true
                });
            }
            log('Cyber Dio throws knives. Each knife can tamper with passives.');
        }

        if (enemy.attackClock > 5200 && !enemy.attackFlags.cyberStopSign) {
            enemy.attackFlags.cyberStopSign = true;
            // show a full-screen-ish telegraph and delay the hit so the player sees the warning
            addTelegraph(0, 0, canvas.width, canvas.height, 'rgba(255,255,255,0.12)', 700);
            log('Cyber Dio prepares to whack the selected member with a Stop Sign.');
            scheduleGameTimeout(() => {
                const current = getSelectedActor();
                if (current && current.alive) {
                    // use the safe helper so this telegraphed attack can't insta-kill a defended member
                    applyDamageToActor(current, 7, 'Stop Sign', true);
                }
            }, 700);
        }

        if (enemy.attackClock > 6400 && !enemy.attackFlags.cyberRoadRoller) {
            enemy.attackFlags.cyberRoadRoller = true;
            const rollerX = canvas.width - 120;
            // telegraph the road roller across the selected member's lane
            addTelegraph(rollerX, actor.y - 20, 90, actor.size + 40, 'rgba(255, 0, 0, 0.2)', 900);
            log('Cyber Dio is rolling the Road Roller through the selected member.');
            scheduleGameTimeout(() => {
                const current = getSelectedActor();
                if (current && current.alive) {
                    const collides = current.x + current.size > rollerX && current.x < rollerX + 90;
                    if (collides) {
                        // use the safe helper as well
                        applyDamageToActor(current, 5, 'Road Roller', true);
                    }
                }
            }, 900);
        }
    }

    if (enemy.key === 'bitbunny') {
        // If in final phase (<=50HP) keep techno meteor behavior
        if (enemy.hp <= 100) {
            onlyM1Phase = true;
            if (enemy.attackClock > 500) {
                enemy.attackClock = 0;
                projectiles.push({
                    x: randInt(200, canvas.width - 200),
                    y: -20,
                    vx: 0,
                    vy: 2.8,
                    radius: 18,
                    owner: 'enemy',
                    damage: Math.floor(actor.maxHp * 0.5),
                    kind: 'meteor',
                    ttl: 99999
                });
                log('Bit Bunny begins the Techno Meteor final phase.');
            }
            return;
        }

        // Decide when to start a new sub-attack if none active
        if (!enemy.bitPhase) {
            // pick an attack randomly, weighted
            const r = Math.random();
            if (r < 0.25) startBitBunnyGuns();
            else if (r < 0.45) startFallToHell();
            else if (r < 0.65) startHyperBit();
            else if (r < 0.85) startTurreteer();
            else startTimedFinale();
        }

        // update whichever bit phase is active
        if (enemy.bitPhase === 'guns') updateBitBunnyGuns(dt);
        if (enemy.bitPhase === 'fall') updateFallToHell(dt);
        if (enemy.bitPhase === 'hyper') updateHyperBit(dt);
        if (enemy.bitPhase === 'turret') updateTurreteer(dt);
        if (enemy.bitPhase === 'timedfinale') updateTimedFinale(dt);

        // Occasionally also perform a small random shot pattern as a filler
        if (enemy.attackClock > 2000 && Math.random() < 0.25) {
            enemy.attackClock = 0;
            for (let i = 0; i < 6; i++) {
                const ang = Math.random() * Math.PI * 2;
                projectiles.push({
                    x: enemy.x + enemy.size / 2,
                    y: enemy.y + enemy.size / 2,
                    vx: Math.cos(ang) * (1 + Math.random() * 3),
                    vy: Math.sin(ang) * (1 + Math.random() * 3),
                    radius: 6,
                    owner: 'enemy',
                    damage: 4,
                    kind: 'bullet',
                    ttl: 3000
                });
            }
        }
    }
}

function update(dt) {
    if (!gameStarted || gamePaused || runFinishedAt !== null) return;
    if (bossBreakRemainingMs > 0) {
        projectiles = [];
        bossBreakRemainingMs = Math.max(0, bossBreakRemainingMs - dt);
        if (bossBreakRemainingMs === 0) {
            bossBreakDurationTotal += 5000;
            bossBreakTimerAtStart = null;
            spawnEnemy(currentEnemyIndex);
            log('New enemy: ' + enemy.name + '. Party restored to full HP.');
        }
        return;
    }
    if (transferPending) {
        if (keys['1']) { transferPower(transferPending, 0); keys['1'] = false; }
        if (keys['2']) { transferPower(transferPending, 1); keys['2'] = false; }
        if (keys['3']) { transferPower(transferPending, 2); keys['3'] = false; }
        return;
    }

    const actor = getSelectedActor();
    if (actor && actor.alive) {
        const now = performance.now();
        // movement blocked when locked (e.g., Turreteer)
        if (!(actor.lockedUntil && now < actor.lockedUntil)) {
            if (keys['ArrowRight']) actor.x += actor.speed * (dt / 16);
            if (keys['ArrowLeft']) actor.x -= actor.speed * (dt / 16);
            if (keys['ArrowUp']) actor.y -= actor.speed * (dt / 16);
            if (keys['ArrowDown']) actor.y += actor.speed * (dt / 16);
        }
        actor.x = clamp(actor.x, 0, canvas.width - actor.size);
        actor.y = clamp(actor.y, 0, canvas.height - actor.size);

        // Defend behavior: hold Z to reduce damage for up to 5 seconds, then 10s cooldown
        if (keys['z'] || keys['Z']) {
            if (!actor.defending) {
                if (now >= actor.defendCooldownUntil) {
                    actor.defending = true;
                    actor.defendStartAt = now;
                    log(actor.name + ' is defending.');
                } else {
                    // do nothing while on cooldown (a one-time message is shown on keydown)
                }
            } else {
                // already defending: cap hold time
                if (now - actor.defendStartAt >= 5000) {
                    actor.defending = false;
                    actor.defendCooldownUntil = now + 10000;
                    log(actor.name + "'s defend ended (max hold). Cooldown 10s.");
                }
            }
        } else {
            // key released: if was defending, start cooldown
            if (actor.defending) {
                actor.defending = false;
                actor.defendCooldownUntil = now + 10000;
                log(actor.name + ' stopped defending. Cooldown 10s.');
            }
        }

        if (keys[' ']) {
            keys[' '] = false;
            // Always allow M1 to fire (this fixes M1 being blocked during Hyper/Final phases)
            firePlayerM1(actor);
            if (onlyM1Phase) log('Final Phase: passive/special are disabled.');
        }

        if (keys['c'] || keys['C']) {
            keys['c'] = false; keys['C'] = false;
            if (onlyM1Phase) log('Passive is disabled during the final phase.');
            else doPassive(actor);
        }
    }

    if (holdXStartedAt && !(keys['x'] || keys['X'])) {
        const held = performance.now() - holdXStartedAt;
        holdXStartedAt = null;
        const current = getSelectedActor();
        if (current && current.alive) {
            if (held >= 600 && current.pb >= finalAttackCost) doFinalAttack(current);
            else if (!onlyM1Phase) doSpecial(current);
        }
    }
    if ((keys['x'] || keys['X']) && !holdXStartedAt) holdXStartedAt = performance.now();

    updateProjectiles(dt);
    if (bossBreakRemainingMs > 0) return;
    updateTelegraphs(dt);
    updateRobots(dt);
    updateEnemyAI(dt);

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].ttl -= dt;
        if (particles[i].ttl <= 0) particles.splice(i, 1);
    }

    if (enemy && enemy.alive && enemy.hp <= 0) {
        enemy.hp = 0;
        enemy.alive = false;
        onEnemyDefeated();
    }

    // Only change selectedIndex automatically if the currently selected actor is missing or dead
    const currentActor = getSelectedActor();
    if (!currentActor || !currentActor.alive) {
        const firstAlive = party.findIndex((p) => p.alive);
        if (firstAlive !== -1) selectedIndex = firstAlive;
    }
}

// Destroy enemy projectiles/robots near point (cursor click helper)
function destroyAtPoint(x, y, radius = 24) {
    // destroy projectiles (enemy-owned)
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (p.owner === 'enemy') {
            const dx = p.x - x;
            const dy = p.y - y;
            if (Math.hypot(dx, dy) <= radius + (p.radius || 0)) {
                pushParticle(p.x, p.y, '#ffffff');
                projectiles.splice(i, 1);
                log('Destroyed an incoming projectile!');
            }
        }
    }
    // destroy missile-robots
    for (let i = robots.length - 1; i >= 0; i--) {
        const r = robots[i];
        const dx = r.x - x;
        const dy = r.y - y;
        if (Math.hypot(dx, dy) <= radius + (r.size || 0) / 2) {
            robots.splice(i, 1);
            pushParticle(x, y, '#ffd700');
            log('Destroyed a missile!');
        }
    }
}

function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    runStartedAt = performance.now();
    pausedDuration = 0;
    lastFrame = runStartedAt;
}

function togglePause() {
    if (runFinishedAt !== null) return;
    if (!gameStarted) startGame();
    if (gamePaused) {
        const now = performance.now();
        const duration = now - pauseStartedAt;
        pausedDuration += duration;
        if (nextCharacterSwapAt > 0) nextCharacterSwapAt += duration;
        party.forEach((actor) => {
            ['defendStartAt', 'defendCooldownUntil', 'lastM1', 'passiveBlockedUntil', 'lockedUntil', 'parryUntil', 'parryFlashUntil'].forEach((key) => {
                if (actor[key] > 0) actor[key] += duration;
            });
        });
        if (lastCursorShot > 0) lastCursorShot += duration;
        gamePaused = false;
        pauseStartedAt = 0;
        lastFrame = now;
        resumeGameTimeouts();
    } else {
        gamePaused = true;
        pauseStartedAt = performance.now();
        keys = {};
        holdXStartedAt = null;
        pauseGameTimeouts();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        togglePause();
        return;
    }
    if (gamePaused || runFinishedAt !== null) return;
    startGame();
    keys[e.key] = true;
    const requestedIndex = e.key === '1' ? 0 : e.key === '2' ? 1 : e.key === '3' ? 2 : -1;
    if (!transferPending && requestedIndex !== -1 && requestedIndex !== selectedIndex) {
        const now = performance.now();
        if (now >= nextCharacterSwapAt) {
            selectedIndex = requestedIndex;
            nextCharacterSwapAt = now + characterSwapCooldownMs;
        } else {
            const seconds = Math.ceil((nextCharacterSwapAt - now) / 1000);
            log('Character swap is on cooldown for ' + seconds + 's.');
        }
    }

    // if player tries to start defending while on cooldown, show one-time message
    if (e.key === 'z' || e.key === 'Z') {
        const actor = getSelectedActor();
        const now = performance.now();
        if (actor && actor.alive && now >= actor.defendCooldownUntil) {
            actor.parryUntil = now + parryWindowMs;
        } else if (actor && now < actor.defendCooldownUntil) {
            const sec = Math.ceil((actor.defendCooldownUntil - now) / 1000);
            log(actor.name + ' cannot defend for ' + sec + 's.');
        }
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Mouse handling for crosshair and clicking to destroy incoming bullets/missiles
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    cursorX = e.clientX - rect.left;
    cursorY = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', (e) => {
    if (gamePaused || runFinishedAt !== null) return;
    startGame();
    // only allow cursor-shot in turret phase
    if (enemy && enemy.bitPhase === 'turret') {
        const now = performance.now();
        if (now - lastCursorShot >= cursorCooldown) {
            lastCursorShot = now;
            // destroy bullets/robots near cursor immediately
            destroyAtPoint(cursorX, cursorY, 28);
        }
    }
});
canvas.addEventListener('mouseup', (e) => {
    // no-op for now
});

function drawPartySprite(member) {
    const { x, y, size } = member;
    const color = member.alive ? member.color : '#72777a';
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const detail = member.id === 1 ? '#ffd447' : member.id === 2 ? '#d7edf5' : '#7ce7ff';

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 6;
    const bodyGradient = ctx.createLinearGradient(x, y, x + size, y + size);
    bodyGradient.addColorStop(0, color);
    bodyGradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.28)');
    bodyGradient.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(20, 24, 30, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.fillRect(x + 5, y + 5, size - 10, Math.max(2, size * 0.07));

    if (member.id === 1) {
        ctx.fillStyle = '#202c36';
        ctx.fillRect(x + size * 0.18, y + size * 0.2, size * 0.64, size * 0.22);
        ctx.fillStyle = detail;
        ctx.fillRect(x + size * 0.24, y + size * 0.25, size * 0.52, size * 0.06);
        ctx.fillStyle = '#353f48';
        ctx.fillRect(x + size * 0.2, y + size * 0.52, size * 0.6, size * 0.28);
        ctx.fillStyle = detail;
        ctx.fillRect(centerX - size * 0.07, y + size * 0.56, size * 0.14, size * 0.18);
        ctx.fillStyle = '#222b33';
        ctx.fillRect(x + size * 0.08, y + size * 0.84, size * 0.34, size * 0.1);
        ctx.fillRect(x + size * 0.58, y + size * 0.84, size * 0.34, size * 0.1);
    } else if (member.id === 2) {
        ctx.fillStyle = '#eaf4f8';
        ctx.beginPath();
        ctx.moveTo(centerX, y + size * 0.08);
        ctx.lineTo(x + size * 0.82, y + size * 0.28);
        ctx.lineTo(x + size * 0.18, y + size * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#273943';
        ctx.fillRect(x + size * 0.26, y + size * 0.29, size * 0.48, size * 0.12);
        ctx.fillStyle = detail;
        ctx.fillRect(x + size * 0.36, y + size * 0.52, size * 0.28, size * 0.3);
        ctx.fillStyle = '#d9e7eb';
        ctx.fillRect(x + size * 0.82, y + size * 0.28, size * 0.08, size * 0.48);
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(x + size * 0.77, y + size * 0.45, size * 0.18, size * 0.06);
        ctx.fillRect(x + size * 0.84, y + size * 0.7, size * 0.06, size * 0.2);
    } else {
        ctx.fillStyle = '#254350';
        ctx.beginPath();
        ctx.moveTo(centerX, y + size * 0.03);
        ctx.lineTo(x + size * 0.86, y + size * 0.26);
        ctx.lineTo(x + size * 0.14, y + size * 0.26);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = detail;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.2, y + size * 0.28);
        ctx.lineTo(x + size * 0.8, y + size * 0.28);
        ctx.stroke();
        ctx.fillStyle = '#172832';
        ctx.fillRect(x + size * 0.27, y + size * 0.32, size * 0.46, size * 0.12);
        ctx.fillStyle = detail;
        ctx.beginPath();
        ctx.arc(centerX, y + size * 0.62, size * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c2a76b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + size * 0.82, y + size * 0.38);
        ctx.lineTo(x + size * 0.82, y + size * 0.92);
        ctx.stroke();
        ctx.fillStyle = detail;
        ctx.beginPath();
        ctx.arc(x + size * 0.82, y + size * 0.34, size * 0.09, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawBossSprite(boss) {
    const { x, y, size } = boss;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 10;
    const bodyGradient = ctx.createLinearGradient(x, y, x + size, y + size);
    bodyGradient.addColorStop(0, boss.color);
    bodyGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.34)');
    bodyGradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);

    if (boss.key === 'lightwizard' || boss.key === 'darkwizard') {
        const trim = boss.key === 'lightwizard' ? '#fff2a0' : '#db9cff';
        ctx.fillStyle = boss.key === 'lightwizard' ? '#806023' : '#32184a';
        ctx.beginPath();
        ctx.moveTo(centerX, y + size * 0.03);
        ctx.lineTo(x + size * 0.83, y + size * 0.3);
        ctx.lineTo(x + size * 0.17, y + size * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = trim;
        ctx.fillRect(x + size * 0.16, y + size * 0.29, size * 0.68, size * 0.08);
        ctx.fillStyle = '#17141a';
        ctx.fillRect(x + size * 0.22, y + size * 0.4, size * 0.56, size * 0.25);
        ctx.fillStyle = trim;
        ctx.fillRect(x + size * 0.31, y + size * 0.49, size * 0.12, size * 0.05);
        ctx.fillRect(x + size * 0.57, y + size * 0.49, size * 0.12, size * 0.05);
        ctx.strokeStyle = trim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, y + size * 0.68);
        ctx.lineTo(centerX, y + size * 0.9);
        ctx.stroke();
    } else if (boss.key === 'blitz') {
        ctx.fillStyle = '#153077';
        ctx.fillRect(x + size * 0.18, y + size * 0.2, size * 0.64, size * 0.58);
        ctx.fillStyle = '#b9efff';
        ctx.beginPath();
        ctx.moveTo(centerX + size * 0.08, y + size * 0.18);
        ctx.lineTo(centerX - size * 0.11, y + size * 0.51);
        ctx.lineTo(centerX + size * 0.03, y + size * 0.51);
        ctx.lineTo(centerX - size * 0.08, y + size * 0.82);
        ctx.lineTo(centerX + size * 0.2, y + size * 0.43);
        ctx.lineTo(centerX + size * 0.07, y + size * 0.43);
        ctx.closePath();
        ctx.fill();
    } else if (boss.key === 'cyberdio') {
        ctx.fillStyle = '#15070d';
        ctx.fillRect(x + size * 0.15, y + size * 0.17, size * 0.7, size * 0.65);
        ctx.fillStyle = '#600b20';
        ctx.beginPath();
        ctx.moveTo(x + size * 0.16, y + size * 0.23);
        ctx.lineTo(centerX, y + size * 0.31);
        ctx.lineTo(x + size * 0.84, y + size * 0.23);
        ctx.lineTo(x + size * 0.76, y + size * 0.43);
        ctx.lineTo(x + size * 0.24, y + size * 0.43);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#09070b';
        ctx.fillRect(x + size * 0.22, y + size * 0.47, size * 0.56, size * 0.2);
        ctx.save();
        ctx.shadowColor = '#ff163d';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff2949';
        ctx.fillRect(x + size * 0.29, y + size * 0.52, size * 0.16, size * 0.045);
        ctx.fillRect(x + size * 0.55, y + size * 0.52, size * 0.16, size * 0.045);
        ctx.restore();
        ctx.fillStyle = '#d8a934';
        ctx.beginPath();
        ctx.moveTo(centerX, y + size * 0.5);
        ctx.lineTo(centerX + size * 0.11, y + size * 0.68);
        ctx.lineTo(centerX, y + size * 0.88);
        ctx.lineTo(centerX - size * 0.11, y + size * 0.68);
        ctx.closePath();
        ctx.fill();
    } else if (boss.key === 'bitbunny') {
        ctx.fillStyle = '#650b1b';
        ctx.beginPath();
        ctx.moveTo(x + size * 0.18, y + size * 0.33);
        ctx.lineTo(x + size * 0.03, y + size * 0.12);
        ctx.lineTo(x + size * 0.34, y + size * 0.23);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + size * 0.82, y + size * 0.33);
        ctx.lineTo(x + size * 0.97, y + size * 0.12);
        ctx.lineTo(x + size * 0.66, y + size * 0.23);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#390913';
        ctx.beginPath();
        ctx.moveTo(centerX, y + size * 0.14);
        ctx.lineTo(x + size * 0.78, y + size * 0.34);
        ctx.lineTo(x + size * 0.72, y + size * 0.72);
        ctx.lineTo(centerX, y + size * 0.9);
        ctx.lineTo(x + size * 0.28, y + size * 0.72);
        ctx.lineTo(x + size * 0.22, y + size * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ed4051';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#9d1428';
        ctx.fillRect(x + size * 0.08, y + size * 0.4, size * 0.16, size * 0.34);
        ctx.fillRect(x + size * 0.76, y + size * 0.4, size * 0.16, size * 0.34);
        ctx.fillStyle = '#140b14';
        ctx.fillRect(x + size * 0.3, y + size * 0.38, size * 0.4, size * 0.26);
        ctx.save();
        ctx.shadowColor = '#69eaff';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#a7f5ff';
        ctx.fillRect(x + size * 0.34, y + size * 0.46, size * 0.12, size * 0.055);
        ctx.fillRect(x + size * 0.54, y + size * 0.46, size * 0.12, size * 0.055);
        ctx.restore();
        ctx.fillStyle = '#ec394c';
        ctx.fillRect(x + size * 0.43, y + size * 0.7, size * 0.14, size * 0.08);
        ctx.fillStyle = '#ffb242';
        ctx.fillRect(x + size * 0.46, y + size * 0.83, size * 0.08, size * 0.04);
        ctx.fillStyle = '#4b1019';
        ctx.beginPath();
        ctx.moveTo(x + size * 0.31, y + size * 0.77);
        ctx.lineTo(x + size * 0.42, y + size * 0.95);
        ctx.lineTo(x + size * 0.58, y + size * 0.95);
        ctx.lineTo(x + size * 0.69, y + size * 0.77);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function drawRobotSprite(robot) {
    const halfSize = robot.size / 2;
    const left = robot.x - halfSize;
    const top = robot.y - halfSize;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 5;
    const gradient = ctx.createLinearGradient(left, top, left + robot.size, top + robot.size);
    gradient.addColorStop(0, robot.color || '#b8c4c9');
    gradient.addColorStop(1, '#343f46');
    ctx.fillStyle = gradient;
    ctx.fillRect(left, top, robot.size, robot.size);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#20292e';
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, robot.size, robot.size);
    ctx.fillStyle = robot.missile ? '#fff1a6' : '#49e3ff';
    ctx.fillRect(left + robot.size * 0.22, top + robot.size * 0.3, robot.size * 0.56, robot.size * 0.2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.fillRect(left + robot.size * 0.18, top + robot.size * 0.12, robot.size * 0.64, 2);
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#dfe7ed';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const t of telegraphs) {
        ctx.fillStyle = t.color;
        ctx.fillRect(t.x, t.y, t.w, t.h);
    }

    if (enemy && enemy.alive) {
        drawBossSprite(enemy);
        ctx.fillStyle = '#000';
        ctx.fillRect(enemy.x, enemy.y - 18, enemy.size, 8);
        ctx.fillStyle = '#ff4d4d';
        ctx.fillRect(enemy.x, enemy.y - 18, enemy.size * (enemy.hp / enemy.maxHp), 8);
        ctx.fillStyle = '#000';
        ctx.font = '14px sans-serif';
        ctx.fillText(enemy.name + ' ' + Math.floor(enemy.hp) + '/' + enemy.maxHp, enemy.x, enemy.y - 25);
    }

    for (const p of projectiles) {
        if (p.kind === 'meteor') {
            const meteorGradient = ctx.createLinearGradient(p.x - 12, p.y, p.x + 12, p.y + 18);
            meteorGradient.addColorStop(0, '#fff2a6');
            meteorGradient.addColorStop(0.45, '#ffb52e');
            meteorGradient.addColorStop(1, '#d84419');
            ctx.fillStyle = meteorGradient;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - 12, p.y + 18);
            ctx.lineTo(p.x + 12, p.y + 18);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#842d19';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 220, 0.8)';
            ctx.fillRect(p.x - 2, p.y + 4, 4, 8);
        } else if (p.kind === 'knife') {
            const knifeGradient = ctx.createLinearGradient(p.x - 8, p.y, p.x + 8, p.y + 12);
            knifeGradient.addColorStop(0, '#f4fbff');
            knifeGradient.addColorStop(0.5, '#9eb4bf');
            knifeGradient.addColorStop(1, '#26333b');
            ctx.fillStyle = knifeGradient;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - 8, p.y + 12);
            ctx.lineTo(p.x + 8, p.y + 12);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#172229';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + 2);
            ctx.lineTo(p.x, p.y + 8);
            ctx.stroke();
        } else if (p.kind === 'crystal') {
            const crystalGradient = ctx.createLinearGradient(p.x - p.radius, p.y - p.radius, p.x + p.radius, p.y + p.radius);
            crystalGradient.addColorStop(0, '#ffffff');
            crystalGradient.addColorStop(0.4, '#aaf5ff');
            crystalGradient.addColorStop(1, '#328daf');
            ctx.fillStyle = crystalGradient;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - p.radius);
            ctx.lineTo(p.x + p.radius, p.y + p.radius);
            ctx.lineTo(p.x - p.radius, p.y + p.radius);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#24647a';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.arc(p.x - p.radius * 0.2, p.y, Math.max(1.5, p.radius * 0.18), 0, Math.PI * 2);
            ctx.fill();
        } else {
            const bulletColor = p.owner === 'player' ? '#00eaff' : '#cc0033';
            const bulletGradient = ctx.createRadialGradient(p.x - 2, p.y - 2, 1, p.x, p.y, p.radius);
            bulletGradient.addColorStop(0, '#ffffff');
            bulletGradient.addColorStop(0.35, bulletColor);
            bulletGradient.addColorStop(1, p.owner === 'player' ? '#006979' : '#68001a');
            ctx.fillStyle = bulletGradient;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = p.owner === 'player' ? '#007b8b' : '#65001b';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    for (const r of robots) {
        drawRobotSprite(r);
    }

    for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    }

    party.forEach((member, idx) => {
        drawPartySprite(member);
        if (!member.alive) {
            return;
        }

        ctx.fillStyle = '#111';
        ctx.fillRect(member.x, member.y - 18, member.size, 6);
        ctx.fillStyle = '#25d65a';
        ctx.fillRect(member.x, member.y - 18, member.size * (member.hp / member.maxHp), 6);

        ctx.fillStyle = '#111';
        ctx.fillRect(member.x, member.y - 10, member.size, 5);
        ctx.fillStyle = '#ffd447';
        ctx.fillRect(member.x, member.y - 10, member.size * (member.pb / member.maxPb), 5);

        ctx.fillStyle = '#000';
        ctx.font = '12px sans-serif';
        ctx.fillText(member.name, member.x, member.y - 24);

        if (idx === selectedIndex) {
            ctx.strokeStyle = '#1e5bff';
            ctx.lineWidth = 2;
            ctx.strokeRect(member.x - 3, member.y - 3, member.size + 6, member.size + 6);
        }
        if (member.parryFlashUntil > performance.now()) {
            ctx.strokeStyle = '#ffe45e';
            ctx.lineWidth = 4;
            ctx.strokeRect(member.x - 6, member.y - 6, member.size + 12, member.size + 12);
        }
    });

    ctx.fillStyle = '#000';
    ctx.font = '16px sans-serif';
    ctx.fillText('Selected: ' + party[selectedIndex].name, 20, 26);
    ctx.fillText('Controls: Arrows move, 1/2/3 swap, Space M1, Z defend, C passive, X special/final', 20, 48);
    ctx.fillText('Time: ' + formatRunTime(getRunElapsedMs()), canvas.width - 160, 26);
    if (transferPending) ctx.fillText('Transfer power: press 1, 2, or 3', 20, 70);
    else if (performance.now() < nextCharacterSwapAt) {
        ctx.fillText('Swap cooldown: ' + Math.ceil((nextCharacterSwapAt - performance.now()) / 1000) + 's', 20, 70);
    }
    if (onlyM1Phase) ctx.fillText('Final Phase: only M1 is allowed.', 20, 92);

    // Draw crosshair at cursor during turret phase
    if (enemy && enemy.bitPhase === 'turret') {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.92;
        // circle
        ctx.beginPath();
        ctx.arc(cursorX, cursorY, 16, 0, Math.PI * 2);
        ctx.stroke();
        // lines
        ctx.beginPath();
        ctx.moveTo(cursorX - 22, cursorY);
        ctx.lineTo(cursorX - 8, cursorY);
        ctx.moveTo(cursorX + 8, cursorY);
        ctx.lineTo(cursorX + 22, cursorY);
        ctx.moveTo(cursorX, cursorY - 22);
        ctx.lineTo(cursorX, cursorY - 8);
        ctx.moveTo(cursorX, cursorY + 8);
        ctx.lineTo(cursorX, cursorY + 22);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#000';
        ctx.font = '12px sans-serif';
        ctx.fillText('Click to intercept bullets', cursorX + 18, cursorY - 18);
    }

    if (bossBreakRemainingMs > 0 && !gamePaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('BOSS DEFEATED!', canvas.width / 2, canvas.height / 2 - 14);
        ctx.font = '18px sans-serif';
        ctx.fillText('Next boss in ' + Math.ceil(bossBreakRemainingMs / 1000) + '...', canvas.width / 2, canvas.height / 2 + 24);
        ctx.restore();
    }

    if (!gameStarted) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Press any key or click to start', canvas.width / 2, canvas.height / 2);
        ctx.restore();
    }

    if (gamePaused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 12);
        ctx.font = '16px sans-serif';
        ctx.fillText('Press P or Escape to resume', canvas.width / 2, canvas.height / 2 + 24);
        ctx.restore();
    }

    if (runFinishedAt !== null) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('YOU WIN!', canvas.width / 2, 112);
        ctx.font = '18px sans-serif';
        ctx.fillText('Your time: ' + formatRunTime(getRunElapsedMs()), canvas.width / 2, 154);
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('LEADERBOARD', canvas.width / 2, 208);
        ctx.font = '17px sans-serif';
        if (leaderboard.length === 0) {
            ctx.fillText('No completed runs yet.', canvas.width / 2, 248);
        } else {
            leaderboard.forEach((entry, index) => {
                ctx.fillText((index + 1) + '.  ' + formatRunTime(entry.timeMs), canvas.width / 2, 248 + index * 30);
            });
        }
        ctx.restore();
    }
}

function gameLoop() {
    const now = performance.now();
    const dt = now - lastFrame;
    lastFrame = now;
    update(dt);
    draw();
    requestAnimationFrame(gameLoop);
}

function initGame() {
    gameStarted = false;
    gamePaused = false;
    runStartedAt = 0;
    runFinishedAt = null;
    pauseStartedAt = 0;
    pausedDuration = 0;
    bossBreakRemainingMs = 0;
    bossBreakTimerAtStart = null;
    bossBreakDurationTotal = 0;
    resetPartyForRound();
    spawnEnemy(0);
    tutorialMode = true;
    log('Tutorial: Light Wizard is active.');
    log('Magatank starts as the selected character.');
}

initGame();
requestAnimationFrame(gameLoop);
