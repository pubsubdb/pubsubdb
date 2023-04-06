import { CompilerService } from "../../../services/compiler";

describe("Compiler Service", () => {
  it("should compile YAML", async () => {
    const compilerService = new CompilerService();
    const activityMetadata = await compilerService.compile();
    expect(activityMetadata).not.toBeNull();
  });
});
