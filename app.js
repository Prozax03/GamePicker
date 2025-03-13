// Server-side code (Node.js with Express and Socket.IO)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static('public'));

// Store sessions and their game lists
const sessions = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  let currentSession = null;
  let username = null;

  // Assign username
  socket.on('setUsername', (data) => {
    username = data.username;
    currentSession = data.sessionId;

    if (!sessions[currentSession]) {
      sessions[currentSession] = { creator: socket.id, users: {}, games: [] };
    }

    sessions[currentSession].users[socket.id] = { username, isCreator: socket.id === sessions[currentSession].creator };
    socket.join(currentSession);
    io.to(currentSession).emit('updateUsers', sessions[currentSession].users);
    socket.emit('updateList', sessions[currentSession].games);
  });

  // Add a game
  socket.on('addGame', (game) => {
    if (currentSession && sessions[currentSession] && sessions[currentSession].creator === socket.id) {
      sessions[currentSession].games.push(game);
      io.to(currentSession).emit('updateList', sessions[currentSession].games);
    }
  });

  // Remove a game
  socket.on('removeGame', (gameIndex) => {
    if (currentSession && sessions[currentSession] && sessions[currentSession].creator === socket.id) {
      sessions[currentSession].games.splice(gameIndex, 1);
      io.to(currentSession).emit('updateList', sessions[currentSession].games);
    }
  });

  // Clear game list
  socket.on('clearGames', () => {
    if (currentSession && sessions[currentSession] && sessions[currentSession].creator === socket.id) {
      sessions[currentSession].games = [];
      io.to(currentSession).emit('updateList', sessions[currentSession].games);
    }
  });

  // Pick a random game
  socket.on('pickRandom', () => {
    if (currentSession && sessions[currentSession] && sessions[currentSession].creator === socket.id) {
      const games = sessions[currentSession].games;
      if (games.length > 0) {
        const randomGame = games[Math.floor(Math.random() * games.length)];
        io.to(currentSession).emit('randomPicked', randomGame);
      }
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    if (currentSession && sessions[currentSession]) {
      delete sessions[currentSession].users[socket.id];

      if (sessions[currentSession].creator === socket.id) {
        const remainingUsers = Object.keys(sessions[currentSession].users);
        if (remainingUsers.length > 0) {
          const newCreator = remainingUsers[0];
          sessions[currentSession].creator = newCreator;
          sessions[currentSession].users[newCreator].isCreator = true;
        } else {
          delete sessions[currentSession];
        }
      }

      io.to(currentSession).emit('updateUsers', sessions[currentSession]?.users || {});
    }
  });
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});

