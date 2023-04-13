"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolHandler = void 0;
class SymbolHandler {
    null() {
        return null;
    }
    undefined() {
        return undefined;
    }
    whitespace() {
        return ' ';
    }
    object() {
        return {};
    }
    array() {
        return [];
    }
    posInfinity() {
        return Infinity;
    }
    negInfinity() {
        return -Infinity;
    }
    NaN() {
        return NaN;
    }
    date() {
        return new Date();
    }
}
exports.SymbolHandler = SymbolHandler;
