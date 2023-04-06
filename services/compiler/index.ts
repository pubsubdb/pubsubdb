import $RefParser from '@apidevtools/json-schema-ref-parser';
import { JSONSchema } from '@apidevtools/json-schema-ref-parser/dist/lib/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PubSubDBManifest } from '../../typedefs/pubsubdb';
import { MappingStatements } from '../../typedefs/map';
import { Validator } from './validator';
import { Segmenter } from './segmenter';

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

      //1) save the manifest file as a JSON file (todo:use version in name)
      await this.saveAsJSON(mySchemaPath, schema);

      // 2) validate the manifest file
      const validator = new Validator();
      validator.validate(schema as PubSubDBManifest);

      //3) segment the manifest file
      const segmenter = new Segmenter();
      segmenter.segment(schema as PubSubDBManifest);

    } catch(err) {
      console.error(err);
    }
  }

  async saveAsJSON(originalPath: string, schema: JSONSchema): Promise<void> {
    const json = JSON.stringify(schema, null, 2);
    const newPath = path.join( path.dirname(originalPath), '.pubsubdb.json' );
    await fs.writeFile(newPath, json, 'utf8');
    console.log(`JSON saved at ${newPath}`);
  }

}

export { CompilerService };
