//interfaces for http route method inputs: params (Params), body (Body), query (Querystring)

interface Params {
  job_id: string;
  topic: string;
  [field: string]: string;
}

interface Body {
  [field: string]: string;
}

interface Query {
  [field: string]: string;
}

export { Params, Body, Query }