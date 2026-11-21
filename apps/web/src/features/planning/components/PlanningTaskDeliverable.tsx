import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PlanTask } from '@/lib/api/endpoints/planning';

export default function PlanningTaskDeliverable({
  task,
  onChange,
}: {
  task: PlanTask;
  onChange?: (task: PlanTask) => void;
}) {
  const t = useTranslations('documents.planning');
  if (!onChange && !task.deliverable && task.acceptanceCriteria.length === 0) return null;
  return (
    <section className="space-y-3 border-t pt-4">
      <h4 className="text-sm font-semibold">{t('deliverableAndAcceptance')}</h4>
      {onChange ? (
        <>
          <label className="block text-sm">
            {t('deliverable')}
            <Textarea
              maxLength={1000}
              value={task.deliverable}
              onChange={(event) => onChange({ ...task, deliverable: event.target.value })}
            />
          </label>
          <div>
            <p className="text-sm">{t('acceptanceCriteria')}</p>
            <div className="mt-2 space-y-2">
              {task.acceptanceCriteria.map((criterion, index) => (
                <div className="flex items-center gap-2" key={index}>
                  <Input
                    value={criterion}
                    aria-label={`Tiêu chí nghiệm thu ${index + 1}`}
                    onChange={(event) => {
                      const next = [...task.acceptanceCriteria];
                      next[index] = event.target.value;
                      onChange({ ...task, acceptanceCriteria: next });
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Xóa tiêu chí nghiệm thu ${index + 1}`}
                    onClick={() =>
                      onChange({
                        ...task,
                        acceptanceCriteria: task.acceptanceCriteria.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  onChange({ ...task, acceptanceCriteria: [...task.acceptanceCriteria, ''] })
                }
              >
                <Plus />
                Thêm tiêu chí nghiệm thu
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3 text-sm">
          {task.deliverable && (
            <p className="whitespace-pre-wrap" dir="auto">
              {task.deliverable}
            </p>
          )}
          {task.acceptanceCriteria.length > 0 && (
            <ul className="list-disc space-y-1 ps-5">
              {task.acceptanceCriteria.map((criterion, index) => (
                <li key={`${criterion}-${index}`} dir="auto">
                  {criterion}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
