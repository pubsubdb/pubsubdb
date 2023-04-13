"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonHandler = void 0;
class JsonHandler {
    stringify(value, replacer, space) {
        return JSON.stringify(value, replacer, space);
    }
    parse(text, reviver) {
        return JSON.parse(text, reviver);
    }
}
exports.JsonHandler = JsonHandler;
