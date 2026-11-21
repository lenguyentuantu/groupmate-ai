'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/core/client';
import type { LaunchPreview } from '@/lib/api/endpoints/planning';
import { useApproveLaunch } from '@/services/planning.service';
import PlanningLaunchApprovalDialog from './PlanningLaunchApprovalDialog';
import PlanningLaunchBaseline from './PlanningLaunchBaseline';
import PlanningLaunchRisks from './PlanningLaunchRisks';

export default function PlanningLaunchApproval({
  projectRef,
  draftId,
  preview,
  refreshing,
  onRecoverReceipt,
  onRefresh,
}: {
  projectRef: string;
  draftId: number;
  preview: LaunchPreview;
  refreshing: boolean;
  onRecoverReceipt: () => Promise<void>;
  onRefresh: () => void;
}) {
  const t = useTranslations('documents.planning.launch');
  const approve = useApproveLaunch(projectRef, draftId);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const riskCodes = preview.risks.map((risk) => risk.code);
  const canApprove =
    preview.status !== 'blocked' &&
    preview.baseline !== null &&
    preview.source !== null &&
    !refreshing &&
    riskCodes.every((code) => acknowledged.has(code));

  function errorMessage(error: unknown) {
    if (!(error instanceof ApiError)) return t('approvalFailed');
    const messages: Record<string, string> = {
      P4_STALE_SOURCE: t('staleSource'),
      P4_BLOCKED: t('blockedError'),
      P4_APPROVAL_CONFLICT: t('approvalConflict'),
      P4_MATERIALIZATION_FAILED: t('materializationFailed'),
    };
    return (error.code && messages[error.code]) || error.message;
  }

  async function confirmApproval() {
    if (!preview.source || !canApprove) return;
    const approvalIntent = intentId ?? crypto.randomUUID();
    setIntentId(approvalIntent);
    try {
      await approve.mutateAsync({
        wbsVersion: preview.source.wbsVersion,
        proposalVersion: preview.source.proposalVersion,
        intentId: approvalIntent,
        acknowledgedRiskCodes: [...acknowledged].sort(),
      });
      setActionError(null);
      setDialogOpen(false);
    } catch (error) {
      setActionError(errorMessage(error));
      await onRecoverReceipt();
    }
  }

  return (
    <>
      <PlanningLaunchRisks
        preview={preview}
        acknowledged={acknowledged}
        onToggle={(code, checked) => {
          setAcknowledged((current) => {
            const next = new Set(current);
            if (checked) next.add(code);
            else next.delete(code);
            return next;
          });
        }}
      />
      <PlanningLaunchBaseline preview={preview} />
      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>{t('approvalFailedTitle')}</AlertTitle>
          <AlertDescription>
            <p>{actionError}</p>
            <p>{t('retrySameIntent')}</p>
          </AlertDescription>
        </Alert>
      )}
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
        <h2 className="font-heading font-semibold">Xác nhận triển khai</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Phê duyệt sẽ tạo {preview.baseline?.tasks.length ?? 0} công việc, trong đó{' '}
          {preview.summary.actionableTaskCount - preview.summary.assignedTaskCount} công việc chưa
          phân công sẽ vào backlog.
        </p>
        {preview.risks.length > 0 && (
          <p className="mt-2 text-sm font-medium">
            Đã xác nhận {acknowledged.size}/{preview.risks.length} rủi ro cần xem xét.
          </p>
        )}
        {preview.blockers.length > 0 && (
          <p className="mt-2 text-sm text-destructive">{t('blockedHelp')}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={!canApprove} onClick={() => setDialogOpen(true)}>
            {t('reviewApproval')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={approve.isPending || refreshing}
            onClick={() => {
              setIntentId(null);
              setActionError(null);
              setAcknowledged(new Set());
              onRefresh();
            }}
          >
            {t('refreshPreview')}
          </Button>
        </div>
      </div>
      <PlanningLaunchApprovalDialog
        open={dialogOpen}
        pending={approve.isPending}
        taskCount={preview.baseline?.tasks.length ?? 0}
        error={actionError}
        onOpenChange={setDialogOpen}
        onConfirm={() => void confirmApproval()}
      />
    </>
  );
}
