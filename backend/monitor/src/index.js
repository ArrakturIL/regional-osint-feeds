import { read } from './api/router.js';
import { runSchedule } from './schedule/runner.js';
export default {
  async scheduled(controller, env) {
    await runSchedule(controller, env);
  },
  fetch: read,
};