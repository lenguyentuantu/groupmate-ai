import { useTranslations } from 'next-intl';
import type { PlanSource } from '@/lib/api/endpoints/planning';

export default function PlanningSourceInspector({ sources }: { sources: PlanSource[] }) {
  const t = useTranslations('documents.planning');

  if (sources.length === 0)
    return <p className="text-sm text-muted-foreground">{t('noSources')}</p>;

  return (
    <div className="space-y-2">
      {sources.map((source) => (
        <details key={source.attachmentId} className="rounded-lg border bg-card px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{source.filename}</summary>
          <div className="mt-3 space-y-3">
            {source.blocks.map((block, index) => (
              <div key={block.ref} className="rounded-md bg-muted/55 px-3 py-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('sourceExcerpt', { number: index + 1 })}
                </p>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap" dir="auto">
                  {block.text}
                </p>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
