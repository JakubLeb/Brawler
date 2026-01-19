// ================================
// BRAWLER ARENA - Client Game Engine
// ================================

class BrawlerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // WebSocket
        this.ws = null;
        this.playerId = null;
        this.playerName = '';

        // Game state
        this.arena = null;
        this.playerConfig = null;
        this.players = new Map();
        this.localPlayer = null;

        // Input state
        this.input = {
            left: false,
            right: false,
            up: false,
            down: false,
            attack: false,
            jump: false
        };
        this.lastSentInput = null;

        // Rendering
        this.particles = [];
        this.maxParticles = 50;
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.lastFrameTime = 0;

        // Attack animation state
        this.attackAnimations = new Map();

        // Mobile detection
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || window.innerWidth <= 900;
        this.touchControls = null;
        this.activeTouches = new Map();

        // UI Elements
        this.menuScreen = document.getElementById('menu-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.statusDot = document.getElementById('statusDot');
        this.connectionText = document.getElementById('connectionText');
        this.scoreboardList = document.getElementById('scoreboardList');
        this.gameOverModal = document.getElementById('gameOverModal');

        // Bind methods
        this.gameLoop = this.gameLoop.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);

        // Initialize
        this.setupEventListeners();

        // Handle resize for mobile
        window.addEventListener('resize', () => this.handleResize());
        this.handleResize();
    }

    handleResize() {
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || window.innerWidth <= 900;

        if (this.isMobile && this.gameScreen.classList.contains('active')) {
            this.showMobileControls();
        }
    }

    setupEventListeners() {
        // Menu
        document.getElementById('playBtn').addEventListener('click', () => this.startGame());
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startGame();
        });

        // Input
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch events
        document.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    }

    showMobileControls() {
        if (this.touchControls) {
            this.touchControls.remove();
        }

        this.touchControls = document.createElement('div');
        this.touchControls.id = 'mobile-controls';
        this.touchControls.innerHTML = `
            <div class="control-zone left-zone">
                <div class="dpad">
                    <button class="dpad-btn up" data-action="up">▲</button>
                    <div class="dpad-middle">
                        <button class="dpad-btn left" data-action="left">◄</button>
                        <button class="dpad-btn right" data-action="right">►</button>
                    </div>
                    <button class="dpad-btn down" data-action="down">▼</button>
                </div>
            </div>
            <div class="control-zone right-zone">
                <button class="action-btn attack-btn" data-action="attack">ATAK</button>
            </div>
        `;

        document.body.appendChild(this.touchControls);
    }

    handleTouchStart(e) {
        if (!this.isMobile) return;

        for (const touch of e.changedTouches) {
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target && target.dataset.action) {
                e.preventDefault();
                const action = target.dataset.action;
                this.activeTouches.set(touch.identifier, action);
                target.classList.add('active');

                if (action === 'left') this.input.left = true;
                else if (action === 'right') this.input.right = true;
                else if (action === 'up') { this.input.up = true; this.input.jump = true; }
                else if (action === 'down') this.input.down = true;
                else if (action === 'attack') this.input.attack = true;

                this.sendInput();
            }
        }
    }

    handleTouchEnd(e) {
        if (!this.isMobile) return;

        for (const touch of e.changedTouches) {
            const action = this.activeTouches.get(touch.identifier);
            if (action) {
                e.preventDefault();
                this.activeTouches.delete(touch.identifier);

                const btn = document.querySelector(`[data-action="${action}"]`);
                if (btn) btn.classList.remove('active');

                if (action === 'left') this.input.left = false;
                else if (action === 'right') this.input.right = false;
                else if (action === 'up') { this.input.up = false; this.input.jump = false; }
                else if (action === 'down') this.input.down = false;
                else if (action === 'attack') this.input.attack = false;

                this.sendInput();
            }
        }
    }

    handleTouchMove(e) {
        if (!this.isMobile) return;

        for (const touch of e.changedTouches) {
            const oldAction = this.activeTouches.get(touch.identifier);
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            const newAction = target?.dataset?.action;

            if (oldAction && oldAction !== newAction) {
                const oldBtn = document.querySelector(`[data-action="${oldAction}"]`);
                if (oldBtn) oldBtn.classList.remove('active');

                if (oldAction === 'left') this.input.left = false;
                else if (oldAction === 'right') this.input.right = false;
                else if (oldAction === 'up') { this.input.up = false; this.input.jump = false; }
                else if (oldAction === 'down') this.input.down = false;
                else if (oldAction === 'attack') this.input.attack = false;

                if (newAction) {
                    e.preventDefault();
                    this.activeTouches.set(touch.identifier, newAction);
                    const newBtn = document.querySelector(`[data-action="${newAction}"]`);
                    if (newBtn) newBtn.classList.add('active');

                    if (newAction === 'left') this.input.left = true;
                    else if (newAction === 'right') this.input.right = true;
                    else if (newAction === 'up') { this.input.up = true; this.input.jump = true; }
                    else if (newAction === 'down') this.input.down = true;
                    else if (newAction === 'attack') this.input.attack = true;
                } else {
                    this.activeTouches.delete(touch.identifier);
                }

                this.sendInput();
            }
        }
    }

    startGame() {
        this.playerName = document.getElementById('playerName').value.trim() ||
            `Gracz${Math.floor(Math.random() * 1000)}`;

        this.menuScreen.classList.add('hidden');
        this.gameScreen.classList.add('active');

        if (this.isMobile) {
            this.showMobileControls();
        }

        this.connect();
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.updateConnectionStatus(true);
            console.log('Connected to server');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.ws.onclose = () => {
            this.updateConnectionStatus(false);
            console.log('Disconnected from server');
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'init':
                this.playerId = data.playerId;
                this.arena = data.arena;
                this.playerConfig = data.playerConfig;
                this.send({
                    type: 'join',
                    name: this.playerName
                });
                break;

            case 'joined':
                this.localPlayer = data.player;
                requestAnimationFrame(this.gameLoop);
                break;

            case 'gameState':
                this.updateGameState(data.players);
                break;

            case 'playerJoined':
                this.addNotification(`${data.player.name} dołączył do gry!`, '#4ECDC4');
                break;

            case 'playerLeft':
                this.addNotification(`${data.playerName} opuścił grę`, '#FF6B6B');
                break;

            case 'gameOver':
                this.showGameOver(data.winner);
                break;

            case 'gameReset':
                this.hideGameOver();
                break;
        }
    }

    updateGameState(playersData) {
        const currentIds = new Set();

        for (const playerData of playersData) {
            currentIds.add(playerData.id);

            const existing = this.players.get(playerData.id);
            if (existing) {
                const damageDiff = playerData.damage - existing.serverData.damage;
                if (damageDiff >= 5) {
                    this.spawnHitParticles(playerData.x + 25, playerData.y + 35, playerData.color);
                    this.addScreenShake(Math.min(damageDiff / 3, 8));
                }

                if (playerData.isAttacking && !existing.serverData.isAttacking) {
                    this.attackAnimations.set(playerData.id, {
                        startTime: Date.now(),
                        duration: 200
                    });
                }

                existing.targetX = playerData.x;
                existing.targetY = playerData.y;
                existing.serverData = playerData;
            } else {
                this.players.set(playerData.id, {
                    ...playerData,
                    renderX: playerData.x,
                    renderY: playerData.y,
                    targetX: playerData.x,
                    targetY: playerData.y,
                    serverData: playerData
                });
            }

            if (playerData.id === this.playerId) {
                this.localPlayer = playerData;
            }
        }

        for (const [id] of this.players) {
            if (!currentIds.has(id)) {
                this.players.delete(id);
                this.attackAnimations.delete(id);
            }
        }

        this.updateScoreboard();
    }

    updateScoreboard() {
        const sortedPlayers = Array.from(this.players.values())
            .sort((a, b) => b.serverData.kills - a.serverData.kills);

        this.scoreboardList.innerHTML = sortedPlayers.map(p => {
            const data = p.serverData;
            const isLocal = data.id === this.playerId;
            return `
                <li class="scoreboard-item" style="${isLocal ? 'background: rgba(0,255,136,0.1);' : ''}">
                    <span class="player-name">
                        <span class="player-color" style="background: ${data.color}"></span>
                        ${data.name}
                    </span>
                    <span class="player-score">
                        ${data.kills}K / ${data.lives}❤
                    </span>
                </li>
            `;
        }).join('');
    }

    handleKeyDown(e) {
        if (e.repeat) return;

        switch (e.code) {
            case 'KeyA':
                this.input.left = true;
                break;
            case 'KeyD':
                this.input.right = true;
                break;
            case 'KeyW':
                this.input.up = true;
                this.input.jump = true;
                break;
            case 'KeyS':
                this.input.down = true;
                break;
            case 'Space':
                this.input.attack = true;
                e.preventDefault();
                break;
            case 'KeyJ':
                this.input.attack = true;
                break;
        }

        this.sendInput();
    }

    handleKeyUp(e) {
        switch (e.code) {
            case 'KeyA':
                this.input.left = false;
                break;
            case 'KeyD':
                this.input.right = false;
                break;
            case 'KeyW':
                this.input.up = false;
                this.input.jump = false;
                break;
            case 'KeyS':
                this.input.down = false;
                break;
            case 'Space':
                this.input.attack = false;
                break;
            case 'KeyJ':
                this.input.attack = false;
                break;
        }

        this.sendInput();
    }

    handleMouseDown(e) {
        if (e.button === 0) {
            this.input.attack = true;
            this.sendInput();
        }
    }

    handleMouseUp(e) {
        if (e.button === 0) {
            this.input.attack = false;
            this.sendInput();
        }
    }

    sendInput() {
        const inputStr = JSON.stringify(this.input);
        if (inputStr !== this.lastSentInput) {
            this.send({ type: 'input', input: this.input });
            this.lastSentInput = inputStr;
        }
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    updateConnectionStatus(connected) {
        this.statusDot.classList.toggle('connected', connected);
        this.connectionText.textContent = connected ? 'Połączono' : 'Rozłączono';
    }

    gameLoop(timestamp) {
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop);
    }

    update(deltaTime) {
        for (const [id, player] of this.players) {
            const lerp = 0.3;
            player.renderX += (player.targetX - player.renderX) * lerp;
            player.renderY += (player.targetY - player.renderY) * lerp;
        }

        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3;
            p.life -= deltaTime;
            p.alpha = p.life / p.maxLife;
            return p.life > 0;
        });

        if (this.screenShake.intensity > 0) {
            this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
            this.screenShake.intensity *= 0.9;
            if (this.screenShake.intensity < 0.5) {
                this.screenShake.intensity = 0;
                this.screenShake.x = 0;
                this.screenShake.y = 0;
            }
        }

        const now = Date.now();
        for (const [id, anim] of this.attackAnimations) {
            if (now - anim.startTime > anim.duration + 100) {
                this.attackAnimations.delete(id);
            }
        }
    }

    render() {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(this.screenShake.x, this.screenShake.y);

        this.drawBackground();

        if (this.arena) {
            this.drawPlatforms();
        }

        for (const [id, player] of this.players) {
            this.drawPlayer(player);
        }

        this.drawParticles();
        this.drawDeathZoneIndicator();

        ctx.restore();
    }

    drawBackground() {
        const ctx = this.ctx;

        const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(0.5, '#16213e');
        gradient.addColorStop(1, '#0f0f23');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.strokeStyle = 'rgba(0, 255, 136, 0.05)';
        ctx.lineWidth = 1;

        for (let x = 0; x < this.canvas.width; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
        }

        for (let y = 0; y < this.canvas.height; y += 50) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }
    }

    drawPlatforms() {
        const ctx = this.ctx;

        for (const platform of this.arena.platforms) {
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 15;

            const gradient = ctx.createLinearGradient(
                platform.x, platform.y,
                platform.x, platform.y + platform.height
            );

            if (platform.type === 'main') {
                gradient.addColorStop(0, '#00ff88');
                gradient.addColorStop(1, '#00aa55');
            } else if (platform.type === 'top') {
                gradient.addColorStop(0, '#00aaff');
                gradient.addColorStop(1, '#0066aa');
            } else {
                gradient.addColorStop(0, '#ff00aa');
                gradient.addColorStop(1, '#aa0066');
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(platform.x, platform.y, platform.width, platform.height);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(platform.x, platform.y, platform.width, 3);

            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);
        }
    }

    drawPlayer(player) {
        const ctx = this.ctx;
        const data = player.serverData;
        const x = player.renderX;
        const y = player.renderY;
        const w = this.playerConfig?.width || 50;
        const h = this.playerConfig?.height || 70;

        if (data.lives <= 0) return;

        ctx.save();

        ctx.shadowColor = data.color;
        ctx.shadowBlur = data.isAttacking ? 30 : 15;

        const bodyGradient = ctx.createLinearGradient(x, y, x, y + h);
        bodyGradient.addColorStop(0, data.color);
        bodyGradient.addColorStop(1, this.darkenColor(data.color, 40));
        ctx.fillStyle = bodyGradient;

        this.roundRect(ctx, x, y, w, h, 8);
        ctx.fill();

        ctx.shadowBlur = 0;
        const eyeX = data.facing === 1 ? x + w - 18 : x + 8;
        const eyeY = y + 20;

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 6, 0, Math.PI * 2);
        ctx.arc(eyeX + (data.facing === 1 ? -12 : 12), eyeY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(eyeX + data.facing * 2, eyeY, 3, 0, Math.PI * 2);
        ctx.arc(eyeX + (data.facing === 1 ? -12 : 12) + data.facing * 2, eyeY, 3, 0, Math.PI * 2);
        ctx.fill();

        if (data.isCharging) {
            const chargeWidth = w * data.chargeProgress;
            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            ctx.fillRect(x, y - 10, chargeWidth, 5);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y - 10, w, 5);
        }

        if (data.isAttacking) {
            this.drawAttackArm(ctx, x, y, w, h, data.facing, data.color, data.id);
        }

        ctx.shadowBlur = 0;
        ctx.font = 'bold 14px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(data.name, x + w/2, y - 25);

        const damageColor = this.getDamageColor(data.damage);
        ctx.font = 'bold 18px Orbitron';
        ctx.fillStyle = damageColor;
        ctx.fillText(`${Math.round(data.damage)}%`, x + w/2, y - 8);

        ctx.font = '12px sans-serif';
        for (let i = 0; i < data.lives; i++) {
            ctx.fillText('❤', x + 8 + i * 15, y + h + 15);
        }

        ctx.restore();
    }

    drawAttackArm(ctx, x, y, w, h, facing, color, playerId) {
        const anim = this.attackAnimations.get(playerId);
        let progress = 1;

        if (anim) {
            const elapsed = Date.now() - anim.startTime;
            progress = Math.min(elapsed / anim.duration, 1);
        }

        let extension;
        if (progress < 0.3) {
            extension = progress / 0.3;
        } else {
            extension = 1 - ((progress - 0.3) / 0.7);
        }

        extension = Math.sin(extension * Math.PI / 2);

        const armLength = 50 * extension;
        const fistSize = 18 + 8 * extension;

        const shoulderY = y + h * 0.35;
        const armStartX = facing === 1 ? x + w : x;
        const armEndX = armStartX + (armLength * facing);
        const fistX = armEndX + (fistSize/2 * facing);

        ctx.save();

        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 15 * extension;

        const armWidth = 12;
        ctx.fillStyle = this.lightenColor(color, 20);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;

        if (armLength > 5) {
            ctx.beginPath();
            ctx.roundRect(
                facing === 1 ? armStartX : armEndX,
                shoulderY - armWidth/2,
                Math.abs(armLength),
                armWidth,
                4
            );
            ctx.fill();
            ctx.stroke();
        }

        if (extension > 0.1) {
            ctx.shadowColor = extension > 0.5 ? '#ff8800' : '#ffff00';
            ctx.shadowBlur = 20 * extension;

            const fistGradient = ctx.createRadialGradient(
                fistX, shoulderY, 0,
                fistX, shoulderY, fistSize
            );
            fistGradient.addColorStop(0, '#ffffff');
            fistGradient.addColorStop(0.3, this.lightenColor(color, 40));
            fistGradient.addColorStop(1, color);

            ctx.fillStyle = fistGradient;

            ctx.beginPath();
            this.roundRect(
                ctx,
                fistX - fistSize/2,
                shoulderY - fistSize/2,
                fistSize,
                fistSize,
                6
            );
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            const knuckleY = shoulderY - fistSize/4;
            for (let i = 0; i < 3; i++) {
                const knuckleX = fistX - fistSize/3 + (i * fistSize/3);
                ctx.beginPath();
                ctx.arc(knuckleX, knuckleY, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            if (extension > 0.8) {
                ctx.strokeStyle = `rgba(255, 255, 0, ${extension - 0.8})`;
                ctx.lineWidth = 2;

                for (let i = 0; i < 3; i++) {
                    const angle = (facing === 1 ? 0 : Math.PI) + (i - 1) * 0.3;
                    const lineStart = fistSize/2 + 5;
                    const lineEnd = fistSize/2 + 15 + Math.random() * 10;

                    ctx.beginPath();
                    ctx.moveTo(
                        fistX + Math.cos(angle) * lineStart,
                        shoulderY + Math.sin(angle) * lineStart
                    );
                    ctx.lineTo(
                        fistX + Math.cos(angle) * lineEnd,
                        shoulderY + Math.sin(angle) * lineEnd
                    );
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }

    drawParticles() {
        const ctx = this.ctx;

        for (const p of this.particles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }

    drawDeathZoneIndicator() {
        if (!this.arena) return;

        const ctx = this.ctx;
        const dz = this.arena.deathZone;

        const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.5;
        ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);

        if (dz.left > -50) {
            ctx.beginPath();
            ctx.moveTo(dz.left, 0);
            ctx.lineTo(dz.left, this.canvas.height);
            ctx.stroke();
        }

        if (dz.right < this.canvas.width + 50) {
            ctx.beginPath();
            ctx.moveTo(dz.right, 0);
            ctx.lineTo(dz.right, this.canvas.height);
            ctx.stroke();
        }

        ctx.setLineDash([]);
    }

    spawnHitParticles(x, y, color) {
        const particlesToSpawn = Math.min(8, this.maxParticles - this.particles.length);
        if (particlesToSpawn <= 0) return;

        for (let i = 0; i < particlesToSpawn; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;

            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                size: 2 + Math.random() * 3,
                color: color,
                life: 300 + Math.random() * 200,
                maxLife: 500,
                alpha: 1
            });
        }
    }

    addScreenShake(intensity) {
        this.screenShake.intensity = Math.max(this.screenShake.intensity, intensity);
    }

    addNotification(text, color) {
        console.log(`[Notification] ${text}`);
    }

    showGameOver(winner) {
        if (winner) {
            document.getElementById('winnerName').textContent = winner.name;
            document.getElementById('winnerKills').textContent = winner.kills;
        } else {
            document.getElementById('winnerName').textContent = 'Remis!';
            document.getElementById('winnerKills').textContent = '-';
        }
        this.gameOverModal.classList.add('active');
    }

    hideGameOver() {
        this.gameOverModal.classList.remove('active');
    }

    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    darkenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max((num >> 16) - amt, 0);
        const G = Math.max((num >> 8 & 0x00FF) - amt, 0);
        const B = Math.max((num & 0x0000FF) - amt, 0);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min((num >> 16) + amt, 255);
        const G = Math.min((num >> 8 & 0x00FF) + amt, 255);
        const B = Math.min((num & 0x0000FF) + amt, 255);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    }

    getDamageColor(damage) {
        if (damage < 50) return '#ffffff';
        if (damage < 100) return '#ffff00';
        if (damage < 150) return '#ff8800';
        return '#ff0000';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new BrawlerGame();
});