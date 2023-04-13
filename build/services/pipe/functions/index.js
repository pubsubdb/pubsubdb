"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const array_1 = require("./array");
const bitwise_1 = require("./bitwise");
const conditional_1 = require("./conditional");
const date_1 = require("./date");
const json_1 = require("./json");
const math_1 = require("./math");
const number_1 = require("./number");
const object_1 = require("./object");
const string_1 = require("./string");
const symbol_1 = require("./symbol");
const unary_1 = require("./unary");
exports.default = {
    array: new array_1.ArrayHandler(),
    bitwise: new bitwise_1.BitwiseHandler(),
    conditional: new conditional_1.ConditionalHandler(),
    date: new date_1.DateHandler(),
    json: new json_1.JsonHandler(),
    math: new math_1.MathHandler(),
    number: new number_1.NumberHandler(),
    object: new object_1.ObjectHandler(),
    string: new string_1.StringHandler(),
    symbol: new symbol_1.SymbolHandler(),
    unary: new unary_1.UnaryHandler(),
};
