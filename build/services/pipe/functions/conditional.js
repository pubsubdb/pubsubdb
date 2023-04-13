"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConditionalHandler = void 0;
class ConditionalHandler {
    ternary(condition, valueIfTrue, valueIfFalse) {
        return condition ? valueIfTrue : valueIfFalse;
    }
    equality(value1, value2) {
        return value1 == value2;
    }
    strict_equality(value1, value2) {
        return value1 === value2;
    }
    greater_than(value1, value2) {
        return value1 > value2;
    }
    less_than(value1, value2) {
        return value1 < value2;
    }
    greater_than_or_equal(value1, value2) {
        return value1 >= value2;
    }
    less_than_or_equal(value1, value2) {
        return value1 <= value2;
    }
}
exports.ConditionalHandler = ConditionalHandler;
