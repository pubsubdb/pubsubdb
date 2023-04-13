"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pipe = void 0;
const functions_1 = __importDefault(require("./functions"));
class Pipe {
    constructor(rules, jobData) {
        this.rules = rules;
        this.jobData = jobData;
    }
    isPipeType(currentRow) {
        return !Array.isArray(currentRow) && '@pipe' in currentRow;
    }
    static isPipeObject(obj) {
        return typeof obj === 'object' && obj !== null && !Array.isArray(obj) && '@pipe' in obj;
    }
    /**
     * loop through each PipeItem row in this Pipe, resolving and transforming line by line
     * @returns {any} the result of the pipe
     */
    process() {
        let resolved = this.processCells(this.rules[0]);
        const len = this.rules.length;
        for (let i = 1; i < len; i++) {
            resolved = this.processRow(this.rules[i], resolved, []);
        }
        return resolved[0];
    }
    processRow(currentRow, resolvedPriorRow, subPipeQueue) {
        if (this.isPipeType(currentRow)) {
            //currentRow is a recursive subPipe
            const subPipe = new Pipe(currentRow['@pipe'], this.jobData);
            subPipeQueue.push(subPipe.process());
            //return prior row as if nothing happened
            return resolvedPriorRow;
        }
        else {
            if (subPipeQueue.length > 0) {
                //if items in subPipeQueue, flush and use as resolvedPriorRow
                resolvedPriorRow = [...subPipeQueue];
                subPipeQueue.length = 0;
            }
            else if (!resolvedPriorRow) {
                //if no prior row, use current row as prior row
                return [].concat(this.processCells([...currentRow]));
            }
            else {
                const [functionName, ...params] = currentRow;
                //use resolved values from prior row (n - 1) as input params to cell 1 function
                const resolvedValue = Pipe.resolveFunction(functionName)(...resolvedPriorRow);
                //resolve remaining cells in row and return concatenated with resolvedValue
                return [resolvedValue].concat(this.processCells([...params]));
            }
        }
    }
    static resolveFunction(functionName) {
        let [prefix, suffix] = functionName.split('.');
        prefix = prefix.substring(2);
        suffix = suffix.substring(0, suffix.length - 1);
        let domain = functions_1.default[prefix];
        if (!domain) {
            throw new Error(`Unknown domain name [${functionName}]: ${prefix}`);
        }
        if (!domain[suffix]) {
            throw new Error(`Unknown domain function [${functionName}]: ${prefix}.${suffix}`);
        }
        return domain[suffix];
    }
    processCells(cells) {
        const resolved = [];
        for (const currentCell of cells) {
            resolved.push(this.resolveCellValue(currentCell));
        }
        return resolved;
    }
    isMappable(currentCell) {
        return typeof currentCell === 'string' && currentCell.startsWith('{');
    }
    resolveCellValue(currentCell) {
        if (this.isMappable(currentCell)) {
            return this.resolveMappableValue(currentCell);
        }
        else {
            return currentCell;
        }
    }
    getNestedProperty(obj, path) {
        const pathParts = path.split('.');
        let current = obj;
        for (const part of pathParts) {
            if (current === null || typeof current !== 'object' || !current.hasOwnProperty(part)) {
                return undefined;
            }
            current = current[part];
        }
        return current;
    }
    resolveMappableValue(currentCell) {
        const term = currentCell.substring(1, currentCell.length - 1);
        return this.getNestedProperty(this.jobData, term);
    }
}
exports.Pipe = Pipe;
