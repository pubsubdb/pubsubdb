"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitwiseHandler = void 0;
class BitwiseHandler {
    and(a, b) {
        return a & b;
    }
    or(a, b) {
        return a | b;
    }
    xor(a, b) {
        return a ^ b;
    }
    leftShift(a, b) {
        return a << b;
    }
    rightShift(a, b) {
        return a >> b;
    }
    unsignedRightShift(a, b) {
        return a >>> b;
    }
}
exports.BitwiseHandler = BitwiseHandler;
