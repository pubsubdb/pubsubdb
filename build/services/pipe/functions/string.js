"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringHandler = void 0;
class StringHandler {
    split(input, delimiter) {
        return input.split(delimiter);
    }
    charAt(input, index) {
        return input.charAt(index);
    }
    concat(...strings) {
        return strings.join('');
    }
    includes(input, searchString, position) {
        return input.includes(searchString, position);
    }
    indexOf(input, searchString, fromIndex) {
        return input.indexOf(searchString, fromIndex);
    }
    lastIndexOf(input, searchString, fromIndex) {
        return input.lastIndexOf(searchString, fromIndex);
    }
    slice(input, start, end) {
        return input.slice(start, end);
    }
    toLowerCase(input) {
        return input.toLowerCase();
    }
    toUpperCase(input) {
        return input.toUpperCase();
    }
    trim(input) {
        return input.trim();
    }
    trimStart(input) {
        return input.trimStart();
    }
    trimEnd(input) {
        return input.trimEnd();
    }
    padStart(input, maxLength, padString) {
        return input.padStart(maxLength, padString);
    }
    padEnd(input, maxLength, padString) {
        return input.padEnd(maxLength, padString);
    }
    replace(input, searchValue, replaceValue) {
        return input.replace(searchValue, replaceValue);
    }
    search(input, regexp) {
        return input.search(regexp);
    }
    substring(input, start, end) {
        return input.substring(start, end);
    }
    startsWith(str, searchString, position) {
        return str.startsWith(searchString, position);
    }
    endsWith(str, searchString, length) {
        return str.endsWith(searchString, length);
    }
    repeat(str, count) {
        if (count < 0 || count === Infinity) {
            throw new RangeError('Invalid repeat count. Must be a positive finite number.');
        }
        return str.repeat(count);
    }
}
exports.StringHandler = StringHandler;
