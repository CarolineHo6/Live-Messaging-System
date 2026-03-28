const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getEnv: () => ({
        key: process.env.PUSHER_APP_KEY,
        cluster: process.env.PUSHER_CLUSTER
    })
});