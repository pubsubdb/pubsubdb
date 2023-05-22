import $RefParser from '@apidevtools/json-schema-ref-parser';
import * as fs from 'fs/promises';
import * as path from 'path';

import { ILogger } from '../logger';
import { Deployer } from './deployer';
import { Validator } from './validator';
import { PubSubDBManifest, StoreService } from '../../typedefs/pubsubdb';
import { RedisClient, RedisMulti } from '../../typedefs/store';

/**
 * The compiler service converts a graph into a executable program.
 */
class CompilerService {
  store: StoreService<RedisClient, RedisMulti> | null;
  logger: ILogger;

  constructor(store: StoreService<RedisClient, RedisMulti>, logger: ILogger) {
    this.store = store;
    this.logger = logger;
  }

  /**
   * verifies and plans the deployment of an app to Redis; the app is not deployed yet
   * @param path 
   */
  async plan(path: string): Promise<PubSubDBManifest> {
    try {
      // 0) parse the manifest file and save fully resolved as a JSON file
      const schema = await $RefParser.dereference(path) as PubSubDBManifest;

      // 1) validate the manifest file
      const validator = new Validator();
      validator.validate(schema, this.store);

      // 2) todo: add a PlannerService module that will plan the deployment (what might break, drift, etc)

      return schema as PubSubDBManifest
    } catch(err) {
      console.error(err);
    }
  }

  /**
   * deploys an app to Redis; the app is not active yet
   * @param mySchemaPath 
   */
  async deploy(mySchemaPath: string, activate = false): Promise<PubSubDBManifest> {
    try {
      // 0) parse the manifest file and save fully resolved as a JSON file
      const schema = await $RefParser.dereference(mySchemaPath) as PubSubDBManifest;

      // 1) save the manifest file as a JSON file
      await this.saveAsJSON(mySchemaPath, schema);

      // 2) validate the manifest file (synchronous operation...no callbacks)
      const validator = new Validator();
      validator.validate(schema, this.store);

      // 3) deploy the schema (save to Redis)
      const deployer = new Deployer();
      await deployer.deploy(schema, this.store);

      // 4) save the app version to Redis (so it can be activated later)
      await this.store.setApp(schema.app.id, schema.app.version);

      // 5) activate
      if (activate) {
        await this.activate(schema.app.id, schema.app.version);
      }
      return schema;
    } catch(err) {
      console.error(err);
    }
  }

  /**
   * activates a deployed version of an app;
   * @param appId 
   * @param appVersion 
   */
  async activate(appId: string, appVersion: string): Promise<void> {
    await this.store.activateAppVersion(appId, appVersion);
  }

  async saveAsJSON(originalPath: string, schema: PubSubDBManifest): Promise<void> {
    const json = JSON.stringify(schema, null, 2);
    const newPath = path.join( path.dirname(originalPath), `.pubsubdb.${schema.app.id}.${schema.app.version}.json` );
    await fs.writeFile(newPath, json, 'utf8');
  }
}

export { CompilerService };
