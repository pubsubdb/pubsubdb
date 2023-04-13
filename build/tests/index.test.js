"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const redis_1 = require("../cache/redis");
const keyStore_1 = require("../services/store/keyStore");
describe('pubsubdb', () => {
    const appConfig = { id: 'test-app', version: '1' };
    const CONNECTION_KEY = 'manual-test-connection';
    let pubSubDB;
    let redisConnection;
    let redisClient;
    let redisStore;
    beforeAll(async () => {
        redisConnection = await redis_1.RedisConnection.getConnection(CONNECTION_KEY);
        redisClient = await redisConnection.getClient();
        redisClient.flushDb();
        redisStore = new index_1.RedisStore(redisClient);
    });
    afterAll(async () => {
        await redis_1.RedisConnection.disconnectAll();
    });
    describe('init()', () => {
        it('should initialize PubSubDB', async () => {
            const config = {
                appId: appConfig.id,
                namespace: keyStore_1.PSNS,
                store: redisStore
            };
            pubSubDB = await index_1.PubSubDB.init(config);
        });
    });
    describe('plan()', () => {
        it('should plan an app version deployment using a source path', async () => {
            await pubSubDB.plan('/app/seeds/pubsubdb.yaml');
        });
    });
    describe('deploy()', () => {
        it('should deploy an app version using a source path', async () => {
            await pubSubDB.deploy('/app/seeds/pubsubdb.yaml');
        });
    });
    describe('activate()', () => {
        it('should activate a deployed app version', async () => {
            await pubSubDB.activate(appConfig.version);
        });
    });
    describe('pub()', () => {
        it('should should publish a message', async () => {
            let payload;
            for (let i = 0; i < 1; i++) {
                payload = {
                    id: `ord_${parseInt((Math.random() * 1000000).toString()).toString()}`,
                    price: 49.99 + i,
                    object_type: i % 2 ? 'widget' : 'order'
                };
                await pubSubDB.pub('order.approval.price.requested', payload);
            }
        });
        it('should distribute messages to different job queues', async () => {
            const sizes = ['sm', 'md', 'lg'];
            const primacies = ['primary', 'secondary', 'tertiary'];
            const colors = ['red', 'yellow', 'blue'];
            const facilities = ['acme', 'spacely', 'cogswell'];
            let i = 1001;
            for (let j = 0; j < 1; j++) {
                for (const size of sizes) {
                    for (const primacy of primacies) {
                        for (const color of colors) {
                            for (const facility of facilities) {
                                const payload = {
                                    id: `ord_${i++}`,
                                    size,
                                    primacy,
                                    color,
                                    facility,
                                    send_date: new Date(),
                                    must_release_series: '202304120015'
                                };
                                await pubSubDB.pub('order.scheduled', payload);
                            }
                        }
                    }
                }
            }
        });
    });
});