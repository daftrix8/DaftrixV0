"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEgyptianDate = exports.isDateInRange = exports.getEgyptianISOString = exports.getTodayDateString = exports.toLocalDateString = exports.getEgyptianDate = void 0;
/**
 * Egyptian timezone constant (UTC+2 / EET, or UTC+3 / EEST during DST)
 */
const EGYPT_TIMEZONE = 'Africa/Cairo';
/**
 * Gets a Date object representing the "wall clock" time in Egypt.
 * The returned Date's local getters (.getFullYear(), .getHours(), etc.)
 * will yield the exact values for the Egyptian timezone.
 */
const getEgyptianDate = (date) => {
    const d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) {
        throw new Error('Invalid date provided to getEgyptianDate');
    }
    // Get date parts in Egypt timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: EGYPT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const get = (type) => { var _a; return ((_a = parts.find(p => p.type === type)) === null || _a === void 0 ? void 0 : _a.value) || '0'; };
    // Construct local ISO string in Egypt time
    const iso = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
    return new Date(iso); // Parse as local time so getters match Egypt wall-clock time
};
exports.getEgyptianDate = getEgyptianDate;
/**
 * Converts any date to Egyptian timezone and returns YYYY-MM-DD string
 */
const toLocalDateString = (dateStr) => {
    if (!dateStr)
        return '';
    try {
        const egyptDate = (0, exports.getEgyptianDate)(dateStr);
        const year = egyptDate.getFullYear();
        const month = String(egyptDate.getMonth() + 1).padStart(2, '0');
        const day = String(egyptDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    catch (_a) {
        return '';
    }
};
exports.toLocalDateString = toLocalDateString;
/**
 * Returns current Egyptian date as YYYY-MM-DD string
 */
const getTodayDateString = () => {
    return (0, exports.toLocalDateString)(new Date());
};
exports.getTodayDateString = getTodayDateString;
/**
 * Returns current Egyptian date and time as ISO string (for database storage)
 * This ensures dates are stored with Egyptian timezone context
 */
const getEgyptianISOString = () => {
    try {
        const egyptDate = (0, exports.getEgyptianDate)(new Date());
        const year = egyptDate.getFullYear();
        const month = String(egyptDate.getMonth() + 1).padStart(2, '0');
        const day = String(egyptDate.getDate()).padStart(2, '0');
        const hours = String(egyptDate.getHours()).padStart(2, '0');
        const minutes = String(egyptDate.getMinutes()).padStart(2, '0');
        const seconds = String(egyptDate.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    catch (_a) {
        return '';
    }
};
exports.getEgyptianISOString = getEgyptianISOString;
/**
 * Checks if a date falls within a range (YYYY-MM-DD strings, inclusive)
 * All dates are interpreted in Egyptian timezone
 */
const isDateInRange = (dateStr, startDate, endDate) => {
    if (!dateStr || !startDate || !endDate)
        return false;
    const localDate = (0, exports.toLocalDateString)(dateStr);
    if (!localDate)
        return false;
    return localDate >= startDate && localDate <= endDate;
};
exports.isDateInRange = isDateInRange;
/**
 * Formats a date for display in Egyptian timezone
 */
const formatEgyptianDate = (date, includeTime = false) => {
    const d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime()))
        return '';
    const options = { timeZone: EGYPT_TIMEZONE };
    if (includeTime) {
        return d.toLocaleString('ar-EG', Object.assign(Object.assign({}, options), { hour12: false }));
    }
    return d.toLocaleDateString('ar-EG', options);
};
exports.formatEgyptianDate = formatEgyptianDate;
