let currentRoom = null;

function getCurrentRoom() {
    return currentRoom;
}

function setCurrentRoom(room) {
    currentRoom = room;
    document.getElementById('room-title').textContent = room;
}

async function loadRooms() {
    const res = await fetch('http://localhost:3000/rooms');
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
        roomList.appendChild(div);
    });
}

async function createRoom(name) {
    await fetch('http://localhost:3000/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    });
    document.getElementById('new-room-input').value = '';
    loadRooms();
}

function joinRoom(room) {
    if (window.currentChannel) {
        window.pusher.unsubscribe(window.currentChannel);
    }

    setCurrentRoom(room);
    window.currentChannel = 'chat-room-' + room;
    const channel = window.pusher.subscribe(window.currentChannel);

    channel.bind('new-message', function(data) {
        if (window.addMessageToUI) {
            window.addMessageToUI(data.sender, data.message, data.timestamp);
        }
    });

    if (window.loadMessages) {
        window.loadMessages(room);
    }

    document.getElementById('input').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    loadRooms();
}

document.getElementById('create-room-btn').addEventListener('click', function() {
    const input = document.getElementById('new-room-input');
    const name = input.value.trim();
    if (name) {
        createRoom(name);
    }
});

document.getElementById('new-room-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const name = this.value.trim();
        if (name) {
            createRoom(name);
        }
    }
});
