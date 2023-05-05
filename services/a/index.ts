import { AbbreviationMap } from "../../typedefs/abbreviation";

class AbbreviatorService {
  [x: string]: any;
  private abbreviations: AbbreviationMap;

  constructor() {
    this.abbreviations = {
      activity_id: "aid",
      activity_type: "atp",
      activity_subtype: "stp",
      app_id: "app",
      app_version: "vrs",
      job_id: "jid",
      job_key: "key",
      time_series: "ts",
      job_created: "jc",
      job_updated: "ju",
      job_status: "js",
      activity_created: "ac",
      activity_updated: "au",
      // Add more abbreviations here
    };

    return new Proxy(this, {
      get(target, prop) {
        return target.abbreviations[prop as keyof AbbreviationMap] || Reflect.get(target, prop);
      },
    });
  }

  expand(obj: { [key: string]: any }): { [key: string]: any } {
    const expandedObj: { [key: string]: any } = {};
    const reverseAbbreviations: AbbreviationMap = Object.entries(this.abbreviations).reduce(
      (acc, [key, value]) => ({ ...acc, [value]: key }),
      {}
    );

    for (const [key, value] of Object.entries(obj)) {
      expandedObj[reverseAbbreviations[key] || key] = value;
    }

    return expandedObj;
  }

  abbreviate(obj: { [key: string]: any }): { [key: string]: any } {
    const abbreviatedObj: { [key: string]: any } = {};

    for (const [key, value] of Object.entries(obj)) {
      abbreviatedObj[this.abbreviations[key as keyof AbbreviationMap] || key] = value;
    }

    return abbreviatedObj;
  }
}

export const A = new AbbreviatorService();
