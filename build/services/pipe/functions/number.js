"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NumberHandler = void 0;
class NumberHandler {
    isFinite(input) {
        return Number.isFinite(input);
    }
    isInteger(input) {
        return Number.isInteger(input);
    }
    isNaN(input) {
        return Number.isNaN(input);
    }
    parseFloat(input) {
        return parseFloat(input);
    }
    parseInt(input, radix) {
        return parseInt(input, radix);
    }
    toFixed(input, digits) {
        return input.toFixed(digits);
    }
    toExponential(input, fractionalDigits) {
        return input.toExponential(fractionalDigits);
    }
    toPrecision(input, precision) {
        return input.toPrecision(precision);
    }
    gte(input, compareValue) {
        return input >= compareValue;
    }
    lte(input, compareValue) {
        return input <= compareValue;
    }
    gt(input, compareValue) {
        return input > compareValue;
    }
    lt(input, compareValue) {
        return input < compareValue;
    }
    max(...values) {
        return Math.max(...values);
    }
    min(...values) {
        return Math.min(...values);
    }
    pow(base, exponent) {
        return Math.pow(base, exponent);
    }
    round(input) {
        return Math.round(input);
    }
}
exports.NumberHandler = NumberHandler;
