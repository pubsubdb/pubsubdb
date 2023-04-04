type PipeItem = string | boolean | number;

type Pipe = (PipeItem[] | Pipe)[];

export { Pipe, PipeItem };