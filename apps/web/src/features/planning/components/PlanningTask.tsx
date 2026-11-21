'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { PlanSource, PlanTask } from '@/lib/api/endpoints/planning';
import { taskCode } from '../utils/planningWbs';
import PlanningTaskDeliverable from './PlanningTaskDeliverable';
import PlanningTaskInformation from './PlanningTaskInformation';
import PlanningTaskRequirements from './PlanningTaskRequirements';
import PlanningTaskSources from './PlanningTaskSources';

export default function PlanningTask({
  task,
  tasks,
  sources,
  onChange,
  onRemove,
}: {
  task: PlanTask;
  tasks: PlanTask[];
  sources: PlanSource[];
  onChange?: (task: PlanTask) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('documents.planning');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">
          {taskCode(tasks, task.id)}
        </p>
        <h3 className="mt-1 font-heading text-lg font-semibold" dir="auto">
          {task.title || t('untitledTask')}
        </h3>
      </div>
      <PlanningTaskInformation task={task} onChange={onChange} />
      <PlanningTaskDeliverable task={task} onChange={onChange} />
      <PlanningTaskRequirements task={task} tasks={tasks} onChange={onChange} />
      <PlanningTaskSources task={task} sources={sources} onChange={onChange} />
      {onChange && onRemove && (
        <div className="border-t pt-4">
          <Button type="button" variant="outline" onClick={onRemove}>
            {t('remove')}
          </Button>
        </div>
      )}
    </div>
  );
}
