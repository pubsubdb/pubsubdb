type PipeItem = string | boolean | number;

type PipeItems = PipeItem[];

type Pipe = (PipeItem[] | Pipe)[];

export { Pipe, PipeItem, PipeItems };