import { Deployer } from '../../../services/compiler/deployer';
import Manifest from '../../$setup/apps/calc/v1/.pubsubdb.calc.1.json';
import { PubSubDBManifest } from '../../../typedefs/pubsubdb';

const manifest: PubSubDBManifest = Manifest as PubSubDBManifest;

describe('Deployer', () => {
  let deployer: Deployer;

  beforeEach(() => {
    jest.resetAllMocks();
    deployer = new Deployer(manifest);
  });

  describe('copyJobSchemas()', () => {
    it('should properly copy job schemas from the manifest', async () => {
      deployer.copyJobSchemas();
      // Check that the input/output schemas have been copied to each activity's job schema
      deployer.manifest?.app.graphs.forEach(graph => {
        for (const activityKey in graph.activities) {
          const activity = graph.activities[activityKey];
          expect(activity.job).toBeDefined();
        }
      });
    });
  });
});
