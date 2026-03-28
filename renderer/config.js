const Pusher = require('pusher-js');

const key = process.env.PUSHER_APP_KEY;
const cluster = process.env.PUSHER_CLUSTER;

const pusher = new Pusher(key, {
    cluster: cluster
});

window.pusher = pusher;
