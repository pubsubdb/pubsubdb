"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapperService = void 0;
const pipe_1 = require("../pipe");
class MapperService {
    constructor(rules, data) {
        this.rules = rules;
        this.data = data;
    }
    mapRules() {
        return this.traverseRules(this.rules);
    }
    traverseRules(rules) {
        if (typeof rules === 'object' && '@pipe' in rules) {
            return this.pipe(rules['@pipe']);
        }
        if (typeof rules === 'object' && rules !== null) {
            const mappedRules = {};
            for (const key in rules) {
                if (Object.prototype.hasOwnProperty.call(rules, key)) {
                    mappedRules[key] = this.traverseRules(rules[key]);
                }
            }
            return mappedRules;
        }
        else {
            return this.resolve(rules);
        }
    }
    /**
     * resolve a pipe expression of the form: { @pipe: [["{data.foo.bar}", 2, false, "hello world"]] }
     * @param value
     * @returns
     */
    pipe(value) {
        const pipe = new pipe_1.Pipe(value, this.data);
        return pipe.process();
    }
    /**
     * resolve a simple mapping expression in the form: "{data.foo.bar}" or 2 or false or "hello world"
     * @param value
     * @returns
     */
    resolve(value) {
        const pipe = new pipe_1.Pipe([[value]], this.data);
        return pipe.process();
    }
}
exports.MapperService = MapperService;
