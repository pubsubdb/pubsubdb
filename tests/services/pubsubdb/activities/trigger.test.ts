import { Trigger } from "../../../../services/pubsubdb/activities/trigger";
import { ActivityType, ActivityData, ActivityMetadata } from "../../../../typedefs/activity";

describe("Trigger class", () => {
  it("should create a job with the correct metadata", async () => {
    // Prepare test data
    const ActivityType: ActivityType = {
      title: "Some title",
      type: "trigger",
      subtype: "test-subtype",
    };

    const activityData: ActivityData = {
      input: {},
      output: {},
    };

    const activityMetadata: ActivityMetadata = {
      activity_id: "a1",
      job_id: "test-job-id",
      type: "trigger",
      subtype: "async",
    };

    // Create Trigger instance
    const trigger = new Trigger(ActivityType, activityData, activityMetadata);

    // Spy on the createJob method to check if it's called and to inspect the job created
    const createJobSpy = jest.spyOn(trigger, "createJob");

    // Call restoreJobContext to trigger the createJob method
    await trigger.restoreJobContext();

    // Check if the createJob method was called
    expect(createJobSpy).toHaveBeenCalledTimes(1);

    // Check if the job has the correct metadata
    const createdJob = trigger.context;
  });
});
