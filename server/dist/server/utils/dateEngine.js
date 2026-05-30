"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateEngine = void 0;
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
}
exports.DateEngine = DateEngine;
