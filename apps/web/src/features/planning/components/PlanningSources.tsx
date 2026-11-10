'use client';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import ListPager from '@/components/common/ListPager';
import { usePaging } from '@/hooks/usePaging';
import { usePlanSources, useUploadPlanSource } from '@/services/planning.service';
import type { PlanSource } from '@/lib/api/endpoints/planning';

export default function PlanningSources({
  projectRef,
  selected,
  onChange,
  onUploaded,
}: {
  projectRef: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  onUploaded: (source: PlanSource) => void;
}) {
  const t = useTranslations('documents.planning');
  const paging = usePaging();
  const files = usePlanSources(projectRef, paging.params);
  const upload = useUploadPlanSource(projectRef);
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{t('sources')}</h2>
      <p>{t('limits')}</p>
      <label className="block">
        {t('upload')}
        <Input
          type="file"
          accept=".pdf,.docx"
          disabled={upload.isPending || selected.length >= 3}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              toast.error(t('fileTooLarge'));
              return;
            }
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const result = await upload.mutateAsync({
                  filename: file.name,
                  contentBase64: String(reader.result).split(',')[1],
                });
                onUploaded(result);
                onChange([...selected, result.attachmentId]);
              } catch {
                /* Mutation errors are toasted by the shared cache. */
              }
            };
            reader.onerror = () => toast.error(t('readFailed'));
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {upload.isPending && <p role="status">{t('extracting')}</p>}
      {files.isError && <p role="alert">{files.error.message}</p>}
      {files.data?.items.map((file) => (
        <label className="flex gap-2" key={file.attachmentId}>
          <input
            type="checkbox"
            checked={selected.includes(file.attachmentId)}
            disabled={!selected.includes(file.attachmentId) && selected.length >= 3}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, file.attachmentId]
                  : selected.filter((id) => id !== file.attachmentId),
              )
            }
          />
          {file.filename}
        </label>
      ))}
      <ListPager paging={paging} total={files.data?.total ?? 0} />
    </section>
  );
}
