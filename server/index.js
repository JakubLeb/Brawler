const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const http = require('http');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Game Constants
const TICK_RATE = 64;
const TICK_INTERVAL = 1000 / TICK_RATE;

const ARENA = {
    width: 1200,
    height: 800,
    platforms: [
        // Main platform
        { x: 200, y: 550, width: 800, height: 40, type: 'main' },
        // Left platform
        { x: 50, y: 400, width: 200, height: 30, type: 'side' },
        // Right platform
        { x: 950, y: 400, width: 200, height: 30, type: 'side' },
        // Top platform
        { x: 450, y: 280, width: 300, height: 30, type: 'top' }
    ],
    deathZone: {
        top: -200,
        bottom: 900,
        left: -100,
        right: 1300
    }
};

const PLAYER_CONFIG = {
    width: 50,
    height: 70,
    speed: 8,
    jumpForce: -18,
    gravity: 0.8,
    friction: 0.9,
    airFriction: 0.95,
    maxFallSpeed: 20,
    knockbackDecay: 0.92,
    attackCooldown: 400,
    attackRange: 80,
    attackKnockback: 5,
    attackDamage: 10,
    chargeAttackMultiplier: 2.5,
    maxCharge: 1000
};

const COLORS = [
    '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3',
    '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA'
];

// Game State
let players = new Map();
let gameLoop = null;
let gameOverInProgress = false;

class Player {
    constructor(id, name) {
        this.id = id;
        this.name = name || `Player${Math.floor(Math.random() * 1000)}`;
        this.color = COLORS[players.size % COLORS.length];

        const spawnPoints = [
            { x: 300, y: 400 },
            { x: 900, y: 400 },
            { x: 600, y: 150 },
            { x: 150, y: 250 }
        ];
        const spawn = spawnPoints[players.size % spawnPoints.length];

        this.x = spawn.x;
        this.y = spawn.y;
        this.vx = 0;
        this.vy = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;

        this.facing = 1;
        this.grounded = false;
        this.jumpCount = 0;
        this.maxJumps = 2;

        this.damage = 0;
        this.lives = 3;
        this.kills = 0;

        this.isAttacking = false;
        this.attackTimer = 0;
        this.lastAttackTime = 0;
        this.chargeStart = 0;
        this.isCharging = false;

        this.input = {
            left: false,
            right: false,
            up: false,
            down: false,
            attack: false,
            jump: false
        };

        this.lastInput = { ...this.input };
        this.lastHitBy = null;
    }

    fullReset(spawnIndex) {
        const spawnPoints = [
            { x: 300, y: 400 },
            { x: 900, y: 400 },
            { x: 600, y: 150 },
            { x: 150, y: 250 }
        ];
        const spawn = spawnPoints[spawnIndex % spawnPoints.length];

        this.x = spawn.x;
        this.y = spawn.y;
        this.vx = 0;
        this.vy = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;
        this.grounded = false;
        this.jumpCount = 0;
        this.facing = 1;
        this.damage = 0;
        this.lives = 3;
        this.kills = 0;
        this.isAttacking = false;
        this.attackTimer = 0;
        this.lastAttackTime = 0;
        this.chargeStart = 0;
        this.isCharging = false;

        this.input = {
            left: false,
            right: false,
            up: false,
            down: false,
            attack: false,
            jump: false
        };
        this.lastInput = { ...this.input };
        this.lastHitBy = null;
    }

