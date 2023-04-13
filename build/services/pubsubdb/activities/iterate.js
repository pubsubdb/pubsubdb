"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Iterate = void 0;
const activity_1 = require("./activity");
class Iterate extends activity_1.Activity {
    constructor(config, data, metadata, pubsubdb) {
        super(config, data, metadata, pubsubdb);
    }
    async restoreJobContext() {
        console.log("Iterate restoreJobContext - Do nothing; No context");
    }
    async mapInputData() {
        console.log("Iterate mapInputData - Do nothing; No input data");
    }
    async subscribeToResponse() {
        console.log("Iterate subscribeToResponse - Do nothing; No response");
    }
    async execActivity() {
        console.log("Iterate execActivity - Do nothing; No execution");
    }
}
exports.Iterate = Iterate;
