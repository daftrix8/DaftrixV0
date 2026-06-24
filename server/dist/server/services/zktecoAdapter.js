"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealZKDeviceAdapter = exports.MockZKDeviceAdapter = void 0;
exports.setMockZKData = setMockZKData;
exports.getZKDeviceAdapter = getZKDeviceAdapter;
let mockUsers = [];
let mockLogs = [];
let mockInfo = {
    serialNumber: 'ZK-MOCK-123456',
    platform: 'ZK-MOCK-PLATFORM',
    userCounts: 10,
    logCounts: 50
};
/**
 * Configure mock ZK data for tests.
 */
function setMockZKData(users, logs, info) {
    mockUsers = users;
    mockLogs = logs;
    if (info) {
        mockInfo = Object.assign(Object.assign({}, mockInfo), info);
    }
}
class MockZKDeviceAdapter {
    constructor(ip, port) {
        this.ip = ip;
        this.port = port;
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[MockZK] Connected to ${this.ip}:${this.port}`);
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`[MockZK] Disconnected from ${this.ip}:${this.port}`);
        });
    }
    getInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            return mockInfo;
        });
    }
    getUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            return { data: mockUsers };
        });
    }
    getAttendances() {
        return __awaiter(this, void 0, void 0, function* () {
            return { data: mockLogs };
        });
    }
}
exports.MockZKDeviceAdapter = MockZKDeviceAdapter;
class RealZKDeviceAdapter {
    constructor(ip, port) {
        this.ip = ip;
        this.port = port;
        this.zkInstance = null;
    }
    loadZKLib() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                return require('node-zklib');
            }
            catch (_a) {
                throw new Error('node-zklib is not installed. Run: cd server && npm install node-zklib\n' +
                    'This package is required for fingerprint device communication.');
            }
        });
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            const ZKLib = yield this.loadZKLib();
            this.zkInstance = new ZKLib(this.ip, this.port, 10000, 4000);
            yield this.zkInstance.createSocket();
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.zkInstance) {
                yield this.zkInstance.disconnect().catch(() => { });
            }
        });
    }
    getInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.zkInstance)
                throw new Error('Device not connected');
            return yield this.zkInstance.getInfo();
        });
    }
    getUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.zkInstance)
                throw new Error('Device not connected');
            return yield this.zkInstance.getUsers();
        });
    }
    getAttendances() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.zkInstance)
                throw new Error('Device not connected');
            return yield this.zkInstance.getAttendances();
        });
    }
}
exports.RealZKDeviceAdapter = RealZKDeviceAdapter;
/**
 * Factory method returning either Real or Mock adapter based on env.
 */
function getZKDeviceAdapter(ip, port) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.MOCK_ZKTECO === 'true' || process.env.NODE_ENV === 'test') {
            return new MockZKDeviceAdapter(ip, port);
        }
        return new RealZKDeviceAdapter(ip, port);
    });
}
