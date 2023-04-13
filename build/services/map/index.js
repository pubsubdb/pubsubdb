"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapService = void 0;
class MapService {
    constructor() {
        //The MapService constructs the JSON tree by reading the mapping file
        //and creating the JSON tree using the field names (where each slash 
        //is a new level in the tree. The value of the field is resolved
        //by the PipeService, when the @pipe decorator is used. It is possible to map
        //values without incorporating the PipeService if they are simple values.
    }
}
exports.MapService = MapService;
