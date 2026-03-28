require('dotenv').config();
const express = require('express');
const Pusher = require('pusher');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_APP_KEY,
    secret: process.env.PUSHER_APP_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
});

const mongoUri = process.env.MONGO_URI;
const client = new MongoClient(mongoUri);
let db;

async function connectDB() {
    await client.connect();
    db = client.db('chat_app');
    console.log('Connected to MongoDB');
}

app.post('/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const existing = await db.collection('users').findOne({ username });
    if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { username, password: hashedPassword, createdAt: new Date() };
    await db.collection('users').insertOne(user);

    res.json({ success: true, username });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await db.collection('users').findOne({ username });
    if (!user) {
        return res.status(400).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        return res.status(400).json({ error: 'Invalid password' });
    }

    res.json({ success: true, username });
});

app.get('/users', async (req, res) => {
    const users = await db.collection('users').find().toArray();
    res.json(users.map(u => u.username));
});

app.post('/rooms', async (req, res) => {
    const { name, members, isDirect } = req.body;

    if (isDirect && members.length === 2) {
        const currentUser = members[0];
        const otherUser = members[1];
        const existing = await db.collection('rooms').findOne({ 
            isDirect: true, 
            members: { $all: members } 
        });
        if (existing) {
            return res.json(existing);
        }
        const room = { name: otherUser, members, isDirect: true, createdAt: new Date() };
        await db.collection('rooms').insertOne(room);

        pusher.trigger('rooms-channel', 'room-created', room);

        return res.json(room);
    }

    const existing = await db.collection('rooms').findOne({ name });
    if (existing) {
        return res.json(existing);
    }

    const room = { name, members, isDirect: false, createdAt: new Date() };
    await db.collection('rooms').insertOne(room);

    pusher.trigger('rooms-channel', 'room-created', room);

    res.json(room);
});

app.get('/rooms', async (req, res) => {
    const username = req.query.user;
    const rooms = await db.collection('rooms').find().toArray();

    const hiddenChats = await db.collection('hidden_chats').findOne({ username });
    const hiddenRoomNames = hiddenChats ? hiddenChats.rooms : [];

    let userRooms = rooms.filter(r =>
        r.isDirect || (r.members && r.members.includes(username))
    );

    userRooms = userRooms.filter(r => !hiddenRoomNames.includes(r.name));

    res.json(userRooms);
});

app.post('/hide-chat', async (req, res) => {
    const { username, room } = req.body;

    await db.collection('hidden_chats').updateOne(
        { username },
        { $addToSet: { rooms: room } },
        { upsert: true }
    );

    res.sendStatus(200);
});

app.post('/unhide-chat', async (req, res) => {
    const { username, room } = req.body;

    await db.collection('hidden_chats').updateOne(
        { username },
        { $pull: { rooms: room } }
    );

    res.sendStatus(200);
});

app.post('/message', async (req, res) => {
    const { message, room, sender } = req.body;
    const timestamp = new Date();

    const messageDoc = { message, room, sender, timestamp };

    await db.collection('messages').insertOne(messageDoc);

    pusher.trigger(`chat-room-${room.replace(/[^a-zA-Z0-9,-]/g, '-')}`, 'new-message', messageDoc);

    res.sendStatus(200);
});

app.get('/messages', async (req, res) => {
    const room = req.query.room;
    const username = req.query.user;

    const hiddenMessages = await db.collection('hidden_messages').findOne({ username, room });
    const hiddenIds = hiddenMessages ? hiddenMessages.messageIds : [];

    const query = { room };
    const messages = await db.collection('messages').find(query).sort({ timestamp: 1 }).toArray();

    const visibleMessages = messages.filter(m => !hiddenIds.includes(m._id.toString()));

    res.json(visibleMessages);
});

app.post('/hide-message', async (req, res) => {
    const { username, room, messageId } = req.body;

    await db.collection('hidden_messages').updateOne(
        { username, room },
        { $addToSet: { messageIds: messageId } },
        { upsert: true }
    );

    res.sendStatus(200);
});

app.post('/unhide-message', async (req, res) => {
    const { username, room, messageId } = req.body;

    await db.collection('hidden_messages').updateOne(
        { username, room },
        { $pull: { messageIds: messageId } }
    );

    res.sendStatus(200);
});

app.listen(3000, async () => {
    await connectDB();
    console.log('Backend running on http://localhost:3000');
});
