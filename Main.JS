const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Game State (Data)
let player = {
    x: 50,
    y: 50,
    size: 30,
    speed: 5
};

let keys = {};

// Listen for keyboard input
window.addEventListener("keydown", (e) => keys[e.key] = true);
window.addEventListener("keyup", (e) => keys[e.key] = false);

// Update game logic
function update() {
    if (keys["ArrowRight"] && player.x < canvas.width - player.size) player.x += player.speed;
    if (keys["ArrowLeft"] && player.x > 0) player.x -= player.speed;
    if (keys["ArrowUp"] && player.y > 0) player.y -= player.speed;
    if (keys["ArrowDown"] && player.y < canvas.height - player.size) player.y += player.speed;
}

// Draw everything on the screen
function draw() {
    // Clear the canvas from the previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the player (a blue square)
    ctx.fillStyle = "blue";
    ctx.fillRect(player.x, player.y, player.size, player.size);
}

// The Game Loop
function gameLoop() {
    update();
    draw();
    // Tells the browser to run this loop smoothly at ~60 frames per second
    requestAnimationFrame(gameLoop);
}

// Start the game
gameLoop();
