'use client';

import { useTranslations } from 'next-intl';
import type { MemberProfileInput } from '@/lib/api/endpoints/teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TeamMemberSkillFields({
  skills,
  onChange,
}: {
  skills: MemberProfileInput['skills'];
  onChange: (skills: MemberProfileInput['skills']) => void;
}) {
  const t = useTranslations('teams.profile');
  const update = (index: number, patch: Partial<MemberProfileInput['skills'][number]>) =>
    onChange(skills.map((skill, i) => (i === index ? { ...skill, ...patch } : skill)));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{t('skills')}</legend>
      <p className="text-xs text-muted-foreground">{t('skillsHelp')}</p>
      {skills.length === 0 && <p className="text-sm text-muted-foreground">{t('noSkills')}</p>}
      {skills.map((skill, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-32 flex-1"
            value={skill.name}
            required
            pattern=".*\S.*"
            maxLength={60}
            aria-label={t('skillName', { number: index + 1 })}
            placeholder={t('skillHint')}
            onChange={(event) => update(index, { name: event.target.value })}
            dir="auto"
          />
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={skill.proficiency}
            aria-label={t('proficiency', { number: index + 1 })}
            onChange={(event) => update(index, { proficiency: Number(event.target.value) })}
          >
            <option value={1}>{t('level1')}</option>
            <option value={2}>{t('level2')}</option>
            <option value={3}>{t('level3')}</option>
            <option value={4}>{t('level4')}</option>
            <option value={5}>{t('level5')}</option>
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('removeSkill', { number: index + 1 })}
            onClick={() => onChange(skills.filter((_, i) => i !== index))}
          >
            {t('remove')}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={skills.length >= 30}
        onClick={() => onChange([...skills, { name: '', proficiency: 1 }])}
      >
        {t('addSkill')}
      </Button>
    </fieldset>
  );
}
