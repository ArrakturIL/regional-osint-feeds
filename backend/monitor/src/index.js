import { read } from './api/router.js';
import { dispatchDueWorkflows } from './schedule/dispatch.js';
import { runSchedule } from './schedule/runner.js';
export default {
  async scheduled(controller, env) {
    // Collector workflow dispatch is independent of D1/collector health (SYS-01).
    const dispatch = dispatchDueWorkflows(env, controller.scheduledTime);
    try {
      await runSchedule(controller, env);
    } finally {
      await dispatch;
    }
  },
  fetch: read,
};