    update(deltaTime, allPlayers) {
        if (this.input.left) {
            this.vx -= PLAYER_CONFIG.speed * 0.15;
            this.facing = -1;
        }
        if (this.input.right) {
            this.vx += PLAYER_CONFIG.speed * 0.15;
            this.facing = 1;
        }

        if (this.input.jump && !this.lastInput.jump) {
            if (this.grounded || this.jumpCount < this.maxJumps) {
                this.vy = PLAYER_CONFIG.jumpForce;
                this.jumpCount++;
                this.grounded = false;
            }
        }

        if (this.input.down && !this.grounded) {
            this.vy += PLAYER_CONFIG.gravity * 0.5;
        }

        if (this.input.attack && !this.isCharging && !this.isAttacking) {
            this.isCharging = true;
            this.chargeStart = Date.now();
        }

        if (!this.input.attack && this.isCharging) {
            this.performAttack(allPlayers);
            this.isCharging = false;
        }

        this.vy += PLAYER_CONFIG.gravity;
        if (this.vy > PLAYER_CONFIG.maxFallSpeed) {
            this.vy = PLAYER_CONFIG.maxFallSpeed;
        }

        const friction = this.grounded ? PLAYER_CONFIG.friction : PLAYER_CONFIG.airFriction;
        this.vx *= friction;

        this.x += this.knockbackX;
        this.y += this.knockbackY;
        this.knockbackX *= PLAYER_CONFIG.knockbackDecay;
        this.knockbackY *= PLAYER_CONFIG.knockbackDecay;

        if (Math.abs(this.knockbackX) < 0.1) this.knockbackX = 0;
        if (Math.abs(this.knockbackY) < 0.1) this.knockbackY = 0;

        if (Math.abs(this.vx) > PLAYER_CONFIG.speed) {
            this.vx = Math.sign(this.vx) * PLAYER_CONFIG.speed;
        }

        if (Math.abs(this.vx) < 0.01) this.vx = 0;

        this.x += this.vx;
        this.y += this.vy;

        this.grounded = false;
        for (const platform of ARENA.platforms) {
            if (this.checkPlatformCollision(platform)) {
                if (this.vy > 0) {
                    const playerBottom = this.y + PLAYER_CONFIG.height;
                    const platformTop = platform.y;

                    if (playerBottom >= platformTop &&
                        playerBottom <= platformTop + 20 &&
                        this.x + PLAYER_CONFIG.width > platform.x &&
                        this.x < platform.x + platform.width) {

                        if (!this.input.down) {
                            this.y = platform.y - PLAYER_CONFIG.height;
                            this.vy = 0;
                            this.grounded = true;
                            this.jumpCount = 0;
                        }
                    }
                }
            }
        }

        if (this.x < ARENA.deathZone.left ||
            this.x > ARENA.deathZone.right ||
            this.y < ARENA.deathZone.top ||
            this.y > ARENA.deathZone.bottom) {
            this.die();
        }

        if (this.isAttacking) {
            this.attackTimer -= deltaTime;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }

        this.lastInput = { ...this.input };
    }

    checkPlatformCollision(platform) {
        return this.x < platform.x + platform.width &&
            this.x + PLAYER_CONFIG.width > platform.x &&
            this.y < platform.y + platform.height &&
            this.y + PLAYER_CONFIG.height > platform.y;
    }

    performAttack(allPlayers) {
        const now = Date.now();
        if (now - this.lastAttackTime < PLAYER_CONFIG.attackCooldown) return;

        this.isAttacking = true;
        this.attackTimer = 200;
        this.lastAttackTime = now;

        const chargeTime = Math.min(now - this.chargeStart, PLAYER_CONFIG.maxCharge);
        const chargeMultiplier = 1 + (chargeTime / PLAYER_CONFIG.maxCharge) *
            (PLAYER_CONFIG.chargeAttackMultiplier - 1);

        const attackX = this.facing === 1
            ? this.x + PLAYER_CONFIG.width
            : this.x - PLAYER_CONFIG.attackRange;
        const attackY = this.y + PLAYER_CONFIG.height * 0.2;
        const attackWidth = PLAYER_CONFIG.attackRange;
        const attackHeight = PLAYER_CONFIG.height * 0.6;

        for (const [id, player] of allPlayers) {
            if (id === this.id) continue;

            if (attackX < player.x + PLAYER_CONFIG.width &&
                attackX + attackWidth > player.x &&
                attackY < player.y + PLAYER_CONFIG.height &&
                attackY + attackHeight > player.y) {

                player.damage += PLAYER_CONFIG.attackDamage * chargeMultiplier;

                const knockbackMultiplier = 1 + (player.damage / 100);
                const baseKnockback = PLAYER_CONFIG.attackKnockback * chargeMultiplier;

                const dx = player.x - this.x;
                const angle = Math.atan2(-0.5, Math.sign(dx) || this.facing);

                player.knockbackX = Math.cos(angle) * baseKnockback * knockbackMultiplier;
                player.knockbackY = Math.sin(angle) * baseKnockback * knockbackMultiplier * 0.8;

                player.lastHitBy = this.id;
            }
        }
    }

