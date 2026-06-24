/**
 * 🔥 ERP Stress Test — Simulates N concurrent users logging in and navigating
 *
 * Usage:
 *   npx ts-node server/scripts/stress-test.ts [users] [rounds]
 *
 * Example:
 *   npx ts-node server/scripts/stress-test.ts 3 2
 *   → Simulates 3 users, each doing 2 rounds of page navigation
 *
 * What it tests:
 *   1. Login (get JWT token)
 *   2. /api/init batch endpoint (first page load)
 *   3. Wave 1: Lightweight master data (categories, salesmen, taxes, etc.)
 *   4. Wave 2: Medium data (banks, cheques, stock sessions)
 *   5. Wave 3: Heavy data (journal entries, stock permits, invoices)
 *   6. Simulated page navigation (partner statements, inventory reports)
 *
 * Reports:
 *   - Per-request latency (ms)
 *   - Failed requests (timeouts, 429s, 500s)
 *   - Overall pass/fail summary
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NUM_USERS = parseInt(process.argv[2] || '3', 10);
const NUM_ROUNDS = parseInt(process.argv[3] || '1', 10);
const REQUEST_TIMEOUT = 120000; // 120s — matches server reportTimeout for heavy queries
const results = [];
let totalRequests = 0;
let failedRequests = 0;
// ── HTTP helper ──
function timedFetch(user_1, endpoint_1, token_1) {
    return __awaiter(this, arguments, void 0, function* (user, endpoint, token, method = 'GET', body) {
        const url = `${BASE_URL}${endpoint}`;
        const start = Date.now();
        totalRequests++;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        try {
            const headers = {
                'Content-Type': 'application/json',
            };
            if (token)
                headers['Authorization'] = `Bearer ${token}`;
            const res = yield fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const duration = Date.now() - start;
            // Read body to measure payload size
            const text = yield res.text();
            const size = Buffer.byteLength(text, 'utf-8');
            const result = {
                user,
                endpoint,
                status: res.status,
                durationMs: duration,
                ok: res.ok,
                size,
            };
            if (!res.ok) {
                failedRequests++;
                result.error = `HTTP ${res.status}`;
            }
            return result;
        }
        catch (err) {
            clearTimeout(timeout);
            const duration = Date.now() - start;
            failedRequests++;
            return {
                user,
                endpoint,
                status: 0,
                durationMs: duration,
                ok: false,
                error: err.name === 'AbortError' ? `TIMEOUT (${REQUEST_TIMEOUT}ms)` : err.message,
            };
        }
    });
}
// ── Login ──
function login(user) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`  👤 User ${user}: Logging in...`);
        const start = Date.now();
        totalRequests++;
        try {
            const res = yield fetch(`${BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'admin', password: 'admin123' }),
            });
            const duration = Date.now() - start;
            const data = yield res.json();
            const result = {
                user,
                endpoint: '/api/auth/login',
                status: res.status,
                durationMs: duration,
                ok: res.ok,
                size: JSON.stringify(data).length,
            };
            results.push(result);
            if (res.ok && data.token) {
                console.log(`  ✅ User ${user}: Login OK (${duration}ms)`);
                return data.token;
            }
            failedRequests++;
            result.error = `HTTP ${res.status}`;
            console.log(`  ❌ User ${user}: Login FAILED — ${result.error}`);
            return null;
        }
        catch (err) {
            failedRequests++;
            const duration = Date.now() - start;
            results.push({
                user,
                endpoint: '/api/auth/login',
                status: 0,
                durationMs: duration,
                ok: false,
                error: err.message,
            });
            console.log(`  ❌ User ${user}: Login FAILED — ${err.message}`);
            return null;
        }
    });
}
// ── Simulate one user's full session ──
function simulateUser(userId, round) {
    return __awaiter(this, void 0, void 0, function* () {
        const label = `User ${userId} (round ${round})`;
        console.log(`\n🚀 ${label}: Starting session...`);
        // Stagger logins by 500ms to avoid rate limiter on /api/auth/login
        if (userId > 1) {
            yield new Promise(r => setTimeout(r, (userId - 1) * 500));
        }
        // 1. Login
        const token = yield login(userId);
        if (!token) {
            console.log(`  ⚠️ ${label}: Skipping — no token`);
            return;
        }
        // 2. /api/init (batch endpoint — simulates first page load)
        console.log(`  📦 ${label}: Loading /api/init...`);
        const initResult = yield timedFetch(userId, '/api/init', token);
        results.push(initResult);
        const sizeKB = ((initResult.size || 0) / 1024).toFixed(1);
        console.log(`  ${initResult.ok ? '✅' : '❌'} ${label}: /api/init — ${initResult.durationMs}ms (${sizeKB}KB)`);
        // 3. Wave 1: Lightweight master data (simulates backgroundLoad wave 1)
        console.log(`  📊 ${label}: Wave 1 — Master data...`);
        const wave1 = [
            '/api/master/categories',
            '/api/master/salesmen',
            '/api/master/taxes',
            '/api/master/warehouses',
            '/api/currencies',
            '/api/master/branches',
        ];
        const wave1Results = yield Promise.all(wave1.map(ep => timedFetch(userId, ep, token)));
        wave1Results.forEach(r => results.push(r));
        const wave1Max = Math.max(...wave1Results.map(r => r.durationMs));
        const wave1Fails = wave1Results.filter(r => !r.ok).length;
        console.log(`  ${wave1Fails === 0 ? '✅' : '⚠️'} ${label}: Wave 1 — max ${wave1Max}ms, ${wave1Fails} failures`);
        // 4. Wave 2: Medium data
        console.log(`  📊 ${label}: Wave 2 — Operational data...`);
        const wave2 = [
            '/api/treasury/banks',
            '/api/treasury/cheques?page=1&limit=50',
            '/api/fixed-assets',
            '/api/accounts',
        ];
        const wave2Results = yield Promise.all(wave2.map(ep => timedFetch(userId, ep, token)));
        wave2Results.forEach(r => results.push(r));
        const wave2Max = Math.max(...wave2Results.map(r => r.durationMs));
        const wave2Fails = wave2Results.filter(r => !r.ok).length;
        console.log(`  ${wave2Fails === 0 ? '✅' : '⚠️'} ${label}: Wave 2 — max ${wave2Max}ms, ${wave2Fails} failures`);
        // 5. Wave 3: Heavy data (capped)
        console.log(`  📊 ${label}: Wave 3 — Heavy data...`);
        const wave3 = [
            '/api/journal-entries?page=1&limit=50',
            '/api/stock-permits?page=1&limit=50',
            '/api/invoices?page=1&limit=50',
            '/api/products?page=1&limit=50',
        ];
        const wave3Results = yield Promise.all(wave3.map(ep => timedFetch(userId, ep, token)));
        wave3Results.forEach(r => results.push(r));
        const wave3Max = Math.max(...wave3Results.map(r => r.durationMs));
        const wave3Fails = wave3Results.filter(r => !r.ok).length;
        console.log(`  ${wave3Fails === 0 ? '✅' : '⚠️'} ${label}: Wave 3 — max ${wave3Max}ms, ${wave3Fails} failures`);
        // 6. Simulate page navigation (partner statement, dashboard KPIs)
        console.log(`  📊 ${label}: Page navigation...`);
        const pages = [
            '/api/dashboard-kpis',
            '/api/partners?page=1&limit=50',
            '/api/product-stocks',
        ];
        const pageResults = yield Promise.all(pages.map(ep => timedFetch(userId, ep, token)));
        pageResults.forEach(r => results.push(r));
        const pageMax = Math.max(...pageResults.map(r => r.durationMs));
        const pageFails = pageResults.filter(r => !r.ok).length;
        console.log(`  ${pageFails === 0 ? '✅' : '⚠️'} ${label}: Pages — max ${pageMax}ms, ${pageFails} failures`);
        console.log(`  🏁 ${label}: Session complete`);
    });
}
// ── Main ──
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`🔥 ERP STRESS TEST`);
        console.log(`   Server: ${BASE_URL}`);
        console.log(`   Simulated users: ${NUM_USERS}`);
        console.log(`   Rounds per user: ${NUM_ROUNDS}`);
        console.log(`   Request timeout: ${REQUEST_TIMEOUT / 1000}s`);
        console.log('═══════════════════════════════════════════════════════════');
        // Log in ONCE and share the token (auth rate limiter = 5/15min per IP)
        console.log('\n📝 Logging in once (shared token for all simulated users)...');
        const sharedToken = yield login(0);
        if (!sharedToken) {
            console.log('\n❌ Cannot proceed without a valid token. Try again in 15min if rate-limited.');
            return;
        }
        const startTime = Date.now();
        // Simulate user function that uses the shared token
        function simulateUserWithToken(userId, round) {
            return __awaiter(this, void 0, void 0, function* () {
                const label = `User ${userId} (round ${round})`;
                console.log(`\n🚀 ${label}: Starting session...`);
                const token = sharedToken;
                // 1. /api/init (batch endpoint — simulates first page load)
                console.log(`  📦 ${label}: Loading /api/init...`);
                const initResult = yield timedFetch(userId, '/api/init', token);
                results.push(initResult);
                const sizeKB = ((initResult.size || 0) / 1024).toFixed(1);
                console.log(`  ${initResult.ok ? '✅' : '❌'} ${label}: /api/init — ${initResult.durationMs}ms (${sizeKB}KB)`);
                // 2. Wave 1: Lightweight master data
                console.log(`  📊 ${label}: Wave 1 — Master data...`);
                const wave1 = [
                    '/api/master/categories',
                    '/api/master/salesmen',
                    '/api/master/taxes',
                    '/api/master/warehouses',
                    '/api/currencies',
                    '/api/master/branches',
                ];
                const wave1Results = yield Promise.all(wave1.map(ep => timedFetch(userId, ep, token)));
                wave1Results.forEach(r => results.push(r));
                const wave1Max = Math.max(...wave1Results.map(r => r.durationMs));
                const wave1Fails = wave1Results.filter(r => !r.ok).length;
                console.log(`  ${wave1Fails === 0 ? '✅' : '⚠️'} ${label}: Wave 1 — max ${wave1Max}ms, ${wave1Fails} failures`);
                // 3. Wave 2: Medium data
                console.log(`  📊 ${label}: Wave 2 — Operational data...`);
                const wave2 = [
                    '/api/treasury/banks',
                    '/api/treasury/cheques?page=1&limit=50',
                    '/api/accounting/fixed-assets',
                    '/api/accounts',
                ];
                const wave2Results = yield Promise.all(wave2.map(ep => timedFetch(userId, ep, token)));
                wave2Results.forEach(r => results.push(r));
                const wave2Max = Math.max(...wave2Results.map(r => r.durationMs));
                const wave2Fails = wave2Results.filter(r => !r.ok).length;
                console.log(`  ${wave2Fails === 0 ? '✅' : '⚠️'} ${label}: Wave 2 — max ${wave2Max}ms, ${wave2Fails} failures`);
                // 4. Wave 3: Heavy data (capped)
                console.log(`  📊 ${label}: Wave 3 — Heavy data...`);
                const wave3 = [
                    '/api/journals?page=1&limit=50',
                    '/api/stock-permits?page=1&limit=50',
                    '/api/invoices?page=1&limit=50',
                    '/api/products?page=1&limit=50',
                ];
                const wave3Results = yield Promise.all(wave3.map(ep => timedFetch(userId, ep, token)));
                wave3Results.forEach(r => results.push(r));
                const wave3Max = Math.max(...wave3Results.map(r => r.durationMs));
                const wave3Fails = wave3Results.filter(r => !r.ok).length;
                console.log(`  ${wave3Fails === 0 ? '✅' : '⚠️'} ${label}: Wave 3 — max ${wave3Max}ms, ${wave3Fails} failures`);
                // 5. Page navigation (light)
                console.log(`  📊 ${label}: Page navigation...`);
                const pages = [
                    '/api/dashboard-kpis',
                    '/api/partners?page=1&limit=50',
                    '/api/product-stocks',
                ];
                const pageResults = yield Promise.all(pages.map(ep => timedFetch(userId, ep, token)));
                pageResults.forEach(r => results.push(r));
                const pageMax = Math.max(...pageResults.map(r => r.durationMs));
                const pageFails = pageResults.filter(r => !r.ok).length;
                console.log(`  ${pageFails === 0 ? '✅' : '⚠️'} ${label}: Pages — max ${pageMax}ms, ${pageFails} failures`);
                // ════════════════════════════════════════════════════════════
                // 🔥 BRUTAL PHASE: Real-world heavy operations
                // This simulates what ACTUALLY causes hangs:
                //   - User A opens "رصيد المخزن" (ALL products with stock value)
                //   - User B opens "حركة المخزون" (Inventory Flow Report — 7+ SQL queries)
                //   - User C creates an invoice (write operation with stock updates)
                // All happening at the SAME TIME
                // ════════════════════════════════════════════════════════════
                console.log(`  🔥 ${label}: BRUTAL — Heavy reports...`);
                const brutal = [
                    // رصيد المخزن — fetches ALL products (10K+) — the #1 heaviest endpoint
                    '/api/products/paginated?page=1&limit=5000',
                    // Inventory Flow Report — 7+ sequential SQL queries inside one handler
                    '/api/inventory/flow-report?startDate=2025-01-01&endDate=2026-04-06&warehouseId=ALL&categoryId=ALL',
                    // Item Profits Report — cross-references invoices with cost prices
                    '/api/inventory/reports/profits?startDate=2025-01-01&endDate=2026-04-06',
                    // Full partner list (not paginated, used by dropdowns)
                    '/api/partners',
                    // Invoices with all lines — heavier than paginated
                    '/api/invoices?page=1&limit=200',
                ];
                const brutalResults = yield Promise.all(brutal.map(ep => timedFetch(userId, ep, token)));
                brutalResults.forEach(r => results.push(r));
                const brutalMax = Math.max(...brutalResults.map(r => r.durationMs));
                const brutalFails = brutalResults.filter(r => !r.ok).length;
                const brutalTotalKB = brutalResults.reduce((s, r) => s + (r.size || 0), 0) / 1024;
                console.log(`  ${brutalFails === 0 ? '✅' : '⚠️'} ${label}: BRUTAL — max ${brutalMax}ms, ${brutalTotalKB.toFixed(0)}KB total, ${brutalFails} failures`);
                console.log(`  🏁 ${label}: Session complete`);
            });
        }
        // Run all users concurrently (simulates simultaneous logins)
        for (let round = 1; round <= NUM_ROUNDS; round++) {
            console.log(`\n${'═'.repeat(50)}`);
            console.log(`📍 ROUND ${round}/${NUM_ROUNDS}`);
            console.log(`${'═'.repeat(50)}`);
            const userPromises = [];
            for (let u = 1; u <= NUM_USERS; u++) {
                userPromises.push(simulateUserWithToken(u, round));
            }
            yield Promise.all(userPromises);
            // Brief pause between rounds
            if (round < NUM_ROUNDS) {
                console.log(`\n  ⏳ Waiting 2s before next round...`);
                yield new Promise(r => setTimeout(r, 2000));
            }
        }
        const totalTime = Date.now() - startTime;
        // ═══════════════════════════════════════════════════
        // REPORT
        // ═══════════════════════════════════════════════════
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 STRESS TEST RESULTS');
        console.log('═══════════════════════════════════════════════════════════');
        // Group by endpoint
        const byEndpoint = new Map();
        for (const r of results) {
            const list = byEndpoint.get(r.endpoint) || [];
            list.push(r);
            byEndpoint.set(r.endpoint, list);
        }
        console.log('\n📈 Per-Endpoint Summary:');
        console.log('─'.repeat(90));
        console.log('Endpoint'.padEnd(40) +
            'Calls'.padStart(6) +
            'OK'.padStart(5) +
            'Fail'.padStart(6) +
            'Avg(ms)'.padStart(10) +
            'Max(ms)'.padStart(10) +
            'Avg KB'.padStart(10));
        console.log('─'.repeat(90));
        for (const [endpoint, reqs] of [...byEndpoint.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            const ok = reqs.filter(r => r.ok).length;
            const fail = reqs.length - ok;
            const avgMs = Math.round(reqs.reduce((s, r) => s + r.durationMs, 0) / reqs.length);
            const maxMs = Math.max(...reqs.map(r => r.durationMs));
            const avgKB = (reqs.reduce((s, r) => s + (r.size || 0), 0) / reqs.length / 1024).toFixed(1);
            const failFlag = fail > 0 ? ' ❌' : '';
            console.log(endpoint.padEnd(40) +
                String(reqs.length).padStart(6) +
                String(ok).padStart(5) +
                String(fail).padStart(6) +
                String(avgMs).padStart(10) +
                String(maxMs).padStart(10) +
                avgKB.padStart(10) +
                failFlag);
        }
        console.log('─'.repeat(90));
        // Status code breakdown
        const statusCounts = new Map();
        for (const r of results) {
            statusCounts.set(r.status, (statusCounts.get(r.status) || 0) + 1);
        }
        console.log('\n📊 Status Code Breakdown:');
        for (const [status, count] of [...statusCounts.entries()].sort()) {
            const label = status === 0 ? 'TIMEOUT' : status === 200 ? '200 OK' : status === 201 ? '201 Created' : status === 429 ? '429 Rate Limited ⚠️' : `${status}`;
            console.log(`   ${label}: ${count}`);
        }
        // Overall
        const successRate = ((totalRequests - failedRequests) / totalRequests * 100).toFixed(1);
        const allDurations = results.map(r => r.durationMs).sort((a, b) => a - b);
        const p50 = allDurations[Math.floor(allDurations.length * 0.5)];
        const p95 = allDurations[Math.floor(allDurations.length * 0.95)];
        const p99 = allDurations[Math.floor(allDurations.length * 0.99)];
        console.log('\n📊 Overall:');
        console.log(`   Total requests:  ${totalRequests}`);
        console.log(`   Successful:      ${totalRequests - failedRequests}`);
        console.log(`   Failed:          ${failedRequests}`);
        console.log(`   Success rate:    ${successRate}%`);
        console.log(`   P50 latency:     ${p50}ms`);
        console.log(`   P95 latency:     ${p95}ms`);
        console.log(`   P99 latency:     ${p99}ms`);
        console.log(`   Total test time: ${(totalTime / 1000).toFixed(1)}s`);
        // Verdict
        console.log('\n');
        if (failedRequests === 0) {
            console.log('🟢 PASS — All requests succeeded. No hangs detected.');
        }
        else if (failedRequests <= totalRequests * 0.05) {
            console.log(`🟡 WARN — ${failedRequests} failures (${(100 - parseFloat(successRate)).toFixed(1)}%). Check 429s and timeouts above.`);
        }
        else {
            console.log(`🔴 FAIL — ${failedRequests} failures (${(100 - parseFloat(successRate)).toFixed(1)}%). Pool exhaustion likely. Review server logs.`);
        }
        console.log('═══════════════════════════════════════════════════════════\n');
    });
}
main().catch(err => {
    console.error('💥 Stress test crashed:', err);
    process.exit(1);
});
