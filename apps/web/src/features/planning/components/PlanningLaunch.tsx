'use client';

import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useLaunchPreview, useLaunchReceipt } from '@/services/planning.service';
import PlanningLaunchApproval from './PlanningLaunchApproval';
import PlanningLaunchBaseline from './PlanningLaunchBaseline';
import PlanningLaunchReceipt from './PlanningLaunchReceipt';
import PlanningLaunchSummary from './PlanningLaunchSummary';

export default function PlanningLaunch({
  projectRef,
  draftId,
  draftVersion,
}: {
  projectRef: string;
  draftId: number;
  draftVersion: number;
}) {
  const t = useTranslations('documents.planning.launch');
  const preview = useLaunchPreview(projectRef, draftId);
  const receipt = useLaunchReceipt(projectRef, draftId);
  if (receipt.isPending || preview.isPending) return <p role="status">{t('loading')}</p>;
  if (receipt.isError || preview.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('loadFailed')}</AlertTitle>
        <AlertDescription>
          <p>{(receipt.error ?? preview.error)?.message}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void receipt.refetch();
              void preview.refetch();
            }}
          >
            {t('retry')}
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (receipt.data?.wbsVersion === draftVersion)
    return <PlanningLaunchReceipt projectRef={projectRef} receipt={receipt.data} />;
  if (!preview.data) return null;
  const approvalKey = [
    preview.data.source?.wbsVersion ?? 'no-wbs',
    preview.data.source?.proposalVersion ?? 'no-proposal',
    ...preview.data.risks.map((risk) => risk.code).sort(),
  ].join(':');

  return (
    <div className="space-y-4">
      <PlanningLaunchSummary preview={preview.data} />
      <PlanningLaunchBaseline preview={preview.data} />
      <PlanningLaunchApproval
        key={approvalKey}
        projectRef={projectRef}
        draftId={draftId}
        preview={preview.data}
        refreshing={preview.isFetching || receipt.isFetching}
        onRecoverReceipt={async () => {
          await receipt.refetch();
        }}
        onRefresh={() => {
          void receipt.refetch();
          void preview.refetch();
        }}
      />
    </div>
  );
}
