const cron = require('node-cron');
const path = require('path');
const { fork } = require('child_process');

const TIMEZONE = process.env.IALERT_SYNC_TIMEZONE || 'Asia/Kolkata';
const BOOTSTRAP_ON_START = String(process.env.IALERT_BOOTSTRAP_ON_START || 'true').toLowerCase() === 'true';
let task = null;
let activeSyncChild = null;

function runSyncInChild(reason) {
    if (activeSyncChild) {
        console.log(`[Scheduler] Sync already running (pid=${activeSyncChild.pid}), skipping ${reason}.`);
        return;
    }

    const runnerPath = path.join(__dirname, '..', 'scripts', 'ialertSyncRunner.js');
    const child = fork(runnerPath, [reason], {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        stdio: 'inherit',
    });

    activeSyncChild = child;
    console.log(`[Scheduler] Started iAlert sync child (pid=${child.pid}) for ${reason}.`);

    child.on('exit', (code, signal) => {
        console.log(`[Scheduler] iAlert sync child finished (pid=${child.pid}, code=${code}, signal=${signal || 'none'}).`);
        if (activeSyncChild && activeSyncChild.pid === child.pid) {
            activeSyncChild = null;
        }
    });
}

function initializeSchedulers() {
    if (task) return;

    task = cron.schedule('0 0 * * *', () => {
        runSyncInChild('daily-scheduler');
    }, {
        timezone: TIMEZONE,
    });

    task.start();
    console.log(`[Scheduler] iAlert CSV sync scheduled daily at 00:00 (${TIMEZONE})`);
}

function triggerStartupBootstrap() {
    if (!BOOTSTRAP_ON_START) {
        console.log('[Scheduler] Startup bootstrap is disabled.');
        return;
    }

    console.log('[Scheduler] Triggering startup bootstrap sync...');
    runSyncInChild('startup-bootstrap');
}

module.exports = { initializeSchedulers, triggerStartupBootstrap };
