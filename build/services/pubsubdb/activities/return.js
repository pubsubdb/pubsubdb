"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Return = void 0;
const activity_1 = require("./activity");
class Return extends activity_1.Activity {
    constructor(config, data, metadata) {
        super(config, data, metadata);
    }
    async restoreJobContext() {
        console.log("Return restoreJobContext - Do nothing; No context");
    }
    async mapInputData() {
        console.log("Return mapInputData - Do nothing; No input data");
    }
    async subscribeToResponse() {
        console.log("Return subscribeToResponse - Do nothing; No response");
    }
    async execActivity() {
        console.log("Return execActivity - Do nothing; No execution");
    }
}
exports.Return = Return;
