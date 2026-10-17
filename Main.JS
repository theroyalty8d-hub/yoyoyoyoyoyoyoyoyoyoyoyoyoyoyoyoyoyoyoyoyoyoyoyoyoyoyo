const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Game State (Data)
let player1 = {
    x: 50,
    y: 50,
    size: 50,
    speed: 2
};

let player2 = {
    x: 50,
    y: 250,
    size: 30,
    speed: 5
}

let player3 = {
    x: 50,
    y: 450,
    size: 25,
    speed: 3
}

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
    ctx.fillStyle = "red";
    ctx.fillRect(player1.x, player1.y, player1.size, player1.size);
    ctx.fillStyle = "green";
    ctx.fillRect(player2.x, player2.y, player2.size, player2.size);
    ctx.fillStyle = "yellow";
    ctx.fillRect(player3.x, player3.y, player3.size, player3.size);
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
