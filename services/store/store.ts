import { StringLiteralType } from "typescript";

// StoreService.ts
abstract class StoreService {
  abstract getKey(namespace: string, key: string): string;
  abstract getManifest(): Promise<any>;
  abstract setManifest(manifest: any): Promise<any>;
  abstract setJob(jobId: any, data: Record<string, unknown>, metadata: Record<string, unknown>): Promise<any>;
  abstract getJobMetadata(jobId: string): Promise<any>;
  abstract getJobData(jobId: string): Promise<any>;
  abstract getJob(jobId: string): Promise<any>;
  abstract get(jobId: string): Promise<any>;
  abstract setActivity(activityId: any, data: Record<string, unknown>, metadata: Record<string, unknown>): Promise<any>;
  abstract getActivityMetadata(activityId: string): Promise<any>;
  abstract getActivityData(activityId: string): Promise<any>;
  abstract getActivity(activityId: string): Promise<any>;
  abstract getSchema(topic: string): Promise<any>;
  abstract getSchemas(): Promise<any>;
  abstract init(): Promise<any>;
  abstract initSchemaCache(): Promise<any>;
  abstract setSchema(topic: string, schema: any): Promise<any>;
  abstract setSchemas(schemas: Record<string, any>): Promise<any>;
}

export { StoreService };
