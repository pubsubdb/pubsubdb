import { A } from "../../../services/a/index";

describe("AbbreviatorService", () => {
  describe("abbreviations", () => {
    it("should correctly abbreviate properties", () => {
      const obj = {
        [A.activity_id]: "someActivityId",
        [A.activity_type]: "someActivityType",
        [A.activity_subtype]: "someActivitySubtype",
        [A.job_id]: "someJobId",
        [A.activity_created]: "someActivityCreated",
        [A.activity_updated]: "someActivityUpdated",
      };

      expect(obj).toEqual({
        aid: "someActivityId",
        atp: "someActivityType",
        stp: "someActivitySubtype",
        jid: "someJobId",
        ac: "someActivityCreated",
        au: "someActivityUpdated",
      });
    });
  });

  describe("expand()", () => {
    it("should expand abbreviated properties to their original form", () => {
      const obj = {
        aid: "someActivityId",
        atp: "someActivityType",
        stp: "someActivitySubtype",
        jid: "someJobId",
        ac: "someActivityCreated",
        au: "someActivityUpdated",
      };

      const expandedObj = A.expand(obj);

      expect(expandedObj).toEqual({
        activity_id: "someActivityId",
        activity_type: "someActivityType",
        activity_subtype: "someActivitySubtype",
        job_id: "someJobId",
        activity_created: "someActivityCreated",
        activity_updated: "someActivityUpdated",
      });
    });
  });

  describe("abbreviate() and expand()", () => {
    it("should abbreviate and expand object keys correctly", () => {
      const originalObj = {
        activity_id: "test-aid",
        activity_type: "test-atp",
        activity_subtype: "test-stp",
        app_id: "test-app",
        app_version: "test-vrs",
        job_id: "test-jid",
        job_key: "test-key",
        time_series: "test-ts",
        job_created: "test-jc",
        job_updated: "test-ju",
        job_status: "test-js",
        activity_created: "test-ac",
        activity_updated: "test-au",
      };

      const expectedAbbreviatedObj = {
        aid: "test-aid",
        atp: "test-atp",
        stp: "test-stp",
        app: "test-app",
        vrs: "test-vrs",
        jid: "test-jid",
        key: "test-key",
        ts: "test-ts",
        jc: "test-jc",
        ju: "test-ju",
        js: "test-js",
        ac: "test-ac",
        au: "test-au",
      };

      const abbreviatedObj = A.abbreviate(originalObj);
      expect(abbreviatedObj).toEqual(expectedAbbreviatedObj);

      const expandedObj = A.expand(abbreviatedObj);
      expect(expandedObj).toEqual(originalObj);
    });
  });
});
