import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Settings, Users } from 'lucide-react';
import { membersPath } from '@/utils/paths';
import { useSettingsNavGroups } from '@/hooks/useSettingsNavGroups';
import { usePermissions } from '@/hooks/usePermissions';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import SidebarNavItem from '@/components/layout/SidebarNavItem';

// Team membership and the settings entry remain visible in the primary navigation.
export default function SidebarConfigNav({ projectKey }: { projectKey: string | null }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const disabled = !projectKey;
  const { firstHref } = useSettingsNavGroups(projectKey);
  const { can } = usePermissions();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('configuration')}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {can('members_manage', 'read') && (
            <SidebarNavItem
              href={projectKey ? membersPath(projectKey) : '#'}
              icon={Users}
              label={t('members')}
              active={pathname.includes('/members')}
              disabled={disabled}
            />
          )}
          {firstHref && (
            <SidebarNavItem
              href={firstHref}
              icon={Settings}
              label={t('projectSettings')}
              active={false}
              disabled={disabled}
            />
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
