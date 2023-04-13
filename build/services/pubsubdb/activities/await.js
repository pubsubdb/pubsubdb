"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Await = void 0;
const activity_1 = require("./activity");
class Await extends activity_1.Activity {
    constructor(config, data, metadata, pubsubdb) {
        super(config, data, metadata, pubsubdb);
    }
    async restoreJobContext() {
        console.log("Await restoreJobContext - Do nothing; No context");
    }
    async mapInputData() {
        console.log("Await mapInputData - Do nothing; No input data");
    }
    async subscribeToResponse() {
        console.log("Await subscribeToResponse - Do nothing; No response");
    }
    async execActivity() {
        console.log("Await execActivity - Do nothing; No execution");
    }
}
exports.Await = Await;
