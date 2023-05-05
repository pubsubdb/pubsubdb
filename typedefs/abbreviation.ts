type AbbreviationMap = {
  [key: string]: string;
};

type ReverseAbbreviationMap = {
  [key in keyof AbbreviationMap as AbbreviationMap[key]]: key;
};

export { AbbreviationMap, ReverseAbbreviationMap };