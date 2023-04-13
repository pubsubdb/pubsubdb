"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Request = void 0;
const activity_1 = require("./activity");
class Request extends activity_1.Activity {
    constructor(config, data, metadata, pubsubdb) {
        super(config, data, metadata, pubsubdb);
    }
    async restoreJobContext() {
        console.log("Request restoreJobContext - Do nothing; No context");
    }
    async mapInputData() {
        console.log("Request mapInputData - Do nothing; No input data");
    }
    async subscribeToResponse() {
        console.log("Request subscribeToResponse - Do nothing; No response");
    }
    async execActivity() {
        console.log("Request execActivity - Do nothing; No execution");
    }
}
exports.Request = Request;
