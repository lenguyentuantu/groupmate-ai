'use client';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Plan } from '@/lib/api/endpoints/planning';

export default function PlanningFields({
  plan,
  onChange,
}: {
  plan: Plan;
  onChange: (plan: Plan) => void;
}) {
  const t = useTranslations('documents.planning');
  return (
    <div className="space-y-4">
      <label className="block">
        {t('name')}
        <Input
          required
          maxLength={200}
          value={plan.title}
          onChange={(e) => onChange({ ...plan, title: e.target.value })}
        />
      </label>
      <label className="block">
        {t('brief')}
        <Textarea
          maxLength={20000}
          rows={6}
          value={plan.brief}
          onChange={(e) => onChange({ ...plan, brief: e.target.value })}
        />
      </label>
      <label className="block">
        {t('deadline')}
        <Input
          type="date"
          value={plan.deadline ?? ''}
          onChange={(e) => onChange({ ...plan, deadline: e.target.value || null })}
        />
      </label>
      {(['objectives', 'assumptions', 'questions'] as const).map((field) => (
        <label className="block" key={field}>
          {t(field)}
          <Textarea
            value={plan[field].join('\n')}
            onChange={(e) => onChange({ ...plan, [field]: e.target.value.split('\n') })}
          />
        </label>
      ))}
      <p className="text-xs text-muted-foreground">{t('lines')}</p>
    </div>
  );
}
