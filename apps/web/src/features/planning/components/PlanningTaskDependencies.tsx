import { useTranslations } from 'next-intl';
import type { PlanTask } from '@/lib/api/endpoints/planning';
import { cn } from '@/lib/utils';
import { taskCode } from '../utils/planningWbs';

export default function PlanningTaskDependencies({
  task,
  tasks,
  onChange,
}: {
  task: PlanTask;
  tasks: PlanTask[];
  onChange?: (task: PlanTask) => void;
}) {
  const t = useTranslations('documents.planning');
  const dependencies = task.dependencyIds.map((id) =>
    tasks.find((candidate) => candidate.id === id),
  );
  if (!onChange && dependencies.length === 0) return null;
  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">{t('dependencies')}</h4>
      {onChange ? (
        <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg bg-muted/40 p-2">
          {tasks
            .filter((candidate) => candidate.id !== task.id)
            .map((candidate) => (
              <label
                key={candidate.id}
                className={cn(
                  'flex items-start gap-2 rounded border border-transparent px-2 py-1.5 text-sm hover:bg-muted',
                  task.dependencyIds.includes(candidate.id) &&
                    'border-primary/25 bg-primary/10 font-medium',
                )}
              >
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={task.dependencyIds.includes(candidate.id)}
                  onChange={(event) =>
                    onChange({
                      ...task,
                      dependencyIds: event.target.checked
                        ? [...task.dependencyIds, candidate.id]
                        : task.dependencyIds.filter((id) => id !== candidate.id),
                    })
                  }
                />
                <span dir="auto">
                  {taskCode(tasks, candidate.id)} — {candidate.title || t('untitledTask')}
                </span>
              </label>
            ))}
          {task.dependencyIds
            .filter((id) => !tasks.some((candidate) => candidate.id === id))
            .map((id) => (
              <label
                key={id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    onChange({
                      ...task,
                      dependencyIds: task.dependencyIds.filter((value) => value !== id),
                    })
                  }
                />
                {t('unresolvedDependency')}
              </label>
            ))}
        </div>
      ) : (
        <ul className="space-y-1 text-sm">
          {dependencies.map((dependency, index) => (
            <li key={task.dependencyIds[index]} dir="auto">
              {dependency
                ? `${taskCode(tasks, dependency.id)} — ${dependency.title || t('untitledTask')}`
                : t('unresolvedDependency')}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