// Client-side code (public/index.html)
const htmlContent = `
<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1.0'>
  <title>Game Picker</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      text-align: center;
      margin: 0;
      padding: 0;
      background-color: #f4f4f9;
      color: #333;
    }

    h1 {
      margin-top: 20px;
      font-size: 2.5rem;
      color: #4CAF50;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 20px;
    }

    input, button {
      padding: 10px;
      margin: 10px;
      border: none;
      border-radius: 5px;
      font-size: 1rem;
    }

    input {
      width: 250px;
      border: 1px solid #ccc;
    }

    button {
      background-color: #4CAF50;
      color: white;
      cursor: pointer;
    }

    button:hover {
      background-color: #45a049;
    }

    #game-list {
      margin: 20px auto;
      padding: 0;
      max-width: 400px;
    }

    #game-list li {
      list-style: none;
      margin: 5px 0;
      padding: 10px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 5px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: space-between;
    }

    #game-list li span {
      cursor: pointer;
      color: red;
      font-weight: bold;
    }

    #selected-game {
      margin-top: 20px;
      font-size: 1.5rem;
      font-weight: bold;
      color: #4CAF50;
    }

    .session {
      margin-top: 20px;
    }

    .session input {
      width: 200px;
    }

    #user-list {
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-size: 0.9rem;
      text-align: left;
      min-width: 150px;
    }

    #user-list h3 {
      margin: 0 0 10px;
      font-size: 1rem;
      color: #fff;
    }

    .shake {
      animation: shake 0.5s;
    }

    @keyframes shake {
      0%, 100% {
        transform: translateX(0);
      }
      25% {
        transform: translateX(-5px);
      }
      50% {
        transform: translateX(5px);
      }
      75% {
        transform: translateX(-5px);
      }
    }
  </style>
</head>
<body>
  <h1>Game Picker</h1>
  <div class="container">
    <div class="session">
      <input id='username' type='text' placeholder='Enter your username' />
      <input id='session-id' type='text' placeholder='Enter session ID' />
      <button id='join-session'>Join/Create Session</button>
    </div>
    <div id='main-content' style='display: none;'>
      <input id='game-input' type='text' placeholder='Enter a game' />
      <button id='add-game'>Add Game</button>
      <button id='clear-games'>Clear List</button>
      <button id='pick-random'>Pick Random</button>

      <h2>Game List</h2>
      <ul id='game-list'></ul>

      <h2 id='selected-game'></h2>
    </div>
  </div>

  <div id="user-list">
    <h3>Participants</h3>
  </div>

  <script src='/socket.io/socket.io.js'></script>
  <script>
    const socket = io();

    const usernameInput = document.getElementById('username');
    const sessionIdInput = document.getElementById('session-id');
    const joinSessionButton = document.getElementById('join-session');
    const mainContent = document.getElementById('main-content');

    const gameInput = document.getElementById('game-input');
    const addGameButton = document.getElementById('add-game');
    const clearGamesButton = document.getElementById('clear-games');
    const pickRandomButton = document.getElementById('pick-random');
    const gameList = document.getElementById('game-list');
    const selectedGame = document.getElementById('selected-game');

    const userList = document.getElementById('user-list');

    let currentSession = '';

    // Generate random session ID
    function generateSessionId() {
      return Math.random().toString(36).substring(2, 10);
    }

    // Shake element
    function shakeElement(element) {
      element.classList.add('shake');
      element.style.borderColor = 'red';
      setTimeout(() => {
        element.classList.remove('shake');
        element.style.borderColor = '';
      }, 500);
    }

    // Handle join session button click
    joinSessionButton.addEventListener('click', () => {
      const username = usernameInput.value.trim();
      let sessionId = sessionIdInput.value.trim();

      if (!username) {
        shakeElement(usernameInput);
        return;
      }

      if (!sessionId) {
        sessionId = generateSessionId();
        sessionIdInput.value = sessionId; // Update input field with the generated session ID
      }

      currentSession = sessionId;

      socket.emit('setUsername', { username, sessionId });
      mainContent.style.display = 'block';
      sessionIdInput.disabled = true;
      joinSessionButton.disabled = true;
      usernameInput.disabled = true;
    });

    // Update game list
    socket.on('updateList', (games) => {
      gameList.innerHTML = '';
      games.forEach((game, index) => {
        const li = document.createElement('li');
        li.textContent = game;

        const removeButton = document.createElement('span');
        removeButton.textContent = '❌';
        removeButton.addEventListener('click', () => {
          socket.emit('removeGame', index);
        });

        li.appendChild(removeButton);
        gameList.appendChild(li);
      });
    });

    // Update user list
    socket.on('updateUsers', (users) => {
      userList.innerHTML = '<h3>Participants</h3>';
      for (const userId in users) {
        const user = users[userId];
        const userItem = document.createElement('div');
        userItem.textContent = user.username;
        if (user.isCreator) {
          userItem.textContent += ' ★';
        }
        userList.appendChild(userItem);
      }
    });

    // Display random picked game
    socket.on('randomPicked', (game) => {
      selectedGame.textContent = 'Selected Game: ' + game;
    });

    // Add game to list
    addGameButton.addEventListener('click', () => {
      const game = gameInput.value.trim();
      if (game) {
        socket.emit('addGame', game);
        gameInput.value = '';
      }
    });

    // Clear game list
    clearGamesButton.addEventListener('click', () => {
      socket.emit('clearGames');
    });

    // Pick random game
    pickRandomButton.addEventListener('click', () => {
      socket.emit('pickRandom');
    });
  </script>
</body>
</html>
`;

const fs = require('fs');
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/index.html', htmlContent);
