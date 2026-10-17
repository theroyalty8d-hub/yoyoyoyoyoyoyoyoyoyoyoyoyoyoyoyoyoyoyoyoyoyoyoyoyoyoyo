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
    size: 40,
    speed: 5
}

let player3 = {
    x: 50,
    y: 450,
    size: 30,
    speed: 3
}

let keys = {};
let Player = 1

// Listen for keyboard input
window.addEventListener("keydown", (e) => keys[e.key] = true);
window.addEventListener("keyup", (e) => keys[e.key] = false);

// Update game logic
function update(player) {
    if (keys["1"]) Player = 1;
    if (keys["2"]) Player = 2;
    if (keys["3"]) Player = 3;

    if (player === 1) {

        if (keys["ArrowRight"] && player1.x < canvas.width - player1.size) player1.x += player1.speed;
        if (keys["ArrowLeft"] && player1.x > 0) player1.x -= player1.speed;
        if (keys["ArrowUp"] && player1.y > 0) player1.y -= player1.speed;
        if (keys["ArrowDown"] && player1.y < canvas.height - player1.size) player1.y += player1.speed;
    }
    else if (player === 2) {
        if (keys["ArrowRight"] && player2.x < canvas.width - player2.size) player2.x += player2.speed;
        if (keys["ArrowLeft"] && player2.x > 0) player2.x -= player2.speed;
        if (keys["ArrowUp"] && player2.y > 0) player2.y -= player2.speed;
        if (keys["ArrowDown"] && player2.y < canvas.height - player2.size) player2.y += player2.speed;
    }
    else if (player === 3) {
        if (keys["ArrowRight"] && player3.x < canvas.width - player3.size) player3.x += player3.speed;
        if (keys["ArrowLeft"] && player3.x > 0) player3.x -= player3.speed;
        if (keys["ArrowUp"] && player3.y > 0) player3.y -= player3.speed;
        if (keys["ArrowDown"] && player3.y < canvas.height - player3.size) player3.y += player3.speed;
    }
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
    update(Player);
    draw();
    // Tells the browser to run this loop smoothly at ~60 frames per second
    requestAnimationFrame(gameLoop);
}

// Start the game
gameLoop();
