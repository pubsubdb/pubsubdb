"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Job = void 0;
const activity_1 = require("./activity");
class Job extends activity_1.Activity {
    constructor(config, data, metadata, pubsubdb, context) {
        super(config, data, metadata, pubsubdb, context);
    }
    async mapJobData() {
        console.log("Job mapInputData - Do nothing; No input data");
    }
    async execActivity() {
        console.log("Job execActivity - Do nothing; No execution");
    }
}
exports.Job = Job;
