const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());

const isProd = process.env.NODE_ENV === 'production';
const CLIENT_ORIGINS = isProd
  ? [process.env.SITE_URL || 'https://your-app.onrender.com']
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGINS,
    methods: ['GET', 'POST'],
  },
});

if (isProd) {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/socket.io')) return;
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const waitingUsers = [];
const activeChats = new Map();
const connectedUsers = new Map();

io.on('connection', (socket) => {
  const userId = uuidv4();
  connectedUsers.set(socket.id, { userId, socket });

  socket.emit('connected', { userId });

  socket.on('find-match', (data) => {
    const userData = {
      socketId: socket.id,
      userId,
      interests: data.interests || [],
      gender: data.gender || 'any',
      genderPreference: data.genderPreference || 'any',
      verifiedGender: data.verifiedGender || null,
    };

    connectedUsers.set(socket.id, { ...connectedUsers.get(socket.id), ...userData });

    const match = findMatch(userData);
    if (match) {
      const chatId = uuidv4();
      const room = `chat:${chatId}`;

      const chatData = {
        chatId,
        users: [
          { socketId: socket.id, userId, interests: userData.interests, gender: userData.gender },
          { socketId: match.socketId, userId: match.userId, interests: match.interests, gender: match.gender },
        ],
        messages: [],
      };

      activeChats.set(chatId, chatData);

      socket.join(room);
      io.sockets.sockets.get(match.socketId)?.join(room);

      io.to(socket.id).emit('match-found', { chatId, partner: chatData.users[1] });
      io.to(match.socketId).emit('match-found', { chatId, partner: chatData.users[0] });

      removeFromWaiting(socket.id);
      removeFromWaiting(match.socketId);
    } else {
      waitingUsers.push(userData);
      socket.emit('waiting', { message: 'Looking for a match...' });
    }
  });

  socket.on('cancel-search', () => {
    removeFromWaiting(socket.id);
    socket.emit('search-cancelled');
  });

  socket.on('send-message', (data) => {
    const chat = findChatBySocketId(socket.id);
    if (!chat) return;

    const message = {
      id: uuidv4(),
      senderId: userId,
      text: data.text,
      timestamp: Date.now(),
    };

    chat.messages.push(message);
    io.to(`chat:${chat.chatId}`).emit('receive-message', message);
  });

  socket.on('typing', () => {
    const chat = findChatBySocketId(socket.id);
    if (!chat) return;
    const partner = getPartner(chat, socket.id);
    if (partner) {
      io.to(partner.socketId).emit('partner-typing');
    }
  });

  socket.on('stop-typing', () => {
    const chat = findChatBySocketId(socket.id);
    if (!chat) return;
    const partner = getPartner(chat, socket.id);
    if (partner) {
      io.to(partner.socketId).emit('partner-stop-typing');
    }
  });

  socket.on('next', () => {
    const chat = findChatBySocketId(socket.id);
    if (chat) {
      const partner = getPartner(chat, socket.id);
      if (partner) {
        io.to(partner.socketId).emit('partner-disconnected', { reason: 'partner_skipped' });
        io.sockets.sockets.get(partner.socketId)?.leave(`chat:${chat.chatId}`);
      }
      socket.leave(`chat:${chat.chatId}`);
      activeChats.delete(chat.chatId);
    }
    socket.emit('chat-ended');
  });

  socket.on('report', () => {
    const chat = findChatBySocketId(socket.id);
    if (chat) {
      const partner = getPartner(chat, socket.id);
      if (partner) {
        io.to(partner.socketId).emit('reported');
      }
      io.sockets.sockets.get(partner?.socketId)?.leave(`chat:${chat.chatId}`);
      socket.leave(`chat:${chat.chatId}`);
      activeChats.delete(chat.chatId);
      socket.emit('chat-ended');
      io.to(partner.socketId).emit('chat-ended');
    }
  });

  socket.on('disconnect', () => {
    const chat = findChatBySocketId(socket.id);
    if (chat) {
      const partner = getPartner(chat, socket.id);
      if (partner) {
        io.to(partner.socketId).emit('partner-disconnected', { reason: 'partner_left' });
        io.sockets.sockets.get(partner.socketId)?.leave(`chat:${chat.chatId}`);
      }
      activeChats.delete(chat.chatId);
    }
    removeFromWaiting(socket.id);
    connectedUsers.delete(socket.id);
  });
});

function findMatch(userData) {
  const matchIndex = waitingUsers.findIndex((w) => {
    if (w.socketId === userData.socketId) return false;

    const genderMatch =
      (userData.genderPreference === 'any' || w.gender === userData.genderPreference) &&
      (w.genderPreference === 'any' || userData.gender === w.genderPreference);

    const interestOverlap =
      userData.interests.length === 0 ||
      w.interests.length === 0 ||
      userData.interests.some((i) => w.interests.includes(i));

    return genderMatch && interestOverlap;
  });

  if (matchIndex !== -1) {
    const [match] = waitingUsers.splice(matchIndex, 1);
    return match;
  }
  return null;
}

function removeFromWaiting(socketId) {
  const index = waitingUsers.findIndex((w) => w.socketId === socketId);
  if (index !== -1) waitingUsers.splice(index, 1);
}

function findChatBySocketId(socketId) {
  for (const [, chat] of activeChats) {
    if (chat.users.some((u) => u.socketId === socketId)) return chat;
  }
  return null;
}

function getPartner(chat, socketId) {
  return chat.users.find((u) => u.socketId !== socketId);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
