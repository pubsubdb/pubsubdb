"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenApi = void 0;
const activity_1 = require("./activity");
/**
 * the openapi activity type is a placeholder for actions that are external to pubsubdb.
 * Use this activity to call external APIs, or to call other pubsubdb instances/apps.
 *
 * Once the call is made to the external entity, the activity will register with the
 * global hooks table for the specific payload/event that can awaken it. This works,
 * because there is a hooks pattern that is used to register and awaken activities.
 * it generates a skeleton key like hash query and if any of the keys fit, it deletes the
 * key and resumes the job in context.
 */
class OpenApi extends activity_1.Activity {
    constructor(config, data, metadata, pubsubdb) {
        super(config, data, metadata, pubsubdb);
    }
    async restoreJobContext() {
        console.log("OpenApi restoreJobContext - Do nothing; No context");
    }
    async mapInputData() {
        console.log("OpenApi mapInputData - Do nothing; No input data");
    }
    async subscribeToResponse() {
        console.log("OpenApi subscribeToResponse - Do nothing; No response");
    }
    async execActivity() {
        console.log("OpenApi execActivity - Do nothing; No execution");
    }
}
exports.OpenApi = OpenApi;
