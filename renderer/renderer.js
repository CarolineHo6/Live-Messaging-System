const { io } = require('socket.io-client');

const API_URL = window.location.origin;
const socket = io(API_URL, { withCredentials: true });

window.socket = socket;
window.currentChannel = null;
window.currentUsername = '';

const API_BASE = API_URL;

let typingTimeout = null;
let isTyping = false;
let typingUsers = [];

function subscribeToRooms() {
    socket.on('room-created', function(room) {
        loadRooms();
    });

    socket.on('friend-request-received', function(data) {
        loadFriendRequests();
        showNotification('Friend request from ' + data.from);
    });

    socket.on('friend-accepted', function(data) {
        loadFriends();
        showNotification(data.username + ' accepted your friend request');
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
    const friendsRes = await fetch(API_BASE + '/friends', { credentials: 'include' });
    const friends = await friendsRes.json();
    const username = window.getUsername();
    selectedUsers = [];
    
    const userBoxes = document.getElementById('user-boxes');
    userBoxes.innerHTML = '';
    
    users.forEach(function(user) {
        if (user !== username && friends.includes(user)) {
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
    
    if (userBoxes.innerHTML === '') {
        userBoxes.innerHTML = '<p style="color: #666;">No friends yet. Add friends first to create chats.</p>';
    }
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
        if (isTyping) {
            socket.emit('stop-typing', window.currentChannel);
            isTyping = false;
        }
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

    socket.off('typing-update');
    socket.on('typing-update', function(usernames) {
        typingUsers = usernames.filter(u => u !== window.getUsername());
        updateTypingIndicator();
    });

    loadMessages(room);
    document.getElementById('input').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    loadRooms();
    updateTypingIndicator();
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

    if (isTyping) {
        socket.emit('stop-typing', room);
        isTyping = false;
    }
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }

    fetch(API_BASE + '/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, room: room }),
        credentials: 'include'
    });

    input.value = '';
}

function handleTyping() {
    const room = getCurrentRoom();
    if (!room) return;

    if (!isTyping) {
        socket.emit('typing', room);
        isTyping = true;
    }

    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }

    typingTimeout = setTimeout(() => {
        if (isTyping) {
            socket.emit('stop-typing', room);
            isTyping = false;
        }
        typingTimeout = null;
    }, 3000);
}

function updateTypingIndicator() {
    let indicator = document.getElementById('typing-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.style.cssText = 'padding: 5px 10px; font-size: 0.85em; color: #666; font-style: italic; height: 24px;';
        const messagesDiv = document.getElementById('messages');
        messagesDiv.parentNode.insertBefore(indicator, messagesDiv.nextSibling);
    }

    if (typingUsers.length === 0) {
        indicator.textContent = '';
    } else if (typingUsers.length === 1) {
        indicator.textContent = typingUsers[0] + ' is typing...';
    } else if (typingUsers.length === 2) {
        indicator.textContent = typingUsers[0] + ' and ' + typingUsers[1] + ' are typing...';
    } else {
        indicator.textContent = typingUsers.length + ' people are typing...';
    }
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
document.getElementById('input').addEventListener('input', handleTyping);

function showNotification(message) {
    const notif = document.createElement('div');
    notif.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #0066cc; color: white; padding: 15px 20px; border-radius: 5px; z-index: 1000; box-shadow: 0 2px 10px rgba(0,0,0,0.3);';
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(function() {
        notif.remove();
    }, 3000);
}

function openFriendsPanel() {
    loadFriendRequests();
    loadFriends();
    document.getElementById('friends-panel').style.display = 'flex';
}

function closeFriendsPanel() {
    document.getElementById('friends-panel').style.display = 'none';
}

function openAddFriendModal() {
    document.getElementById('add-friend-modal').style.display = 'flex';
    document.getElementById('friend-username-input').value = '';
}

function closeAddFriendModal() {
    document.getElementById('add-friend-modal').style.display = 'none';
}

async function loadFriendRequests() {
    const res = await fetch(API_BASE + '/friend-requests', { credentials: 'include' });
    const requests = await res.json();
    const list = document.getElementById('friend-requests-list');
    list.innerHTML = '';

    if (requests.length === 0) {
        list.innerHTML = '<p style="color: #666;">No pending friend requests</p>';
        return;
    }

    requests.forEach(function(req) {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;';
        div.innerHTML = '<span>' + req.from + '</span>' +
            '<div style="display: flex; gap: 10px;">' +
            '<button class="accept-friend-btn" data-from="' + req.from + '" style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">&#10003;</button>' +
            '<button class="reject-friend-btn" data-from="' + req.from + '" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">&#10005;</button>' +
            '</div>';
        list.appendChild(div);
    });

    document.querySelectorAll('.accept-friend-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            acceptFriendRequest(this.getAttribute('data-from'));
        });
    });

    document.querySelectorAll('.reject-friend-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            rejectFriendRequest(this.getAttribute('data-from'));
        });
    });
}

async function loadFriends() {
    const res = await fetch(API_BASE + '/friends', { credentials: 'include' });
    const friends = await res.json();
    const list = document.getElementById('friends-list');
    list.innerHTML = '';

    if (friends.length === 0) {
        list.innerHTML = '<p style="color: #666;">No friends yet</p>';
        return;
    }

    friends.forEach(function(friend) {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 10px; border-bottom: 1px solid #eee;';
        div.textContent = friend;
        list.appendChild(div);
    });
}

async function sendFriendRequest() {
    const to = document.getElementById('friend-username-input').value.trim();
    if (!to) {
        alert('Please enter a username');
        return;
    }

    const res = await fetch(API_BASE + '/friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to }),
        credentials: 'include'
    });

    const data = await res.json();
    if (data.success) {
        alert('Friend request sent!');
        closeAddFriendModal();
    } else {
        alert(data.error || 'Failed to send friend request');
    }
}

async function acceptFriendRequest(from) {
    const res = await fetch(API_BASE + '/friend-request/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from }),
        credentials: 'include'
    });

    const data = await res.json();
    if (data.success) {
        loadFriendRequests();
        loadFriends();
        showNotification('You are now friends with ' + from);
    } else {
        alert(data.error || 'Failed to accept friend request');
    }
}

async function rejectFriendRequest(from) {
    const res = await fetch(API_BASE + '/friend-request/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: from }),
        credentials: 'include'
    });

    const data = await res.json();
    if (data.success) {
        loadFriendRequests();
    } else {
        alert(data.error || 'Failed to reject friend request');
    }
}

document.getElementById('friends-tab-btn').addEventListener('click', openFriendsPanel);
document.getElementById('close-friends-btn').addEventListener('click', closeFriendsPanel);
document.getElementById('add-friend-btn').addEventListener('click', openAddFriendModal);
document.getElementById('cancel-add-friend').addEventListener('click', closeAddFriendModal);
document.getElementById('confirm-add-friend').addEventListener('click', sendFriendRequest);

document.getElementById('friends-panel').addEventListener('click', function(e) {
    if (e.target === this) closeFriendsPanel();
});
document.getElementById('add-friend-modal').addEventListener('click', function(e) {
    if (e.target === this) closeAddFriendModal();
});

window.showNotification = showNotification;
window.openFriendsPanel = openFriendsPanel;
window.loadFriendRequests = loadFriendRequests;
window.loadFriends = loadFriends;
window.initAuth = initAuth;
