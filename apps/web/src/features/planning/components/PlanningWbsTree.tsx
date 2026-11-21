'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, GitBranch, ListTree } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PlanSource, PlanTask } from '@/lib/api/endpoints/planning';
import { cn } from '@/lib/utils';
import { buildWbs, taskCode } from '../utils/planningWbs';
import PlanningTask from './PlanningTask';

export default function PlanningWbsTree({
  tasks,
  sources,
  onChange,
  onRemove,
}: {
  tasks: PlanTask[];
  sources: PlanSource[];
  onChange?: (task: PlanTask) => void;
  onRemove?: (task: PlanTask) => void;
}) {
  const t = useTranslations('documents.planning');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const { roots, children } = buildWbs(tasks);
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null;

  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [selectedTask?.id]);

  function effort(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours > 0 && remainder > 0) return t('effortHoursMinutes', { hours, minutes: remainder });
    if (hours > 0) return t('effortHours', { hours });
    return t('effortMinutes', { minutes: remainder });
  }

  function row(task: PlanTask, child: boolean) {
    const taskChildren = children.get(task.id) ?? [];
    const hasChildren = taskChildren.length > 0;
    const isExpanded = expanded.has(task.id);
    const selected = selectedTask?.id === task.id;

    return (
      <li key={task.id} className={child ? 'ms-7' : undefined}>
        <button
          type="button"
          className={cn(
            'flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            selected && 'bg-primary/10 text-foreground',
          )}
          aria-expanded={hasChildren ? isExpanded : undefined}
          onClick={() => {
            setSelectedId(task.id);
            if (!hasChildren) return;
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(task.id)) next.delete(task.id);
              else next.add(task.id);
              return next;
            });
          }}
        >
          <ChevronRight
            className={cn(
              'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
              !hasChildren && 'invisible',
              isExpanded && 'rotate-90',
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-semibold text-primary">{taskCode(tasks, task.id)}</span>
              <span className="min-w-0 font-medium" dir="auto">
                {task.title || t('untitledTask')}
              </span>
              {hasChildren && (
                <span className="text-xs text-muted-foreground">
                  {t('childTaskCount', { count: taskChildren.length })}
                </span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
                {t(task.priority)}
              </span>
              {task.estimateMinutes !== null && <span>{effort(task.estimateMinutes)}</span>}
              {task.dependencyIds.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="size-3" />
                  {task.dependencyIds.length}
                </span>
              )}
            </span>
          </span>
        </button>
        {hasChildren && isExpanded && (
          <ul className="mt-1 space-y-1 border-s ps-1">
            {taskChildren.map((taskChild) => row(taskChild, true))}
          </ul>
        )}
      </li>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        {t('emptyWbs')}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 gap-4 lg:h-[70dvh] lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.35fr)]">
      <nav
        className="min-w-0 rounded-xl border bg-background p-2 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
        aria-label={t('tasks')}
      >
        <ul className="space-y-1">{roots.map((task) => row(task, false))}</ul>
      </nav>
      <div
        ref={detailRef}
        className="min-w-0 rounded-xl border bg-background p-4 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
      >
        {selectedTask ? (
          <PlanningTask
            task={selectedTask}
            tasks={tasks}
            sources={sources}
            onChange={onChange}
            onRemove={onRemove ? () => onRemove(selectedTask) : undefined}
          />
        ) : (
          <div className="grid min-h-64 place-items-center text-center text-sm text-muted-foreground">
            <div>
              <ListTree className="mx-auto mb-2 size-6 text-primary" />
              {t('selectTaskHelp')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
