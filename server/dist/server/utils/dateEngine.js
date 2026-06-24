"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMySQLDateTime = exports.DateEngine = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
const isSameOrAfter_1 = __importDefault(require("dayjs/plugin/isSameOrAfter"));
const isSameOrBefore_1 = __importDefault(require("dayjs/plugin/isSameOrBefore"));
dayjs_1.default.extend(utc_1.default);
dayjs_1.default.extend(timezone_1.default);
dayjs_1.default.extend(isSameOrAfter_1.default);
dayjs_1.default.extend(isSameOrBefore_1.default);
// Define default timezone (this could come from env or system settings)
const DEFAULT_TIMEZONE = process.env.TIMEZONE || 'Asia/Kuwait';
class DateEngine {
    static now() {
        return (0, dayjs_1.default)().tz(DEFAULT_TIMEZONE);
    }
    static todayStr() {
        return this.now().format('YYYY-MM-DD');
    }
    static addDays(date, days) {
        return (0, dayjs_1.default)(date).tz(DEFAULT_TIMEZONE).add(days, 'day');
    }
    static isExpired(endDate) {
        // Expired if the end date is strictly before today
        const today = this.now().startOf('day');
        const end = (0, dayjs_1.default)(endDate).tz(DEFAULT_TIMEZONE).startOf('day');
        return end.isBefore(today);
    }
    static format(date, template = 'YYYY-MM-DD HH:mm:ss') {
        return (0, dayjs_1.default)(date).tz(DEFAULT_TIMEZONE).format(template);
    }
    static startOfDay(date) {
        return (date ? (0, dayjs_1.default)(date) : this.now()).tz(DEFAULT_TIMEZONE).startOf('day');
    }
    static diffDays(start, end = this.now()) {
        const s = (0, dayjs_1.default)(start).tz(DEFAULT_TIMEZONE).startOf('day');
        const e = (0, dayjs_1.default)(end).tz(DEFAULT_TIMEZONE).startOf('day');
        return e.diff(s, 'day');
    }
    /**
     * Convert an ISO 8601 datetime (e.g. '2026-06-09T22:00:00.000Z') to MySQL format.
     * Returns null for falsy/empty values so it's safe to pass directly to query params.
     */
    static toMySQL(value) {
        if (!value)
            return null;
        const parsed = (0, dayjs_1.default)(value);
        if (!parsed.isValid())
            return null;
        return parsed.tz(DEFAULT_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
    }
}
exports.DateEngine = DateEngine;
const toMySQLDateTime = (isoDate) => {
    if (!isoDate)
        return null;
    try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
            return `${isoDate} 12:00:00`;
        }
        return new Date(isoDate).toISOString().slice(0, 19).replace('T', ' ');
    }
    catch (_a) {
        return null;
    }
};
exports.toMySQLDateTime = toMySQLDateTime;