    die() {
        this.lives--;

        if (this.lastHitBy && players.has(this.lastHitBy)) {
            players.get(this.lastHitBy).kills++;
        }

        if (this.lives > 0) {
            this.respawn();
        }

        this.lastHitBy = null;
    }

    respawn() {
        const spawnPoints = [
            { x: 300, y: 400 },
            { x: 900, y: 400 },
            { x: 600, y: 150 }
        ];
        const spawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];

        this.x = spawn.x;
        this.y = spawn.y;
        this.vx = 0;
        this.vy = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;
        this.damage = 0;
        this.isAttacking = false;
        this.isCharging = false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            color: this.color,
            x: Math.round(this.x),
            y: Math.round(this.y),
            vx: this.vx,
            vy: this.vy,
            facing: this.facing,
            grounded: this.grounded,
            damage: Math.round(this.damage),
            lives: this.lives,
            kills: this.kills,
            isAttacking: this.isAttacking,
            isCharging: this.isCharging,
            chargeProgress: this.isCharging
                ? Math.min((Date.now() - this.chargeStart) / PLAYER_CONFIG.maxCharge, 1)
                : 0
        };
    }
}

function broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.playerId !== excludeId) {
            client.send(data);
        }
    });
}

function sendTo(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function gameTick() {
    if (gameOverInProgress) return;

    const deltaTime = TICK_INTERVAL;

    for (const [id, player] of players) {
        player.update(deltaTime, players);
    }

    const alivePlayers = Array.from(players.values()).filter(p => p.lives > 0);
    if (players.size > 1 && alivePlayers.length <= 1 && !gameOverInProgress) {
        gameOverInProgress = true;

        const winner = alivePlayers[0];
        broadcast({
            type: 'gameOver',
            winner: winner ? winner.toJSON() : null
        });

        setTimeout(() => {
            let spawnIndex = 0;
            for (const player of players.values()) {
                player.fullReset(spawnIndex);
                spawnIndex++;
            }
            broadcast({ type: 'gameReset' });
            gameOverInProgress = false;
        }, 5000);
    }

    const gameState = {
        type: 'gameState',
        players: Array.from(players.values()).map(p => p.toJSON()),
        timestamp: Date.now()
    };
    broadcast(gameState);
}

wss.on('connection', (ws) => {
    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    ws.playerId = playerId;

    console.log(`Player connected: ${playerId}`);

    sendTo(ws, {
        type: 'init',
        playerId: playerId,
        arena: ARENA,
        playerConfig: PLAYER_CONFIG
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    const player = new Player(playerId, data.name);
                    players.set(playerId, player);

                    sendTo(ws, {
                        type: 'joined',
                        player: player.toJSON()
                    });

                    broadcast({
                        type: 'playerJoined',
                        player: player.toJSON()
                    }, playerId);

                    console.log(`${player.name} joined the game`);
                    break;

                case 'input':
                    const p = players.get(playerId);
                    if (p) {
                        p.input = data.input;
                    }
                    break;
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', () => {
        const player = players.get(playerId);
        if (player) {
            broadcast({
                type: 'playerLeft',
                playerId: playerId,
                playerName: player.name
            });
            players.delete(playerId);
            console.log(`${player.name} left the game`);
        }
    });
});

gameLoop = setInterval(gameTick, TICK_INTERVAL);

// Get local IP addresses for LAN play
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push({ name, address: iface.address });
            }
        }
    }
    return addresses;
}

// Start server on all network interfaces (0.0.0.0)
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPs();

    console.log(`
╔══════════════════════════════════════════════════════════╗
║                    BRAWLER ARENA                         ║
╠══════════════════════════════════════════════════════════╣
║   Server running on:                                     ║
║                                                          ║
║   Localhost:  http://localhost:${PORT}                  ║`);

    localIPs.forEach(ip => {
        console.log(`║   📱 LAN (${ip.name}): http://${ip.address}:${PORT}`);
    });

    console.log(`║                                         
║                                                          ║
╚══════════════════════════════════════════════════════════╝
    `);
});
