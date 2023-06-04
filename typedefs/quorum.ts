import { JobOutput } from "./job";

/**
 * The types in this file are used to define those messages that are sent
 * to pubsubdb client instances when a new version is about to be activated.
 * These messages serve to coordinate the cache invalidation and switch-over
 * to the new version without any downtime and a coordinating parent server.
 */
export type QuorumMessage = PingMessage | PongMessage | ActivateMessage | WorkMessage | JobMessage | RollCallMessage | PresenceMessage | ThrottleMessage;

//used for coordination like version activation
export interface PingMessage {
  type: 'ping';
  originator: string; //guid
}

export interface WorkMessage {
  type: 'work';
  originator: string; //guid
}

//used for coordination like version activation
export interface PongMessage {
  type: 'pong';
  originator: string; //clone of originator guid passed in ping
  guid: string;
}

export interface ActivateMessage {
  type: 'activate';
  cache_mode: 'nocache' | 'cache';
  until_version: string;
}

export interface JobMessage {
  type: 'job';
  topic: string; //this comes from the 'publishes' field in the YAML
  job: JobOutput
}

//ask all workers and engines to announce themselves
export interface RollCallMessage {
  type: 'rollcall';
  topic?: string; //filter by worker (only these workers will respond)
  guid?: string; //filter by engine ()
  duration?: '5s' | '10s' | '30s' | '1m' | '5m' | '10m' | '30m' | '1h'; //how far back in time for network status
}

//talk about yourself (processed counts, rate, bytes, etc)
export interface PresenceMessage {
  type: 'presence';
  profile: QuorumProfile;
}

//delay in ms between fetches from the buffered stream (speed/slow down entire network)
export interface ThrottleMessage {
  type: 'throttle';
  guid?: string; //target the engine quorum
  topic?: string;  //target a worker quorum
  throttle: number; //0-n
}

export interface JobMessageCallback {
  (topic: string, message: JobOutput): void;
}

export interface SubscriptionCallback {
  (topic: string, message: Record<string, any>): void;
}

//describes the profile for a quorum member
export type QuorumProfile = {
  namespace: string;
  appId: string;
  guid: string;
  topic?: string;
  role?: string;
  status: QuorumStatus;
  throttle: number;
  d: QuorumProcessed[];
};

export type QuorumStatus = 'active' | 'inactive';
export type QuorumProcessed = {
  t: number;
  i: number;
  o: number;
  p: number;
  f: number;
  s: number;
};

export interface QuorumMessageCallback {
  (topic: string, message: QuorumMessage): void;
}
