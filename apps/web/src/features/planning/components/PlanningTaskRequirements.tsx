import { useTranslations } from 'next-intl';
import { Textarea } from '@/components/ui/textarea';
import type { PlanTask } from '@/lib/api/endpoints/planning';
import { taskCode } from '../utils/planningWbs';
import PlanningTaskDependencies from './PlanningTaskDependencies';

export default function PlanningTaskRequirements({
  task,
  tasks,
  onChange,
}: {
  task: PlanTask;
  tasks: PlanTask[];
  onChange?: (task: PlanTask) => void;
}) {
  const t = useTranslations('documents.planning');
  const hasChildren = tasks.some((candidate) => candidate.parentId === task.id);

  return (
    <section className="space-y-4 border-t pt-4">
      <div>
        <h4 className="text-sm font-semibold">Yêu cầu thực hiện</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Kỹ năng, vị trí trong WBS và các công việc cần hoàn thành trước.
        </p>
      </div>
      {onChange ? (
        <>
          <label className="block text-sm">
            {t('requiredSkills')}
            <Textarea
              value={task.requiredSkills.join('\n')}
              onChange={(event) =>
                onChange({ ...task, requiredSkills: event.target.value.split('\n') })
              }
            />
          </label>
          <label className="block text-sm">
            {t('parent')}
            <select
              className="mt-1 block h-9 w-full rounded-md border bg-background px-3"
              value={task.parentId ?? ''}
              onChange={(event) => onChange({ ...task, parentId: event.target.value || null })}
            >
              <option value="">{t('rootTask')}</option>
              {tasks
                .filter((other) => !hasChildren && other.id !== task.id && other.parentId === null)
                .map((other) => (
                  <option key={other.id} value={other.id}>
                    {taskCode(tasks, other.id)} — {other.title || t('untitledTask')}
                  </option>
                ))}
            </select>
          </label>
        </>
      ) : (
        task.requiredSkills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {task.requiredSkills.map((skill) => (
              <span key={skill} className="rounded-full border px-2.5 py-1 text-xs" dir="auto">
                {skill}
              </span>
            ))}
          </div>
        )
      )}
      <PlanningTaskDependencies task={task} tasks={tasks} onChange={onChange} />
    </section>
  );
}
