'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { ApprovalReceipt } from '@/lib/api/endpoints/planning';
import { formatDateTime } from '@/utils/dates';
import { issuePath, projectPath } from '@/utils/paths';

export default function PlanningLaunchReceipt({
  projectRef,
  receipt,
}: {
  projectRef: string;
  receipt: ApprovalReceipt;
}) {
  const t = useTranslations('documents.planning.launch');

  return (
    <section className="space-y-4 rounded-lg border border-green-600/40 bg-green-500/5 p-4">
      <div>
        <h2 className="font-semibold">{t('receiptTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('receiptHelp')}</p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">{t('approvedBy')}</dt>
          <dd dir="auto">{receipt.approvedByUserName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('approvedAt')}</dt>
          <dd>
            <time dateTime={receipt.approvedAt}>{formatDateTime(receipt.approvedAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('wbsVersion')}</dt>
          <dd>{receipt.wbsVersion}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('proposalVersion')}</dt>
          <dd>{receipt.proposalVersion}</dd>
        </div>
      </dl>
      <div>
        <h3 className="text-sm font-medium">{t('createdWorkItems')}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {receipt.workItemMappings.map((mapping) => (
            <Button asChild size="sm" variant="outline" key={mapping.sourceTaskId}>
              <Link href={issuePath(projectRef, mapping.sequenceNumber)}>
                {receipt.baseline.project.key}-{mapping.sequenceNumber}
              </Link>
            </Button>
          ))}
        </div>
      </div>
      {receipt.acknowledgedRiskCodes.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('acknowledgedRisks', { risks: receipt.acknowledgedRiskCodes.join(', ') })}
        </p>
      )}
      <Button asChild>
        <Link href={projectPath(projectRef)}>{t('openWorkItems')}</Link>
      </Button>
    </section>
  );
}
