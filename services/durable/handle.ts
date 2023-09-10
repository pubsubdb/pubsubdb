import { PubSubDBService as PubSubDB } from "../pubsubdb";

export class WorkflowHandleService {
  pubSubDB: PubSubDB;
  workflowTopic: string;
  workflowId: string;

  constructor(pubSubDB: PubSubDB, workflowTopic: string, workflowId: string) {
    this.workflowTopic = workflowTopic;
    this.workflowId = workflowId;
    this.pubSubDB = pubSubDB;
  }

  async result(): Promise<any> {
    const status = await this.pubSubDB.getStatus(this.workflowId);
    if (status == 0) {
      const result = await this.pubSubDB.getState(this.workflowTopic, this.workflowId);
      return result.data?.response;
    }

    const topic = `${this.workflowTopic}.${this.workflowId}`;
    return new Promise(async (resolve, reject) => {
      this.pubSubDB.sub(topic, (topic: string, result: any) => {
        resolve(result?.data?.response);
        this.pubSubDB.unsub(topic);
      });
      const status = await this.pubSubDB.getStatus(this.workflowId);
      if (status == 0) {
        this.pubSubDB.unsub(topic);
        const result = await this.pubSubDB.getState(this.workflowTopic, this.workflowId);
        resolve(result.data?.response);
      }
    });

  }
}
