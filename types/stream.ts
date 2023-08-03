export interface StreamRetryPolicy {
  [key: string]: [number, 'x']; //key is err code, val is the retry profile [(max retry count),(type (x:exponential (default)) (only 10, 100, 1000, 10000 allowed))
}

export type StreamCode = number; //3-digit status code

export type StreamError = {
  message: string;
  code: number;
  job_id?: string; //used when communicating errors externally
  stack?: string;  //unhandled errors will have a stack
  name?: string;   //unhandled errors will have a name
  error?: Record<string, unknown>; //custom user-defined error details go here
}

export enum StreamStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  PENDING = 'pending',
}

export enum StreamDataType {
  TIMEHOOK = 'timehook',
  WEBHOOK = 'webhook',
  AWAIT = 'await',
  WORKER = 'worker',
  TRANSITION = 'transition',
}

export interface StreamData {
  metadata: {
    topic?: string;
    jid?: string; //is optonal if type is WEBHOOK
    aid: string;
    trc?: string; //trace id
    spn?: string; //span id
    try?: number; //current try count
  };
  type?: StreamDataType;
  data: Record<string, unknown>;
  policies?: {
    retry?: StreamRetryPolicy;
  };
  status?: StreamStatus; //assume success
  code?: number;         //assume 200
}

export interface StreamDataResponse extends StreamData {}

export enum StreamRole {
  WORKER = 'worker',
  ENGINE = 'engine',
}

export type StreamConfig = {
  namespace: string;
  appId: string;
  guid: string;
  role: StreamRole;
  topic?: string;
  xclaim?: number; //default 60_000
}
