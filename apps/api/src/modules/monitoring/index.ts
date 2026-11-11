import { Elysia } from 'elysia';
import { authContext } from '#shared/auth-context';
import { guards } from '#shared/guards';
import { commonErrors } from '#shared/responses';
import { monitoringResponse } from './model';
import { getProjectMonitoring } from './service';

export const monitoringRoutes = new Elysia({
  name: 'monitoring',
  detail: { tags: ['Monitoring'] },
})
  .use(authContext)
  .use(guards)
  .get('/projects/:projectKey/monitoring', ({ project }) => getProjectMonitoring(project.id), {
    permission: ['work_items', 'read'],
    response: { 200: monitoringResponse, ...commonErrors },
    detail: {
      summary: 'Get project monitoring findings',
      description: 'Evaluate deterministic Work Item monitoring rules for a project.',
    },
  });
