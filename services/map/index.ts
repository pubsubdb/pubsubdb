class MapService {

  constructor() {
    //The MapService constructs the JSON tree by reading the mapping file
    //and creating the JSON tree using the field names (where each slash 
    //is a new level in the tree. The value of the field is resolved
    //by the PipeService, when the @pipe decorator is used. It is possible to map
    //values without incorporating the PipeService if they are simple values.

    //todo: any issue with mapping rules using a tree and not being flat? might
    //      better enable iteartion and other things
  }
}

export { MapService };
