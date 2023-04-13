"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnaryHandler = void 0;
class UnaryHandler {
    not(value) {
        return !value;
    }
    positive(value) {
        return +value;
    }
    negative(value) {
        return -value;
    }
    bitwise_not(value) {
        return ~value;
    }
}
exports.UnaryHandler = UnaryHandler;
