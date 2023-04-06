import $RefParser from '@apidevtools/json-schema-ref-parser';

class CompilerService {

  constructor() {
    //The compiler service converts a graph into a runnable program. It expects a yaml
    //file as input and outputs a runnable program by persisting to Redis.

    //The constructor should accept the graph object in JSON format. The Y
  }

  public async compile(): Promise<void> {
    try {
      const mySchemaPath = '/app/seeds/activities/trigger.yaml';
      const schema = await $RefParser.dereference(mySchemaPath);
      console.log(schema);
    } catch(err) {
      console.error(err);
    }
  }

}

export { CompilerService };
