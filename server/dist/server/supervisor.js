"use strict";
/**
 * Cluster Supervisor — auto-restarts the server on process.exit(0)
 *
 * This is the production entry point. Instead of running index.ts directly,
 * run this file: node dist/server/supervisor.js
 *
 * It forks index.ts as a cluster worker and auto-restarts it when:
 * - Worker exits with code 0 (intentional restart from admin panel)
 * - Worker is killed by a signal
 *
 * It does NOT restart on non-zero exit codes to prevent infinite loops.
 *
 * Works on all platforms: Windows, Linux, Hostinger, Docker, PM2.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cluster_1 = __importDefault(require("node:cluster"));
const node_path_1 = __importDefault(require("node:path"));
if (node_cluster_1.default.isPrimary) {
    console.log(`🛡️  Supervisor started (PID: ${process.pid})`);
    // Tell the worker to run index.ts (compiled to index.js)
    // cluster.setupPrimary sets the worker script
    node_cluster_1.default.setupPrimary({
        exec: node_path_1.default.join(__dirname, 'index.js')
    });
    const forkWorker = () => {
        const worker = node_cluster_1.default.fork();
        console.log(`🔀 Server worker forked (PID: ${worker.process.pid})`);
        worker.on('exit', (code, signal) => {
            if (signal) {
                console.log(`⚠️  Worker killed by signal ${signal}. Restarting in 2s...`);
                setTimeout(forkWorker, 2000);
            }
            else if (code === 0) {
                // Intentional restart (from restart button or factory reset)
                console.log('🔄 Worker exited with code 0 (restart requested). Restarting in 1s...');
                setTimeout(forkWorker, 1000);
            }
            else {
                // Crash — don't restart to avoid infinite loops
                console.error(`❌ Worker exited with code ${code}. NOT restarting (to prevent loops).`);
                console.error('   Fix the issue and restart the server manually.');
                // Exit the supervisor too so PM2/Docker can handle it
                process.exit(code || 1);
            }
        });
    };
    forkWorker();
}
else {
    // This branch should never execute because we set exec to index.js
    // But just in case, require index
    require('./index');
}
