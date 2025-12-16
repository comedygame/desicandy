/* =========================================
   CONFIGURATION & ASSETS
   ========================================= */
const CONFIG = {
    assets: {
        images: './assets/candies/',
        sounds: './assets/sounds/'
    },
    animationSpeed: 300, // ms
    candyCount: 6 // Total types available in folder
};

const THEME = {
    toggle: () => {
        const current = localStorage.getItem('theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    },
    init: () => {
        const saved = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
    }
};

/* =========================================
   AUDIO MANAGER
   ========================================= */
class SoundManager {
    constructor() {
        this.sounds = {};
        this.bgMusic = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        
        // Define sounds
        const sfx = ['swap', 'combo', 'win', 'lose'];
        // Candy specific sounds
        for(let i=1; i<=CONFIG.candyCount; i++) sfx.push(`candy${i}`);

        sfx.forEach(s => {
            this.sounds[s] = new Audio(`${CONFIG.assets.sounds}${s}.mp3`);
            this.sounds[s].volume = 0.5;
        });

        this.bgMusic = new Audio(`${CONFIG.assets.sounds}bg-music.mp3`);
        this.bgMusic.loop = true;
        this.bgMusic.volume = 0.3;
        
        this.initialized = true;
    }

    play(name) {
        if (!this.initialized) return;
        const sound = this.sounds[name];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(() => {}); // Catch autoplay blocks
        }
    }

    playMusic() {
        if (this.initialized && this.bgMusic.paused) {
            this.bgMusic.play().catch(() => {});
        }
    }
}

const audio = new SoundManager();

/* =========================================
   LEVEL GENERATOR (Procedural 1-1000)
   ========================================= */
class LevelSystem {
    static getLevelConfig(level) {
        // Base Difficulty Settings
        let gridSize = 8;
        let moves = 30;
        let types = 4; // Start with 4 colors
        let target = level * 1500;
        let blockersCount = 0;

        // Difficulty Scaling Logic
        if (level > 20) types = 5;
        if (level > 100) types = 6;

        if (level > 50) {
            moves = Math.max(15, 30 - Math.floor(level / 20)); // Reduce moves
            target = level * 2000;
        }

        if (level > 200) {
            gridSize = 9;
            blockersCount = Math.floor((level - 200) / 10);
            blockersCount = Math.min(blockersCount, 10); // Cap blockers
        }

        if (level > 500) {
            gridSize = 10;
            moves = 20; // Hard cap
            target = level * 3000;
        }

        return {
            level: level,
            rows: gridSize,
            cols: gridSize,
            moves: moves,
            targetScore: target,
            candyTypes: types, // 1 to 6
            blockers: blockersCount
        };
    }
}

/* =========================================
   GAME ENGINE
   ========================================= */
class Game {
    constructor() {
        this.grid = []; // Logical grid
        this.domGrid = document.getElementById('game-grid');
        this.tileSize = 50;
        this.gap = 5;
        
        this.state = 'IDLE'; // IDLE, ANIMATING, OVER
        this.level = 1;
        this.score = 0;
        this.moves = 0;
        this.config = null;
        
        this.selectedTile = null;

        // Bind UI
        this.ui = {
            level: document.getElementById('level-display'),
            moves: document.getElementById('moves-display'),
            target: document.getElementById('target-display'),
            scoreText: document.getElementById('score-text'),
            scoreFill: document.getElementById('score-fill'),
            grid: document.getElementById('game-grid')
        };

        this.attachEvents();
    }

    startLevel(levelNum) {
        audio.init();
        audio.playMusic();

        this.level = levelNum;
        this.config = LevelSystem.getLevelConfig(levelNum);
        
        // Reset State
        this.score = 0;
        this.moves = this.config.moves;
        this.state = 'IDLE';
        this.selectedTile = null;

        // UI Reset
        this.updateUI();
        document.getElementById('modal-overlay').classList.add('hidden');
        document.querySelectorAll('.modal-content').forEach(el => el.classList.add('hidden'));

        // Grid Setup
        this.initGrid();
    }

    initGrid() {
        this.domGrid.innerHTML = '';
        this.grid = [];
        
        // CSS Grid Calculation
        const totalSize = (this.tileSize + this.gap) * this.config.cols + this.gap;
        this.domGrid.style.width = `${totalSize}px`;
        this.domGrid.style.height = `${(this.tileSize + this.gap) * this.config.rows + this.gap}px`;

        // Initialize empty grid
        for (let r = 0; r < this.config.rows; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.config.cols; c++) {
                this.grid[r][c] = null;
            }
        }

        // Fill with random candies (ensuring no initial matches)
        this.fillGrid(true); 

        // Add blockers
        this.addBlockers();
    }

    fillGrid(initial = false) {
        for (let r = 0; r < this.config.rows; r++) {
            for (let c = 0; c < this.config.cols; c++) {
                if (this.grid[r][c] === null) {
                    let type;
                    do {
                        type = Math.floor(Math.random() * this.config.candyTypes) + 1;
                    } while (initial && this.checkMatchAt(r, c, type));
                    
                    this.createTile(r, c, type, initial);
                }
            }
        }
    }

    addBlockers() {
        let placed = 0;
        while(placed < this.config.blockers) {
            let r = Math.floor(Math.random() * this.config.rows);
            let c = Math.floor(Math.random() * this.config.cols);
            if(this.grid[r][c].type !== 'blocker') {
                this.grid[r][c].type = 'blocker';
                this.grid[r][c].element.style.backgroundImage = `url('./assets/candies/blocker.jpg')`;
                this.grid[r][c].element.classList.add('blocker');
                placed++;
            }
        }
    }

    checkMatchAt(r, c, type) {
        // Horizontal Check
        if (c >= 2 && this.grid[r][c-1]?.type === type && this.grid[r][c-2]?.type === type) return true;
        // Vertical Check
        if (r >= 2 && this.grid[r-1][c]?.type === type && this.grid[r-2][c]?.type === type) return true;
        return false;
    }

    createTile(r, c, type, initial) {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.style.backgroundImage = `url('${CONFIG.assets.images}candy${type}.jpg')`;
        tile.dataset.r = r;
        tile.dataset.c = c;
        
        // Position
        this.setTilePos(tile, r, c);

        // Initial animation (drop from top if not setup)
        if (!initial) {
            tile.style.top = `-${this.tileSize}px`;
            setTimeout(() => this.setTilePos(tile, r, c), 50);
        }

        this.domGrid.appendChild(tile);
        this.grid[r][c] = { type: type, element: tile, r: r, c: c };
        
        // Click Event
        tile.addEventListener('mousedown', (e) => this.handleInput(r, c));
        tile.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(r, c); });
    }

    setTilePos(element, r, c) {
        const top = r * (this.tileSize + this.gap) + this.gap;
        const left = c * (this.tileSize + this.gap) + this.gap;
        element.style.top = `${top}px`;
        element.style.left = `${left}px`;
    }

    handleInput(r, c) {
        if (this.state !== 'IDLE') return;
        
        const clicked = this.grid[r][c];
        if (clicked.type === 'blocker') return; // Cannot move blockers

        if (!this.selectedTile) {
            // Select
            this.selectedTile = clicked;
            clicked.element.classList.add('selected');
        } else {
            // Check Adjacency
            const rDiff = Math.abs(this.selectedTile.r - r);
            const cDiff = Math.abs(this.selectedTile.c - c);
            
            if (this.selectedTile === clicked) {
                // Deselect
                this.selectedTile.element.classList.remove('selected');
                this.selectedTile = null;
            } else if (rDiff + cDiff === 1) {
                // Swap
                this.selectedTile.element.classList.remove('selected');
                this.attemptSwap(this.selectedTile, clicked);
                this.selectedTile = null;
            } else {
                // Select new
                this.selectedTile.element.classList.remove('selected');
                this.selectedTile = clicked;
                clicked.element.classList.add('selected');
            }
        }
    }

    async attemptSwap(tile1, tile2) {
        this.state = 'ANIMATING';
        audio.play('swap');

        // Logic Swap
        await this.swapTiles(tile1, tile2);

        // Check Matches
        const matches = this.findMatches();
        
        if (matches.length > 0) {
            this.moves--;
            this.updateUI();
            await this.processMatches(matches);
        } else {
            // Invalid swap, revert
            audio.play('swap'); // Play swap sound again for reverting
            await this.swapTiles(tile1, tile2);
            this.state = 'IDLE';
        }
    }

    async swapTiles(t1, t2) {
        // Swap in Array
        const tempType = t1.type;
        const tempEl = t1.element;
        
        this.grid[t1.r][t1.c] = t2;
        this.grid[t2.r][t2.c] = t1;

        // Update Coordinates inside objects
        const tempR = t1.r; const tempC = t1.c;
        t1.r = t2.r; t1.c = t2.c;
        t2.r = tempR; t2.c = tempC;

        // Visual Move
        this.setTilePos(t1.element, t1.r, t1.c);
        this.setTilePos(t2.element, t2.r, t2.c);

        // Wait for animation
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    findMatches() {
        let matchedSet = new Set();

        // Horizontal
        for (let r = 0; r < this.config.rows; r++) {
            for (let c = 0; c < this.config.cols - 2; c++) {
                let candy = this.grid[r][c];
                if (!candy || candy.type === 'blocker') continue;
                
                let match = [candy];
                while (c + match.length < this.config.cols && 
                       this.grid[r][c + match.length]?.type === candy.type) {
                    match.push(this.grid[r][c + match.length]);
                }

                if (match.length >= 3) {
                    match.forEach(m => matchedSet.add(m));
                    c += match.length - 1;
                }
            }
        }

        // Vertical
        for (let c = 0; c < this.config.cols; c++) {
            for (let r = 0; r < this.config.rows - 2; r++) {
                let candy = this.grid[r][c];
                if (!candy || candy.type === 'blocker') continue;
                
                let match = [candy];
                while (r + match.length < this.config.rows && 
                       this.grid[r + match.length][c]?.type === candy.type) {
                    match.push(this.grid[r + match.length][c]);
                }

                if (match.length >= 3) {
                    match.forEach(m => matchedSet.add(m));
                    r += match.length - 1;
                }
            }
        }

        return Array.from(matchedSet);
    }

    async processMatches(matches) {
        let combo = 1;
        
        while (matches.length > 0) {
            // 1. Remove Matches
            for (let tile of matches) {
                // Visual Pop
                tile.element.classList.add('matched');
                
                // Play specific sound for this candy type
                audio.play(`candy${tile.type}`);

                // Update Score
                this.score += 10 * combo;
                
                // Remove from Grid Logic
                this.grid[tile.r][tile.c] = null;
            }

            if (matches.length > 4 || combo > 1) {
                audio.play('combo');
                this.showComboText(combo);
            }

            this.updateUI();
            
            // Wait for Pop animation
            await new Promise(resolve => setTimeout(resolve, 300));

            // Remove elements from DOM
            matches.forEach(m => m.element.remove());

            // 2. Gravity (Drop Down)
            await this.applyGravity();

            // 3. Fill Empty
            this.fillGrid(); // Creates new tiles in null spots
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait for drop

            // 4. Check for Cascading Matches
            matches = this.findMatches();
            combo++;
        }

        this.checkGameStatus();
        this.state = 'IDLE';
    }

    async applyGravity() {
        let moved = false;
        
        for (let c = 0; c < this.config.cols; c++) {
            for (let r = this.config.rows - 1; r >= 0; r--) {
                if (this.grid[r][c] === null) {
                    // Find nearest tile above
                    for (let k = r - 1; k >= 0; k--) {
                        if (this.grid[k][c] !== null && this.grid[k][c].type !== 'blocker') {
                            // Move logic
                            this.grid[r][c] = this.grid[k][c];
                            this.grid[k][c] = null;
                            
                            // Update object data
                            this.grid[r][c].r = r;
                            
                            // Visual Move
                            this.setTilePos(this.grid[r][c].element, r, c);
                            
                            moved = true;
                            break;
                        } else if (this.grid[k][c] !== null && this.grid[k][c].type === 'blocker') {
                            // Hit a blocker, stop looking above for this column segment
                            break; 
                        }
                    }
                }
            }
        }

        if (moved) await new Promise(resolve => setTimeout(resolve, 300));
    }

    showComboText(combo) {
        if (combo < 2) return;
        const el = document.getElementById('combo-text');
        el.innerText = `COMBO x${combo}!`;
        el.classList.remove('hidden');
        // Reset animation
        el.style.animation = 'none';
        el.offsetHeight; /* trigger reflow */
        el.style.animation = null; 
        
        setTimeout(() => el.classList.add('hidden'), 1000);
    }

    updateUI() {
        this.ui.level.innerText = this.level;
        this.ui.moves.innerText = this.moves;
        this.ui.target.innerText = this.config.targetScore;
        
        // Score Animation
        let currentDisplay = parseInt(this.ui.scoreText.innerText);
        if (currentDisplay !== this.score) {
            this.animateValue(this.ui.scoreText, currentDisplay, this.score, 500);
        }

        // Bar Fill
        const percentage = Math.min(100, (this.score / this.config.targetScore) * 100);
        this.ui.scoreFill.style.width = `${percentage}%`;
    }

    animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    checkGameStatus() {
        if (this.score >= this.config.targetScore) {
            this.state = 'OVER';
            audio.play('win');
            this.showModal('win-modal');
            document.getElementById('win-score').innerText = this.score;
        } else if (this.moves <= 0) {
            this.state = 'OVER';
            audio.play('lose');
            this.showModal('lose-modal');
        }
    }

    showModal(id) {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById(id).classList.remove('hidden');
    }

    attachEvents() {
        document.getElementById('theme-toggle').addEventListener('click', THEME.toggle);
        
        document.getElementById('btn-start').addEventListener('click', () => this.startLevel(1));
        document.getElementById('btn-next').addEventListener('click', () => this.startLevel(this.level + 1));
        document.getElementById('btn-retry').addEventListener('click', () => this.startLevel(this.level));
    }
}

/* =========================================
   INITIALIZATION
   ========================================= */
window.onload = () => {
    THEME.init();
    const game = new Game();
    
    // Show Start Modal
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('start-modal').classList.remove('hidden');
};