let isSignupMode = false;

function getIsSignupMode() {
    return isSignupMode;
}

function setSignupMode(value) {
    isSignupMode = value;
}

function updateAuthUI() {
    const title = document.getElementById('auth-title');
    const confirmInput = document.getElementById('auth-confirm');
    const switchText = document.getElementById('auth-switch');

    if (isSignupMode) {
        title.textContent = 'Sign Up';
        confirmInput.style.display = 'block';
        switchText.innerHTML = 'Already have an account? <a href="#" id="switch-link">Log in</a>';
    } else {
        title.textContent = 'Login';
        confirmInput.style.display = 'none';
        switchText.innerHTML = "Don't have an account? <a href=\"#\" id=\"switch-link\">Create one</a>";
    }
}

function initAuth() {
    updateAuthUI();

    document.addEventListener('click', function(e) {
        if (e.target.id === 'switch-link' || e.target.closest('#switch-link')) {
            e.preventDefault();
            const link = e.target.id === 'switch-link' ? e.target : e.target.closest('#switch-link');
            if (link) {
                isSignupMode = !isSignupMode;
                updateAuthUI();
            }
        }
    });
}

async function handleSignup() {
    const usernameVal = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm = document.getElementById('auth-confirm').value;

    if (!usernameVal || !password) {
        alert('Please fill in all fields');
        return;
    }

    if (password !== confirm) {
        alert('Passwords do not match');
        return;
    }

    const res = await fetch('http://localhost:3000/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameVal, password }),
        credentials: 'include'
    });

    const data = await res.json();

    if (data.success) {
        window.currentUsername = usernameVal;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        document.getElementById('user-display').textContent = 'Logged in as: ' + usernameVal;
        window.loadRooms();
        window.subscribeToRooms();
    } else {
        alert(data.error || 'Signup failed');
    }
}

async function handleLogin() {
    const usernameVal = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!usernameVal || !password) {
        alert('Please fill in all fields');
        return;
    }

    const res = await fetch('http://localhost:3000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameVal, password }),
        credentials: 'include'
    });

    const data = await res.json();

    if (data.success) {
        window.currentUsername = usernameVal;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        document.getElementById('user-display').textContent = 'Logged in as: ' + usernameVal;
        window.loadRooms();
        window.subscribeToRooms();
    } else {
        alert(data.error || 'Login failed');
    }
}

function handleAuthSubmit() {
    if (isSignupMode) {
        handleSignup();
    } else {
        handleLogin();
    }
}

function getUsername() {
    return window.currentUsername || '';
}

window.initAuth = initAuth;
window.handleAuthSubmit = handleAuthSubmit;
window.getUsername = getUsername;
