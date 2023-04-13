"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Validator = void 0;
const pipe_1 = require("../pipe");
class Validator {
    constructor() {
        this.manifest = null;
        this.activityIds = [];
        this.mappingStatements = {};
        this.store = null;
    }
    /**
     * validate the manifest file
     * @param {PubSubDBManifest} manifest - the full compiled JSON tree with all $refs resolved
     */
    async validate(manifest, store) {
        this.manifest = manifest;
        this.store = store;
        this.getMappingStatements();
        this.validateActivityIds();
        this.validateReferencedActivityIds();
        this.validateMappingStatements();
        this.validateTransitions();
        this.validateTransitionConditions();
        this.validateStats();
        this.validateSchemas();
        this.validateUniqueHandledTopics();
        this.validateGraphPublishSubscribe();
        this.validateHooks();
        this.validateConditionalStatements();
    }
    // 1.1) Validate the manifest file activity ids are unique (no duplicates)
    validateActivityIds() {
        const activityIdsSet = new Set();
        this.manifest.app.graphs.forEach((graph) => {
            const ids = Object.keys(graph.activities);
            // Check for duplicates and add ids to the set
            ids.forEach((id) => {
                if (activityIdsSet.has(id)) {
                    throw new Error(`Duplicate activity id found: ${id}`);
                }
                else {
                    activityIdsSet.add(id);
                }
            });
        });
        this.activityIds = Array.from(activityIdsSet);
    }
    isMappingStatement(value) {
        return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
    }
    extractMappingStatements(obj, result, currentActivityId) {
        for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                this.extractMappingStatements(obj[key], result, currentActivityId);
            }
            else if (this.isMappingStatement(obj[key])) {
                if (!result[currentActivityId]) {
                    result[currentActivityId] = [];
                }
                result[currentActivityId].push(obj[key]);
            }
        }
    }
    getMappingStatements() {
        const mappingStatements = {};
        this.manifest.app.graphs.forEach((graph) => {
            const activities = graph.activities;
            for (const activityId in activities) {
                const activity = activities[activityId];
                this.extractMappingStatements(activity, mappingStatements, activityId);
            }
        });
        this.mappingStatements = mappingStatements;
    }
    // 1.2) Validate no activity ids are referenced that don't exist
    validateReferencedActivityIds() {
        // get list of all mapping statements and make sure first part is an activity id or $app
        const mappingStatements = this.mappingStatements;
        const activityIds = this.activityIds;
        for (const activity in mappingStatements) {
            const statements = mappingStatements[activity];
            statements.forEach((statement) => {
                if (statement.startsWith('{') && statement.endsWith('}')) {
                    const statementParts = statement.slice(1, -1).split('.');
                    const referencedActivityId = statementParts[0];
                    if (!(referencedActivityId == '$app' || activityIds.includes(referencedActivityId) || this.isFunction(statement))) {
                        throw new Error(`Mapping statement references non-existent activity: ${statement}`);
                    }
                }
            });
        }
    }
    isFunction(value) {
        return value.startsWith('{@') && pipe_1.Pipe.resolveFunction(value);
    }
    // 1.3) Validate the mapping/@pipe statements are valid
    validateMappingStatements() {
        // Implement the method content
    }
    // 1.4) Validate the transitions are valid
    validateTransitions() {
        // Implement the method content
    }
    // 1.5) Validate the transition conditions are valid
    validateTransitionConditions() {
        // Implement the method content
    }
    // 1.6) Validate the stats
    validateStats() {
        // Implement the method content
    }
    // 1.7) Validate the schemas
    validateSchemas() {
        // Implement the method content
    }
    // 1.8) Validate the topics are unique and handled
    validateUniqueHandledTopics() {
        // Implement the method content
    }
    // 1.9) Validate that every graph has publishes and subscribes
    validateGraphPublishSubscribe() {
        // Implement the method content
    }
    // 1.10) Validate hooks, including mapping statements
    validateHooks() {
        // Implement the method content
    }
    // 1.11) Validate conditional statements
    validateConditionalStatements() {
        // Implement the method content
    }
}
exports.Validator = Validator;
