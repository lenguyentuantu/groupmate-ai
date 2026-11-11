'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function PlanningLaunchApprovalDialog({
  open,
  pending,
  taskCount,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  taskCount: number;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('documents.planning.launch');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirmationTitle')}</DialogTitle>
          <DialogDescription>
            {t('confirmationDescription', { count: taskCount })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">{t('confirmationWarning')}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {pending ? t('approving') : t('confirmApproval')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
