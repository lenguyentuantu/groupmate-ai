import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { aiAgentsPath, aiTeamPath } from '@/utils/paths';
import { AI_AGENTS_SECTION } from '@/utils/settingsSections';
import { useAiTeamSections } from '@/hooks/useSettingsNavGroups';
import { usePermissions } from '@/hooks/usePermissions';
import { useShellRoute } from '@/hooks/useShellRoute';
import { useSettingsSectionText } from '@/hooks/useSectionLabels';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from '@/components/ui/sidebar';
import SidebarNavItem from '@/components/layout/SidebarNavItem';
import SidebarNavSubmenu, {
  type SidebarNavSubmenuItem,
} from '@/components/layout/SidebarNavSubmenu';

// The AI Team sidebar group consolidates the readable AI routes into one menu.
export default function SidebarAiTeamNav({ projectKey }: { projectKey: string | null }) {
  const t = useTranslations('nav');
  const sectionText = useSettingsSectionText();
  const pathname = usePathname();
  const { aiTeamSection } = useShellRoute();
  const { can, isAdmin } = usePermissions();
  const disabled = !projectKey;

  // The run list also opens to whoever runs the team, as its route does.
  const sections = useAiTeamSections().filter(
    (s) => can(s.resource, 'read') || (s.slug === 'queue' && isAdmin),
  );
  const showAgents = can(AI_AGENTS_SECTION.resource, 'read');
  if (sections.length === 0 && !showAgents) return null;
  const listed = sections.filter((s) => s.slug !== 'queue');
  const queue = sections.filter((s) => s.slug === 'queue');
  const items: SidebarNavSubmenuItem[] = listed.map((section) => ({
    key: section.slug,
    href: projectKey ? aiTeamPath(projectKey, section.slug) : '#',
    icon: section.icon,
    label: sectionText(section.slug).label,
    active: aiTeamSection === section.slug,
  }));

  if (showAgents) {
    items.push({
      key: AI_AGENTS_SECTION.slug,
      href: projectKey ? aiAgentsPath(projectKey) : '#',
      icon: AI_AGENTS_SECTION.icon,
      label: sectionText(AI_AGENTS_SECTION.slug).label,
      active: pathname.endsWith('/agents'),
    });
  }

  items.push(
    ...queue.map((section) => ({
      key: section.slug,
      href: projectKey ? aiTeamPath(projectKey, section.slug) : '#',
      icon: section.icon,
      label: sectionText(section.slug).label,
      active: aiTeamSection === section.slug,
    })),
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('aiTeam')}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {projectKey ? (
            <SidebarNavSubmenu icon={AI_AGENTS_SECTION.icon} label={t('aiAgents')} items={items} />
          ) : (
            <SidebarNavItem
              href="#"
              icon={AI_AGENTS_SECTION.icon}
              label={t('aiAgents')}
              active={false}
              disabled={disabled}
            />
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
