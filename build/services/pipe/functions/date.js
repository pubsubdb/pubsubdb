"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateHandler = void 0;
class DateHandler {
    fromISOString(isoString) {
        return new Date(isoString);
    }
    now() {
        return Date.now();
    }
    parse(dateString) {
        return Date.parse(dateString);
    }
    getDate(date) {
        return date.getDate();
    }
    getDay(date) {
        return date.getDay();
    }
    getFullYear(date) {
        return date.getFullYear();
    }
    getHours(date) {
        return date.getHours();
    }
    getMilliseconds(date) {
        return date.getMilliseconds();
    }
    getMinutes(date) {
        return date.getMinutes();
    }
    getMonth(date) {
        return date.getMonth();
    }
    getSeconds(date) {
        return date.getSeconds();
    }
    getTime(date) {
        return date.getTime();
    }
    getTimezoneOffset(date) {
        return date.getTimezoneOffset();
    }
    getUTCDate(date) {
        return date.getUTCDate();
    }
    getUTCDay(date) {
        return date.getUTCDay();
    }
    getUTCFullYear(date) {
        return date.getUTCFullYear();
    }
    getUTCHours(date) {
        return date.getUTCHours();
    }
    getUTCMilliseconds(date) {
        return date.getUTCMilliseconds();
    }
    getUTCMinutes(date) {
        return date.getUTCMinutes();
    }
    getUTCMonth(date) {
        return date.getUTCMonth();
    }
    getUTCSeconds(date) {
        return date.getUTCSeconds();
    }
    setMilliseconds(date, ms) {
        return date.setMilliseconds(ms);
    }
    setMinutes(date, minutes, seconds, ms) {
        return date.setMinutes(minutes, seconds, ms);
    }
    setMonth(date, month, day) {
        return date.setMonth(month, day);
    }
    setSeconds(date, seconds, ms) {
        return date.setSeconds(seconds, ms);
    }
    setTime(date, time) {
        return date.setTime(time);
    }
    setUTCDate(date, day) {
        return date.setUTCDate(day);
    }
    setUTCFullYear(date, year, month, day) {
        return date.setUTCFullYear(year, month, day);
    }
    setUTCHours(date, hours, minutes, seconds, ms) {
        return date.setUTCHours(hours, minutes, seconds, ms);
    }
    setUTCMilliseconds(date, ms) {
        return date.setUTCMilliseconds(ms);
    }
    setUTCMinutes(date, minutes, seconds, ms) {
        return date.setUTCMinutes(minutes, seconds, ms);
    }
    setUTCMonth(date, month, day) {
        return date.setUTCMonth(month, day);
    }
    setUTCSeconds(date, seconds, ms) {
        return date.setUTCSeconds(seconds, ms);
    }
    setDate(date, day) {
        return date.setDate(day);
    }
    setFullYear(date, year, month, day) {
        return date.setFullYear(year, month, day);
    }
    setHours(date, hours, minutes, seconds, ms) {
        return date.setHours(hours, minutes, seconds, ms);
    }
    toDateString(date) {
        return date.toDateString();
    }
    toISOString(date) {
        return date.toISOString();
    }
    toJSON(date) {
        return date.toJSON();
    }
    toLocaleDateString(date, locales, options) {
        return date.toLocaleDateString(locales, options);
    }
    toLocaleString(date, locales, options) {
        return date.toLocaleString(locales, options);
    }
    toLocaleTimeString(date, locales, options) {
        return date.toLocaleTimeString(locales, options);
    }
    toString(date) {
        return date.toString();
    }
    UTC(year, month, date, hours, minutes, seconds, ms) {
        return Date.UTC(year, month, date, hours, minutes, seconds, ms);
    }
    valueOf(date) {
        return date.valueOf();
    }
}
exports.DateHandler = DateHandler;
