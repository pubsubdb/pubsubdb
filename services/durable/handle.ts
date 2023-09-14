import { JobOutput } from "../../types/job";
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
    let status = await this.pubSubDB.getStatus(this.workflowId);
    const topic = `${this.workflowTopic}.${this.workflowId}`;
  
    if (status == 0) {
      return (await this.pubSubDB.getState(this.workflowTopic, this.workflowId)).data?.response;
    }
  
    return new Promise((resolve, reject) => {
      let isResolved = false;
      //common fulfill/unsubscribe
      const complete = async (response?: any) => {
        if (isResolved) return;
        isResolved = true;
        this.pubSubDB.unsub(topic);
        resolve(response || (await this.pubSubDB.getState(this.workflowTopic, this.workflowId)).data?.response);
      };
      this.pubSubDB.sub(topic, async (topic: string, message: JobOutput) => {
        await complete(message.data?.response);
      });
      setTimeout(async () => {
        status = await this.pubSubDB.getStatus(this.workflowId);
        if (status == 0) {
          await complete();
        }
      }, 0);
    });
  }
}
