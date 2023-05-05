/**
 * The types in this file are used to define those messages that are sent
 * to pubsubdb client instances when a new version is about to be activated.
 * These messages serve to coordinate the cache invalidation and switch-over
 * to the new version without any downtime and a coordinating parent server.
 */
export type ConductorMessage = PingMessage | PongMessage | ActivateMessage | WorkMessage;

export interface PingMessage {
  type: 'ping';
  originator: string; //guid
}

export interface WorkMessage {
  type: 'work';
  originator: string; //guid
}

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

export interface SubscriptionCallback {
  (topic: string, message: Record<string, any>): void;
}
