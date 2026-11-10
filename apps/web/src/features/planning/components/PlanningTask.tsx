'use client';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { PlanTask } from '@/lib/api/endpoints/planning';

export default function PlanningTask({
  task,
  tasks,
  onChange,
  onRemove,
}: {
  task: PlanTask;
  tasks: PlanTask[];
  onChange: (task: PlanTask) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('documents.planning');
  return (
    <details open className="space-y-3 rounded border p-4">
      <summary>
        {task.title || t('task')} <span className="text-xs text-muted-foreground">{task.id}</span>
      </summary>
      {(['title', 'description', 'deliverable'] as const).map((field) => (
        <label className="block" key={field}>
          {t(field === 'title' ? 'task' : field)}
          <Textarea
            maxLength={field === 'title' ? 200 : field === 'description' ? 4000 : 1000}
            value={task[field]}
            onChange={(e) => onChange({ ...task, [field]: e.target.value })}
          />
        </label>
      ))}
      <label className="block">
        {t('parent')}
        <select
          className="block w-full rounded border p-2"
          value={task.parentId ?? ''}
          onChange={(e) => onChange({ ...task, parentId: e.target.value || null })}
        >
          <option value="">{t('none')}</option>
          {tasks
            .filter((other) => other.id !== task.id && other.parentId === null)
            .map((other) => (
              <option key={other.id} value={other.id}>
                {other.title || other.id}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        {t('priority')}
        <select
          className="block w-full rounded border p-2"
          value={task.priority}
          onChange={(e) => onChange({ ...task, priority: e.target.value as PlanTask['priority'] })}
        >
          {(['low', 'medium', 'high', 'urgent'] as const).map((value) => (
            <option key={value} value={value}>
              {t(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {t('estimate')}
        <Input
          type="number"
          min={1}
          max={1000000}
          step={1}
          placeholder={t('unknown')}
          value={task.estimateMinutes ?? ''}
          onChange={(e) =>
            onChange({
              ...task,
              estimateMinutes: e.target.value === '' ? null : Number(e.target.value),
            })
          }
        />
      </label>
      {(['acceptanceCriteria', 'requiredSkills', 'dependencyIds', 'sourceRefs'] as const).map(
        (field) => (
          <label className="block" key={field}>
            {t(field)}
            <Textarea
              value={task[field].join('\n')}
              onChange={(e) => onChange({ ...task, [field]: e.target.value.split('\n') })}
            />
          </label>
        ),
      )}
      <Button type="button" variant="outline" onClick={onRemove}>
        {t('remove')}
      </Button>
    </details>
  );
}
