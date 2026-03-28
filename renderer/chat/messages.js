const messagesDiv = document.getElementById('messages');

function formatTime(date) {
    return new Date(date).toLocaleTimeString();
}

function addMessageToUI(sender, text, time) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = '<span class="message-sender">' + sender + '</span><span class="message-time">' + formatTime(time) + '</span>: ' + text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

window.addMessageToUI = addMessageToUI;

async function loadMessages(room) {
    const res = await fetch('http://localhost:3000/messages?room=' + encodeURIComponent(room));
    const messages = await res.json();
    messagesDiv.innerHTML = '';

    messages.forEach(function(msg) {
        addMessageToUI(msg.sender || 'Unknown', msg.message, msg.timestamp);
    });
}

window.loadMessages = loadMessages;

function sendMessage() {
    const input = document.getElementById('input');
    const message = input.value.trim();
    const room = window.getCurrentRoom ? window.getCurrentRoom() : null;
    const username = window.getUsername ? window.getUsername() : '';

    if (!message || !room) return;

    fetch('http://localhost:3000/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message, room: room, sender: username })
    });

    input.value = '';
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);

document.getElementById('input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
