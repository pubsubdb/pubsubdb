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
      return result.data?.response; //'response' is defined in the YAML
    } else {
      const topic = `${this.workflowTopic}.response.${this.workflowId}`;
      return new Promise((resolve, reject) => {
        this.pubSubDB.sub(topic, (topic: string, result: any) => {
          resolve(result?.data?.response);
          //todo: unsubscribe
        });
        //todo: check the state again in case it resolved while the subscription was setup
      });
    }
  }
}
