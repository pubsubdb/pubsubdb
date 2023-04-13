"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecActivityError = exports.RegisterTimeoutError = exports.SubscribeToResponseError = exports.MapInputDataError = exports.RestoreJobContextError = void 0;
class RestoreJobContextError extends Error {
    constructor() {
        super("Error occurred while restoring job context");
    }
}
exports.RestoreJobContextError = RestoreJobContextError;
class MapInputDataError extends Error {
    constructor() {
        super("Error occurred while mapping input data");
    }
}
exports.MapInputDataError = MapInputDataError;
class SubscribeToResponseError extends Error {
    constructor() {
        super("Error occurred while subscribing to activity response");
    }
}
exports.SubscribeToResponseError = SubscribeToResponseError;
class RegisterTimeoutError extends Error {
    constructor() {
        super("Error occurred while registering activity timeout");
    }
}
exports.RegisterTimeoutError = RegisterTimeoutError;
class ExecActivityError extends Error {
    constructor() {
        super("Error occurred while executing activity");
    }
}
exports.ExecActivityError = ExecActivityError;
