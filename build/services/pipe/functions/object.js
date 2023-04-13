"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectHandler = void 0;
class ObjectHandler {
    keys(obj) {
        return Object.keys(obj);
    }
    values(obj) {
        return Object.values(obj);
    }
    entries(obj) {
        return Object.entries(obj);
    }
    fromEntries(iterable) {
        return Object.fromEntries(iterable);
    }
    assign(target, ...sources) {
        return Object.assign(target, ...sources);
    }
    getOwnPropertyNames(obj) {
        return Object.getOwnPropertyNames(obj);
    }
    getOwnPropertySymbols(obj) {
        return Object.getOwnPropertySymbols(obj);
    }
    getOwnPropertyDescriptor(obj, prop) {
        return Object.getOwnPropertyDescriptor(obj, prop);
    }
    defineProperty(obj, prop, descriptor) {
        return Object.defineProperty(obj, prop, descriptor);
    }
    defineProperties(obj, props) {
        return Object.defineProperties(obj, props);
    }
    freeze(obj) {
        return Object.freeze(obj);
    }
    isFrozen(obj) {
        return Object.isFrozen(obj);
    }
    seal(obj) {
        return Object.seal(obj);
    }
    isSealed(obj) {
        return Object.isSealed(obj);
    }
    preventExtensions(obj) {
        return Object.preventExtensions(obj);
    }
    isExtensible(obj) {
        return Object.isExtensible(obj);
    }
    hasOwnProperty(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
    }
    isPrototypeOf(obj, prototypeObj) {
        return Object.prototype.isPrototypeOf.call(obj, prototypeObj);
    }
    propertyIsEnumerable(obj, prop) {
        return Object.prototype.propertyIsEnumerable.call(obj, prop);
    }
}
exports.ObjectHandler = ObjectHandler;
