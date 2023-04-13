"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompilerService = void 0;
const json_schema_ref_parser_1 = __importDefault(require("@apidevtools/json-schema-ref-parser"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const validator_1 = require("./validator");
const deployer_1 = require("./deployer");
/**
 * The compiler service converts a graph into a executable program.
 */
class CompilerService {
    constructor(store) {
        this.store = store;
    }
    /**
     * verifies and plans the deployment of an app to Redis; the app is not deployed yet
     * @param path
     */
    async plan(path) {
        try {
            // 0) parse the manifest file and save fully resolved as a JSON file
            const schema = await json_schema_ref_parser_1.default.dereference(path);
            // 1) validate the manifest file
            const validator = new validator_1.Validator();
            validator.validate(schema, this.store);
            // 2) todo: add a PlannerService module that will plan the deployment (what might break, drift, etc)
        }
        catch (err) {
            console.error(err);
        }
    }
    /**
     * deploys an app to Redis; the app is not active yet
     * @param mySchemaPath
     */
    async deploy(mySchemaPath) {
        try {
            // 0) parse the manifest file and save fully resolved as a JSON file
            const schema = await json_schema_ref_parser_1.default.dereference(mySchemaPath);
            // 1) save the manifest file as a JSON file
            await this.saveAsJSON(mySchemaPath, schema);
            // 2) validate the manifest file (synchronous operation...no callbacks)
            const validator = new validator_1.Validator();
            validator.validate(schema, this.store);
            // 3) deploy the schema (save to Redis)
            const deployer = new deployer_1.Deployer();
            await deployer.deploy(schema, this.store);
            // 4) save the app version to Redis (so it can be activated later)
            await this.store.setApp(schema.app.id, schema.app.version);
        }
        catch (err) {
            console.error(err);
        }
    }
    /**
     * activates a deployed version of an app;
     * @param appId
     * @param appVersion
     */
    async activate(appId, appVersion) {
        await this.store.activateAppVersion(appId, appVersion);
    }
    async saveAsJSON(originalPath, schema) {
        const json = JSON.stringify(schema, null, 2);
        const newPath = path.join(path.dirname(originalPath), `.pubsubdb.${schema.app.id}.${schema.app.version}.json`);
        await fs.writeFile(newPath, json, 'utf8');
    }
}
exports.CompilerService = CompilerService;
