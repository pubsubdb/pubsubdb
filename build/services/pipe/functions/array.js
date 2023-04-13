"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArrayHandler = void 0;
class ArrayHandler {
    get(array, index) {
        return array[index];
    }
    concat(array1, array2) {
        return array1.concat(array2);
    }
    every(array, callback) {
        return array.every(callback);
    }
    filter(array, callback) {
        return array.filter(callback);
    }
    find(array, callback) {
        return array.find(callback);
    }
    findIndex(array, callback) {
        return array.findIndex(callback);
    }
    forEach(array, callback) {
        array.forEach(callback);
    }
    indexOf(array, searchElement, fromIndex) {
        return array.indexOf(searchElement, fromIndex);
    }
    join(array, separator) {
        return array.join(separator);
    }
    lastIndexOf(array, searchElement, fromIndex) {
        return array.lastIndexOf(searchElement, fromIndex);
    }
    map(array, callback) {
        return array.map(callback);
    }
    pop(array) {
        return array.pop();
    }
    push(array, ...items) {
        return array.push(...items);
    }
    reduce(array, callback, initialValue) {
        return array.reduce(callback, initialValue);
    }
    reverse(array) {
        return array.reverse();
    }
    shift(array) {
        return array.shift();
    }
    slice(array, start, end) {
        return array.slice(start, end);
    }
    some(array, callback) {
        return array.some(callback);
    }
    sort(array, compareFunction) {
        return array.sort(compareFunction);
    }
    splice(array, start, deleteCount, ...items) {
        return array.splice(start, deleteCount, ...items);
    }
    unshift(array, ...items) {
        return array.unshift(...items);
    }
}
exports.ArrayHandler = ArrayHandler;
