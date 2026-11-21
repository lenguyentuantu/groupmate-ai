'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import OnOffStatus from '@/components/common/fields/OnOffStatus';
import SettingsCard from '@/components/common/page/SettingsCard';
import SettingsRow from '@/components/common/page/SettingsRow';
import SettingsSection from '@/components/common/page/SettingsSection';
import {
  useTaskLifecycleSettingsQuery,
  useUpdateTaskLifecycleSettings,
} from '../../services/settings.service';

export default function NotificationLifecycleAutomation({ projectKey }: { projectKey: string }) {
  const { isOwner } = usePermissions();
  const query = useTaskLifecycleSettingsQuery(projectKey);
  const update = useUpdateTaskLifecycleSettings(projectKey);
  const [reminderHours, setReminderHours] = useState(24);
  const [escalationHours, setEscalationHours] = useState(48);

  useEffect(() => {
    if (!query.data) return;
    setReminderHours(query.data.reminderHours);
    setEscalationHours(query.data.escalationHours);
  }, [query.data]);

  if (!query.data) return null;
  const valid = reminderHours >= 1 && escalationHours > reminderHours && escalationHours <= 720;
  const save = (enabled = query.data.enabled) =>
    update.mutate({ enabled, reminderHours, escalationHours });

  return (
    <SettingsSection
      title="Nhắc việc thông minh"
      description="Theo dõi công việc đã sẵn sàng nhưng chưa bắt đầu. Tính năng mặc định tắt và không áp dụng hồi tố."
    >
      <SettingsCard className="divide-y divide-border/60">
        <SettingsRow
          title="Tự động hóa vòng đời công việc"
          description="Thông báo ngay khi hết phụ thuộc, sau đó nhắc thành viên và báo Leader theo ngưỡng đã chọn."
          control={
            isOwner ? (
              <Switch
                checked={query.data.enabled}
                disabled={update.isPending || !valid}
                onCheckedChange={(enabled) => save(enabled)}
              />
            ) : (
              <OnOffStatus on={query.data.enabled}>
                {query.data.enabled ? 'Đang bật' : 'Đang tắt'}
              </OnOffStatus>
            )
          }
        />
        {query.data.enabled && (
          <>
            <SettingsRow
              title="Nhắc thành viên"
              description="Số giờ công việc ở trạng thái sẵn sàng nhưng chưa bắt đầu."
              control={
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  max={719}
                  value={reminderHours}
                  disabled={!isOwner || update.isPending}
                  onChange={(event) => setReminderHours(Number(event.target.value))}
                />
              }
            />
            <SettingsRow
              title="Báo Leader"
              description="Phải muộn hơn thời điểm nhắc thành viên."
              control={
                <Input
                  className="w-24"
                  type="number"
                  min={2}
                  max={720}
                  value={escalationHours}
                  disabled={!isOwner || update.isPending}
                  onChange={(event) => setEscalationHours(Number(event.target.value))}
                />
              }
            />
            {isOwner && (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BellRing className="size-4" />
                  {valid
                    ? 'Thay đổi chỉ áp dụng cho chu kỳ tiếp theo.'
                    : 'Ngưỡng báo Leader phải lớn hơn ngưỡng nhắc.'}
                </div>
                <Button size="sm" disabled={!valid || update.isPending} onClick={() => save()}>
                  Lưu ngưỡng
                </Button>
              </div>
            )}
          </>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
