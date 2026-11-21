'use client';

import Link from 'next/link';
import { ArrowRight, Bot, CalendarClock, ListTodo, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import { useSession } from '@/lib/auth-client';
import { aiTeamPath, projectPath } from '@/utils/paths';
import { parseDate } from '@/utils/dates';
import { Button } from '@/components/ui/button';

export default function DashboardWorkspaceOverview({ project }: { project: ProjectDetail }) {
  const t = useTranslations('dashboards.workspace');
  const { data: session } = useSession();
  const projectRef = project.project.ref;
  const activeColumnIds = new Set(
    project.columns
      .filter((column) => !['completed', 'canceled'].includes(column.stateType))
      .map((column) => column.id),
  );
  const activeIssues = project.issues.filter((issue) => activeColumnIds.has(issue.columnId));
  const myTaskCount = activeIssues.filter(
    (issue) => issue.assigneeUserId === session?.user.id,
  ).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoonLimit = today.getTime() + 7 * 24 * 60 * 60 * 1000;
  const dueSoonCount = activeIssues.filter((issue) => {
    if (!issue.dueDate) return false;
    const dueDate = parseDate(issue.dueDate);
    if (!dueDate) return false;
    const dueAt = dueDate.getTime();
    return dueAt >= today.getTime() && dueAt <= dueSoonLimit;
  }).length;

  const cards = [
    {
      key: 'myTasks',
      icon: ListTodo,
      title: t('myTasks.title'),
      description: t('myTasks.description'),
      value: t('taskCount', { count: myTaskCount }),
      href: projectPath(projectRef),
    },
    {
      key: 'dueSoon',
      icon: CalendarClock,
      title: t('dueSoon.title'),
      description: t('dueSoon.description'),
      value: t('taskCount', { count: dueSoonCount }),
      href: projectPath(projectRef),
    },
    {
      key: 'approval',
      icon: ShieldCheck,
      title: t('approval.title'),
      description: t('approval.description'),
      value: t('openWorkspace'),
      href: `${projectPath(projectRef)}/planning`,
    },
    {
      key: 'aiActivity',
      icon: Bot,
      title: t('aiActivity.title'),
      description: t('aiActivity.description'),
      value: t('openWorkspace'),
      href: aiTeamPath(projectRef, 'queue'),
    },
  ] as const;

  return (
    <section className="mb-8 space-y-5" aria-labelledby="workspace-overview-title">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-8">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" />
              {t('eyebrow')}
            </div>
            <h1
              id="workspace-overview-title"
              className="font-heading text-2xl font-semibold tracking-[-0.025em] text-balance sm:text-3xl"
              dir="auto"
            >
              {t('greeting', { project: project.project.name })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground" dir="auto">
              {project.project.description || t('summaryFallback')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={projectPath(projectRef)}>{t('viewTasks')}</Link>
            </Button>
            <Button asChild>
              <Link href={`${projectPath(projectRef)}/planning`}>
                <Sparkles />
                {t('planWithAi')}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group rounded-xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <card.icon className="size-4" />
              </div>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="mt-4 text-sm font-semibold">{card.title}</p>
            <p className="mt-1 font-heading text-xl font-semibold tracking-tight">{card.value}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.description}</p>
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <span className="font-heading text-sm font-semibold tracking-tight">{t('analytics')}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </section>
  );
}
