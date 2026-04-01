const { io } = require('socket.io-client');

const API_URL = window.location.origin;
const socket = io(API_URL, { withCredentials: true });

window.socket = socket;
window.currentChannel = null;
window.currentUsername = '';

const API_BASE = API_URL;

function subscribeToRooms() {
    socket.on('room-created', function(room) {
        loadRooms();
    });
}

window.subscribeToRooms = subscribeToRooms;

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
    const res = await fetch(API_URL + '/rooms', { credentials: 'include' });
    if (res.status === 401) {
        document.getElementById('auth-section').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        return;
    }
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
    const res = await fetch(API_URL + '/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, members, isDirect }),
        credentials: 'include'
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
    const res = await fetch(API_BASE + '/users', { credentials: 'include' });
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
        socket.emit('leave-room', window.currentChannel);
    }

    setCurrentRoom(room);
    window.currentChannel = room;

    socket.emit('join-room', room);

    socket.off('new-message');
    socket.on('new-message', function(data) {
        if (data.room === room) {
            addMessageToUI(data.sender, data.message, data.timestamp, data._id);
        }
    });

    loadMessages(room);
    document.getElementById('input').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    loadRooms();
}

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
        await fetch(API_BASE + '/hide-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: contextMenuTarget.name }),
            credentials: 'include'
        });
        loadRooms();
    }
    hideContextMenu();
});

document.getElementById('hide-message-btn').addEventListener('click', async function() {
    if (contextMenuTarget && contextMenuTarget.type === 'message') {
        await fetch(API_BASE + '/hide-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: currentRoom, messageId: contextMenuTarget.id }),
            credentials: 'include'
        });
        loadMessages(currentRoom);
    }
    hideContextMenu();
});

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
    const res = await fetch(API_BASE + '/messages?room=' + encodeURIComponent(room), { credentials: 'include' });
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

    if (!message || !room) return;

    fetch(API_BASE + '/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, room: room }),
        credentials: 'include'
    });

    input.value = '';
}

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
