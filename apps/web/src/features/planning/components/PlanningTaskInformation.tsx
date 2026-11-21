import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PlanTask } from '@/lib/api/endpoints/planning';

export default function PlanningTaskInformation({
  task,
  onChange,
}: {
  task: PlanTask;
  onChange?: (task: PlanTask) => void;
}) {
  const t = useTranslations('documents.planning');

  if (!onChange) {
    return (
      <section className="space-y-3">
        <h4 className="text-sm font-semibold">{t('taskInformation')}</h4>
        {task.description && (
          <p className="text-sm whitespace-pre-wrap" dir="auto">
            {task.description}
          </p>
        )}
        <p className="text-xs font-medium text-muted-foreground">{t(task.priority)}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold">{t('taskInformation')}</h4>
      <label className="block text-sm">
        {t('task')}
        <Textarea
          required
          maxLength={200}
          value={task.title}
          onChange={(event) => onChange({ ...task, title: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        {t('description')}
        <Textarea
          maxLength={4000}
          value={task.description}
          onChange={(event) => onChange({ ...task, description: event.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          {t('priority')}
          <select
            className="mt-1 block h-9 w-full rounded-md border bg-background px-3"
            value={task.priority}
            onChange={(event) =>
              onChange({ ...task, priority: event.target.value as PlanTask['priority'] })
            }
          >
            {(['low', 'medium', 'high', 'urgent'] as const).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t('estimate')}
          <Input
            type="number"
            min={1}
            max={1000000}
            step={1}
            placeholder={t('notEstimated')}
            value={task.estimateMinutes ?? ''}
            onChange={(event) =>
              onChange({
                ...task,
                estimateMinutes: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        </label>
      </div>
    </section>
  );
}
