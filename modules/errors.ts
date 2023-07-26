class GetStateError extends Error {
  constructor() {
    super("Error occurred while getting job state");
  }
}
class SetStateError extends Error {
  constructor() {
    super("Error occurred while setting job state");
  }
}

class MapDataError extends Error {
  constructor() {
    super("Error occurred while mapping data");
  }
}

class RegisterTimeoutError extends Error {
  constructor() {
    super("Error occurred while registering activity timeout");
  }
}

class DuplicateJobError extends Error {
  constructor(jobId: string) {
    super("Duplicate job");
    this.message = `Duplicate job: ${jobId}`;
  }
}

class ExecActivityError extends Error {
  constructor() {
    super("Error occurred while executing activity");
  }
}

export { DuplicateJobError, GetStateError, SetStateError, MapDataError, RegisterTimeoutError, ExecActivityError };
