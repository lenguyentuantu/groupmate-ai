import { useTranslations } from 'next-intl';
import type { PlanSource, PlanTask } from '@/lib/api/endpoints/planning';
import { sourceReference } from '../utils/planningWbs';

export default function PlanningTaskSources({
  task,
  sources,
  onChange,
}: {
  task: PlanTask;
  sources: PlanSource[];
  onChange?: (task: PlanTask) => void;
}) {
  const t = useTranslations('documents.planning');
  const references = task.sourceRefs.map((reference) => ({
    reference,
    resolved: sourceReference(reference, sources),
  }));
  if (!onChange && references.length === 0) return null;
  return (
    <section className="space-y-3 border-t pt-4">
      <h4 className="text-sm font-semibold">{t('sourceReferences')}</h4>
      {references.map(({ reference, resolved }, index) => (
        <details key={`${reference}-${index}`} className="rounded-lg bg-muted/45 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            {resolved?.kind === 'brief'
              ? t('projectBrief')
              : (resolved?.filename ?? t('sourceUnavailable'))}
          </summary>
          {resolved?.kind === 'block' && (
            <p className="mt-2 text-sm leading-6 whitespace-pre-wrap" dir="auto">
              {resolved.excerpt}
            </p>
          )}
        </details>
      ))}
      {onChange && (
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            {t('editSourceReferences')}
          </summary>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={task.sourceRefs.includes('brief')}
                onChange={(event) =>
                  onChange({
                    ...task,
                    sourceRefs: event.target.checked
                      ? [...task.sourceRefs, 'brief']
                      : task.sourceRefs.filter((reference) => reference !== 'brief'),
                  })
                }
              />
              {t('projectBrief')}
            </label>
            {sources.flatMap((source) =>
              source.blocks.map((block, index) => (
                <label
                  key={block.ref}
                  className="flex items-start gap-2 rounded p-2 text-sm hover:bg-muted"
                >
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={task.sourceRefs.includes(block.ref)}
                    onChange={(event) =>
                      onChange({
                        ...task,
                        sourceRefs: event.target.checked
                          ? [...task.sourceRefs, block.ref]
                          : task.sourceRefs.filter((reference) => reference !== block.ref),
                      })
                    }
                  />
                  <span>
                    <span className="font-medium">{source.filename}</span>
                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" dir="auto">
                      {t('sourceExcerpt', { number: index + 1 })}: {block.text}
                    </span>
                  </span>
                </label>
              )),
            )}
            {task.sourceRefs
              .filter(
                (reference) =>
                  reference !== 'brief' && sourceReference(reference, sources) === null,
              )
              .map((reference) => (
                <label key={reference} className="flex items-center gap-2 text-sm text-destructive">
                  <input
                    type="checkbox"
                    checked
                    onChange={() =>
                      onChange({
                        ...task,
                        sourceRefs: task.sourceRefs.filter((value) => value !== reference),
                      })
                    }
                  />
                  {t('sourceUnavailable')}
                </label>
              ))}
          </div>
        </details>
      )}
    </section>
  );
}
