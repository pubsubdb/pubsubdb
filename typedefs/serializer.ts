export type FlatObject = { [key: string]: string };

export interface JSONSchema {
  type?: string;
  enum?: string[];
  examples?: any[];
  properties?: { [key: string]: JSONSchema };
  items?: JSONSchema;
  description?: string;
  'x-train'?: boolean; //extension property to mark item `values` as not being trainable (ssn, dob, guids are examples of fields that should never have their `values` trained)
}

export type AbbreviationObjects = {
  [key: string]: {
    [key: string]: string;
  }
}

export type FlatDocument = {
  [key: string]: string;
};

export type MultiDimensionalDocument = {
  [key: string]: any;
};

export type AbbreviationMap = Map<string, string>;
export type AbbreviationMaps = Map<string, AbbreviationMap>;
