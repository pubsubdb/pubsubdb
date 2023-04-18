class RestoreJobContextError extends Error {
  constructor() {
    super("Error occurred while restoring job context");
  }
}

class DuplicateActivityError extends Error {
  constructor() {
    super("Error occurred while creating duplicate activity");
  }
}

class MapInputDataError extends Error {
  constructor() {
    super("Error occurred while mapping input data");
  }
}

class SubscribeToResponseError extends Error {
  constructor() {
    super("Error occurred while subscribing to activity response");
  }
}

class RegisterTimeoutError extends Error {
  constructor() {
    super("Error occurred while registering activity timeout");
  }
}

class ExecActivityError extends Error {
  constructor() {
    super("Error occurred while executing activity");
  }
}

export { RestoreJobContextError, DuplicateActivityError, MapInputDataError, SubscribeToResponseError, RegisterTimeoutError, ExecActivityError };
