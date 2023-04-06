import $RefParser from '@apidevtools/json-schema-ref-parser';
import { JSONSchema } from '@apidevtools/json-schema-ref-parser/dist/lib/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PubSubDBManifest } from '../../typedefs/pubsubdb';
import { MappingStatements } from '../../typedefs/map';

/**
 * The compiler service converts a graph into a runnable program. It expects a 
 * a pubsubdb manifest file as input. It will then compile the graph into a
 * program that is essentially an event bus and a subscription table
 */
class CompilerService {

  //todo: configure to expect a resolved, absolute path to the manifest file
  public async compile(): Promise<void> {
    try {
      // 0) parse the manifest file and save it as a JSON file
      const mySchemaPath = '/app/seeds/pubsubdb.yaml';
      const schema = await $RefParser.dereference(mySchemaPath);
      await this.saveAsJSON(mySchemaPath, schema);

      //1) validate the manifest file
      //1.1) validate the manifest file activity ids are unique (no dupes)
      //1.2) validate no activity ids are referenced that don't exist
      //1.3) validate the mapping/@pipe statements are valid
      //1.4) validate the transitions are valid
      //1.5) validate the transition conditions are valid
      //1.6) validate the stats
      //1.7) validate the schemas
      //1.8) validate the topics are unique and handled
      //1.9) validate that every graph has publishes and subscribes
      //1.10) validate hooks, including mappng statements
      //1.11) validate conditional statements

      //2) segment the manifest file
      //2.1) segment each activity def and deploy segment to redis
      //2.2) compile the list of subscriptions and deploy to redis
      //2.2) compile the list of subscription patterns and deploy to redis
      //2.3) compile the list of publications and deploy to redis
      //2.5) publish to all subscribers the new version (and to pause for 5ms)
      //2.4) update the version number in redis for the active version
      //2.6) publish activate command to all instances to clear local caches and start processing the new version

    } catch(err) {
      console.error(err);
    }
  }

  async saveAsJSON(originalPath: string, schema: JSONSchema): Promise<void> {
    const json = JSON.stringify(schema, null, 2);
    const newPath = path.join( path.dirname(originalPath), '.pubsubdb.json' );
    await fs.writeFile(newPath, json, 'utf8');
    console.log(`JSON saved at ${newPath}`);
    console.log('activityIds', this.getActivityIds(schema as PubSubDBManifest));
    console.log('mappingStatements', this.getMappingStatements(schema as PubSubDBManifest));
  }

  getActivityIds(jsonDoc: PubSubDBManifest): string[] {
    const activityIdsSet: Set<string> = new Set();
    jsonDoc.app.graphs.forEach((graph) => {
      const ids = Object.keys(graph.activities);
      // Check for duplicates and add ids to the set
      ids.forEach((id) => {
        if (activityIdsSet.has(id)) {
          throw new Error(`Duplicate activity id found: ${id}`);
        } else {
          activityIdsSet.add(id);
        }
      });
    });
    return Array.from(activityIdsSet);
  }

  isMappingStatement(value: string): boolean {
    return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
  }

  extractMappingStatements(obj: any, result: MappingStatements, currentActivityId: string): void {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.extractMappingStatements(obj[key], result, currentActivityId);
      } else if (this.isMappingStatement(obj[key])) {
        if (!result[currentActivityId]) {
          result[currentActivityId] = [];
        }
        result[currentActivityId].push(obj[key]);
      }
    }
  }
  
  getMappingStatements(jsonDoc: PubSubDBManifest): MappingStatements {
    const mappingStatements: MappingStatements = {};
    jsonDoc.app.graphs.forEach((graph) => {
      const activities = graph.activities;
      for (const activityId in activities) {
        const activity = activities[activityId];
        this.extractMappingStatements(activity, mappingStatements, activityId);
      }
    });
    return mappingStatements;
  }
}

export { CompilerService };
