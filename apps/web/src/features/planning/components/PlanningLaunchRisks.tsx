'use client';

import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import type { ReadinessIssue } from '@/lib/api/endpoints/planning';

export default function PlanningLaunchRisks({
  risks,
  acknowledged,
  onToggle,
}: {
  risks: ReadinessIssue[];
  acknowledged: Set<string>;
  onToggle: (code: string, checked: boolean) => void;
}) {
  const t = useTranslations('documents.planning.launch');
  if (risks.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="font-semibold">{t('riskTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('riskHelp')}</p>
      </div>
      {risks.map((risk) => (
        <label className="flex items-start gap-3 rounded-md border p-3" key={risk.code}>
          <Checkbox
            className="mt-0.5"
            checked={acknowledged.has(risk.code)}
            onCheckedChange={(checked) => onToggle(risk.code, checked === true)}
          />
          <span className="text-sm">
            <span className="font-medium">{risk.code}</span>
            <span className="mt-1 block" dir="auto">
              {risk.explanation}
            </span>
            <span className="mt-1 block text-muted-foreground" dir="auto">
              {risk.nextAction}
            </span>
          </span>
        </label>
      ))}
    </section>
  );
}
