"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBSUBDB_NAMESPACE = exports.NAMESPACES = void 0;
//every namespace will be prefixed with this namespace
const PUBSUBDB_NAMESPACE = "ps";
exports.PUBSUBDB_NAMESPACE = PUBSUBDB_NAMESPACE;
const NAMESPACES = {
    PUBSUBDB: `${PUBSUBDB_NAMESPACE}db`,
    JOB_DATA: `${PUBSUBDB_NAMESPACE}job`,
    JOB_METADATA: `${PUBSUBDB_NAMESPACE}jobmd`,
    JOB_STATISTICS: `${PUBSUBDB_NAMESPACE}jobstats`,
    ACTIVITY_DATA: `${PUBSUBDB_NAMESPACE}activity`,
    ACTIVITY_METADATA: `${PUBSUBDB_NAMESPACE}activitymd`,
    ACTIVITY_SCHEMAS: `${PUBSUBDB_NAMESPACE}schemas`,
    SUBSCRIPTION_PATTERNS: `${PUBSUBDB_NAMESPACE}patterns`,
    SUBSCRIPTIONS: `${PUBSUBDB_NAMESPACE}subscriptions`, //called using subscription ids resolved by applying `patterns` to published data
};
exports.NAMESPACES = NAMESPACES;
