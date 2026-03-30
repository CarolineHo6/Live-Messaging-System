require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const xss = require('xss');

const app = express();
app.use(helmet());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);
let db;

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
});

app.use(sessionMiddleware);
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts, please try again later.' }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { error: 'Too many requests, please slow down.' }
});

app.use('/api/', apiLimiter);

async function connectDB() {
    await client.connect();
    db = client.db('chat_app');
    console.log('Connected to MongoDB');
}

function sanitize(str) {
    if (typeof str !== 'string') return str;
    return xss(str, { whiteList: {} });
}

function sanitizeInput(obj) {
    const sanitized = {};
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            sanitized[key] = sanitize(obj[key]);
        } else {
            sanitized[key] = obj[key];
        }
    }
    return sanitized;
}

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}

app.post('/signup', authLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await db.collection('users').findOne({ username });
    if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = { username, password: hashedPassword, createdAt: new Date() };
    await db.collection('users').insertOne(user);

    req.session.userId = username;
    res.json({ success: true, username });
});

app.post('/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;

    const user = await db.collection('users').findOne({ username });
    if (!user) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        return res.status(400).json({ error: 'Invalid credentials' });
    }

    req.session.userId = username;
    res.json({ success: true, username });
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/me', (req, res) => {
    if (req.session.userId) {
        res.json({ username: req.session.userId });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

app.get('/users', requireAuth, async (req, res) => {
    const users = await db.collection('users').find().toArray();
    res.json(users.map(u => u.username));
});

app.post('/rooms', requireAuth, async (req, res) => {
    const { name, members, isDirect } = req.body;
    const username = req.session.userId;
    const sanitized = sanitizeInput({ name, members, isDirect });

    if (sanitized.isDirect && sanitized.members && sanitized.members.length === 2) {
        const currentUser = sanitized.members[0];
        const otherUser = sanitize(sanitized.members[1]);
        
        if (currentUser !== username) {
            return res.status(403).json({ error: 'Cannot create DM for another user' });
        }

        const existing = await db.collection('rooms').findOne({ 
            isDirect: true, 
            members: { $all: [currentUser, otherUser] } 
        });
        if (existing) {
            return res.json(existing);
        }
        const room = { name: otherUser, members: [currentUser, otherUser], isDirect: true, createdAt: new Date() };
        await db.collection('rooms').insertOne(room);

        io.emit('room-created', room);

        return res.json(room);
    }

    const sanitizedName = sanitize(sanitized.name || '');
    if (!sanitizedName) {
        return res.status(400).json({ error: 'Room name required' });
    }

    const existing = await db.collection('rooms').findOne({ name: sanitizedName });
    if (existing) {
        return res.json(existing);
    }

    const room = { name: sanitizedName, members: [username], isDirect: false, createdAt: new Date() };
    await db.collection('rooms').insertOne(room);

    io.emit('room-created', room);

    res.json(room);
});

app.get('/rooms', requireAuth, async (req, res) => {
    const username = req.session.userId;
    const rooms = await db.collection('rooms').find().toArray();

    const hiddenChats = await db.collection('hidden_chats').findOne({ username });
    const hiddenRoomNames = hiddenChats ? hiddenChats.rooms : [];

    let userRooms = rooms.filter(r =>
        r.isDirect || (r.members && r.members.includes(username))
    );

    userRooms = userRooms.filter(r => !hiddenRoomNames.includes(r.name));

    res.json(userRooms);
});

app.post('/rooms/:roomName/join', requireAuth, async (req, res) => {
    const { roomName } = req.params;
    const username = req.session.userId;

    const room = await db.collection('rooms').findOne({ name: sanitize(roomName) });
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.members.includes(username)) {
        await db.collection('rooms').updateOne(
            { name: sanitize(roomName) },
            { $addToSet: { members: username } }
        );
    }

    res.json({ success: true });
});

app.post('/hide-chat', requireAuth, async (req, res) => {
    const { room } = req.body;
    const username = req.session.userId;

    if (!room) {
        return res.status(400).json({ error: 'Room required' });
    }

    await db.collection('hidden_chats').updateOne(
        { username },
        { $addToSet: { rooms: sanitize(room) } },
        { upsert: true }
    );

    res.sendStatus(200);
});

app.post('/unhide-chat', requireAuth, async (req, res) => {
    const { room } = req.body;
    const username = req.session.userId;

    if (!room) {
        return res.status(400).json({ error: 'Room required' });
    }

    await db.collection('hidden_chats').updateOne(
        { username },
        { $pull: { rooms: sanitize(room) } }
    );

    res.sendStatus(200);
});

app.post('/message', requireAuth, async (req, res) => {
    const { message, room } = req.body;
    const sender = req.session.userId;

    if (!message || !room) {
        return res.status(400).json({ error: 'Message and room required' });
    }

    const sanitizedMessage = sanitize(message);
    const sanitizedRoom = sanitize(room);
    const timestamp = new Date();

    const messageDoc = { message: sanitizedMessage, room: sanitizedRoom, sender: sanitize(sender), timestamp };

    await db.collection('messages').insertOne(messageDoc);

    io.to(sanitizedRoom).emit('new-message', messageDoc);

    res.sendStatus(200);
});

app.get('/messages', requireAuth, async (req, res) => {
    const room = req.query.room;
    const username = req.session.userId;

    if (!room) {
        return res.status(400).json({ error: 'Room required' });
    }

    const sanitizedRoom = sanitize(room);

    const hiddenMessages = await db.collection('hidden_messages').findOne({ username, room: sanitizedRoom });
    const hiddenIds = hiddenMessages ? hiddenMessages.messageIds : [];

    const query = { room: sanitizedRoom };
    const messages = await db.collection('messages').find(query).sort({ timestamp: 1 }).toArray();

    const visibleMessages = messages.filter(m => !hiddenIds.includes(m._id.toString()));

    res.json(visibleMessages);
});

app.post('/hide-message', requireAuth, async (req, res) => {
    const { room, messageId } = req.body;
    const username = req.session.userId;

    if (!room || !messageId) {
        return res.status(400).json({ error: 'Room and messageId required' });
    }

    await db.collection('hidden_messages').updateOne(
        { username, room: sanitize(room) },
        { $addToSet: { messageIds: sanitize(messageId) } },
        { upsert: true }
    );

    res.sendStatus(200);
});

app.post('/unhide-message', requireAuth, async (req, res) => {
    const { room, messageId } = req.body;
    const username = req.session.userId;

    if (!room || !messageId) {
        return res.status(400).json({ error: 'Room and messageId required' });
    }

    await db.collection('hidden_messages').updateOne(
        { username, room: sanitize(room) },
        { $pull: { messageIds: sanitize(messageId) } }
    );

    res.sendStatus(200);
});

const userSockets = new Map();

io.on('connection', (socket) => {
    const username = socket.request.session?.userId;
    if (username) {
        userSockets.set(username, socket.id);
    }

    socket.on('join-room', (room) => {
        if (!username) {
            socket.emit('error', 'Not authenticated');
            return;
        }
        socket.join(sanitize(room));
    });

    socket.on('leave-room', (room) => {
        socket.leave(sanitize(room));
    });

    socket.on('disconnect', () => {
        if (username) {
            userSockets.delete(username);
        }
    });
});

httpServer.listen(3000, async () => {
    await connectDB();
    console.log('Backend running on http://localhost:3000');
});
