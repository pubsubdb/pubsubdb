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

export type SymbolRanges = { //keyname is <ns>:<app>:symbols:
  [key: string]: number; //eg: {"$": 0, "a1": 26, "a2" 39, "$metadata_cursor": 39, "$data_cursor": 2704} (job ($) holds range 0-26; every other activity has a number that increments by 13; up to 200+ unique activities may be modeled; the :cursor fields are used by the sytem to track the next reserved tranche using hincrby
}

//each activity/job is granted 286 tranche of symbols (26 for metadata, 260 for data)
//typically, 5-10 symbols are used for metadata (aid, atp, etc), but it allows for expansion...
//260 remaining data symbols allow for 260 unique mapping statements as it is
//the mapping statements are used to define the range of symbols to use for
//data mapping. if a1 maps to a1.output.data.abc and a2 maps to a2.output.data.def,
//then when a1 saves its output, it will only save the field values abc, and def. When
//saved to the backend it would be: {a1: {data: { abc: 'somevalue', def: 'another' }}
//when flattened and deflated, the keys would be 'bbb' and 'bbc' (or whatever the actual value)
//and the values would be 'somevalue' and 'another' respectively.

//the 'Symbols' that would come from the redis hash would represent the
//mapping between the field ('aaa') and the paths ('a1/data/abc`) for each activity
//metadata mapping is unnecessary as it is deterministic and uses the first 26 positions in the assigned character range

export type Symbols = { //keyname is <ns>:<app>:symbols:<aid> (where aid can be $ for job or a1, a2, etc. for activities)
  [key: string]: string; //eg: {"operation/name": "26", "a2" 39, ":cursor": 39} (job holds range 0-26; every other activity has a number that increments by 13; up to 200 activity ranges may be listed; one field called $count is used by the sytem to track the next reserved tranche using hincrby; job always seeds with 26
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
