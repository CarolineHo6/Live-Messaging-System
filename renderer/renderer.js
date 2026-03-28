const Pusher = require('pusher-js');

const key = process.env.PUSHER_APP_KEY;
const cluster = process.env.PUSHER_CLUSTER;

const pusher = new Pusher(key, {
    cluster: cluster
});

window.pusher = pusher;
window.currentChannel = null;
window.currentUsername = '';

function subscribeToRooms() {
    const roomsChannel = pusher.subscribe('rooms-channel');
    roomsChannel.bind('room-created', function(room) {
        loadRooms();
    });
}

window.subscribeToRooms = subscribeToRooms;

// Chat - Rooms
let currentRoom = null;

function getCurrentRoom() {
    return currentRoom;
}

function setCurrentRoom(room) {
    currentRoom = room;
    document.getElementById('room-title').textContent = room;
}

window.getCurrentRoom = getCurrentRoom;

async function loadRooms() {
    const username = window.getUsername();
    const res = await fetch('http://localhost:3000/rooms?user=' + encodeURIComponent(username));
    const rooms = await res.json();
    const roomList = document.getElementById('room-list');
    roomList.innerHTML = '';

    rooms.forEach(function(room) {
        const div = document.createElement('div');
        div.className = 'room-item';
        if (currentRoom === room.name) {
            div.classList.add('active');
        }
        div.textContent = room.name;
        div.addEventListener('click', function() {
            joinRoom(room.name);
        });
        div.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showRoomContextMenu(e, room.name);
        });
        roomList.appendChild(div);
    });
}

window.loadRooms = loadRooms;

async function createRoom(name, members, isDirect) {
    const res = await fetch('http://localhost:3000/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, members, isDirect })
    });

    const room = await res.json();
    closeModal();
    loadRooms();
    joinRoom(room.name);
}

function openCreateRoomModal() {
    loadUsersForRoom();
    document.getElementById('create-room-modal').style.display = 'flex';
    document.getElementById('room-name-input').value = '';
}

function closeModal() {
    document.getElementById('create-room-modal').style.display = 'none';
}

let selectedUsers = [];

async function loadUsersForRoom() {
    const res = await fetch('http://localhost:3000/users');
    const users = await res.json();
    const username = window.getUsername();
    selectedUsers = [];
    
    const userBoxes = document.getElementById('user-boxes');
    userBoxes.innerHTML = '';
    
    users.forEach(function(user) {
        if (user !== username) {
            const box = document.createElement('div');
            box.className = 'user-box';
            box.textContent = user;
            box.addEventListener('click', function() {
                if (box.classList.contains('selected')) {
                    box.classList.remove('selected');
                    selectedUsers = selectedUsers.filter(function(u) { return u !== user; });
                } else {
                    box.classList.add('selected');
                    selectedUsers.push(user);
                }
            });
            userBoxes.appendChild(box);
        }
    });
}

function handleCreateRoom() {
    const roomName = document.getElementById('room-name-input').value.trim();
    const username = window.getUsername();

    if (selectedUsers.length === 0) {
        alert('Please select at least one member');
        return;
    }

    const members = selectedUsers.slice();
    members.push(username);
    const finalName = roomName || members.join(', ');
    createRoom(finalName, members, false);
}

function joinRoom(room) {
    if (window.currentChannel) {
        window.pusher.unsubscribe(window.currentChannel);
    }

    setCurrentRoom(room);
    const channelName = 'chat-room-' + room.replace(/[^a-zA-Z0-9,-]/g, '-');
    window.currentChannel = channelName;
    const channel = window.pusher.subscribe(channelName);

    channel.bind('new-message', function(data) {
        addMessageToUI(data.sender, data.message, data.timestamp, data._id);
    });

    loadMessages(room);
    document.getElementById('input').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    loadRooms();
}

// Context Menu
let contextMenuTarget = null;

function showRoomContextMenu(e, roomName) {
    contextMenuTarget = { type: 'room', name: roomName };
    const menu = document.getElementById('context-menu');
    const content = document.getElementById('room-context');
    content.style.display = 'block';
    document.getElementById('message-context').style.display = 'none';

    menu.style.display = 'flex';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
}

function showMessageContextMenu(e, messageId) {
    contextMenuTarget = { type: 'message', id: messageId };
    const menu = document.getElementById('context-menu');
    const content = document.getElementById('message-context');
    content.style.display = 'block';
    document.getElementById('room-context').style.display = 'none';

    menu.style.display = 'flex';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
}

function hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
    contextMenuTarget = null;
}

document.addEventListener('click', function() {
    hideContextMenu();
});

document.getElementById('hide-chat-btn').addEventListener('click', async function() {
    if (contextMenuTarget && contextMenuTarget.type === 'room') {
        const username = window.getUsername();
        await fetch('http://localhost:3000/hide-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, room: contextMenuTarget.name })
        });
        loadRooms();
    }
    hideContextMenu();
});

document.getElementById('hide-message-btn').addEventListener('click', async function() {
    if (contextMenuTarget && contextMenuTarget.type === 'message') {
        const username = window.getUsername();
        await fetch('http://localhost:3000/hide-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, room: currentRoom, messageId: contextMenuTarget.id })
        });
        loadMessages(currentRoom);
    }
    hideContextMenu();
});

// Chat - Messages
const messagesDiv = document.getElementById('messages');

function formatTime(date) {
    return new Date(date).toLocaleTimeString();
}

function addMessageToUI(sender, text, time, messageId) {
    const div = document.createElement('div');
    div.className = 'message';
    div.setAttribute('data-id', messageId);
    div.innerHTML = '<span class="message-sender">' + sender + '</span><span class="message-time">' + formatTime(time) + '</span>: ' + text;

    div.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showMessageContextMenu(e, messageId);
    });

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function loadMessages(room) {
    const username = window.getUsername();
    const res = await fetch('http://localhost:3000/messages?room=' + encodeURIComponent(room) + '&user=' + encodeURIComponent(username));
    const messages = await res.json();
    messagesDiv.innerHTML = '';

    messages.forEach(function(msg) {
        addMessageToUI(msg.sender || 'Unknown', msg.message, msg.timestamp, msg._id);
    });
}

function sendMessage() {
    const input = document.getElementById('input');
    const message = input.value.trim();
    const room = getCurrentRoom();
    const user = window.getUsername();

    if (!message || !room) return;

    fetch('http://localhost:3000/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, room: room, sender: user })
    });

    input.value = '';
}

// Initialize
window.initAuth();
document.getElementById('auth-submit').addEventListener('click', window.handleAuthSubmit);

document.getElementById('auth-username').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') window.handleAuthSubmit();
});
document.getElementById('auth-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') window.handleAuthSubmit();
});
document.getElementById('auth-confirm').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') window.handleAuthSubmit();
});

document.getElementById('open-create-room').addEventListener('click', openCreateRoomModal);
document.getElementById('cancel-create-room').addEventListener('click', closeModal);
document.getElementById('confirm-create-room').addEventListener('click', handleCreateRoom);

document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
});
