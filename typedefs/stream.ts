export interface StreamData {
  metadata: {
    topic: string;
    jid: string;
    aid: string;
  };
  data: Record<string, unknown>;
}

export enum StreamStatus {
  SUCCESS = 'success',
  ERROR = 'error',
  PENDING = 'pending',
}

export interface StreamDataResponse extends StreamData {
  status: StreamStatus;
}
