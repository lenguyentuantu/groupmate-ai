import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Braces, Globe, MoreHorizontal, RefreshCw, Server, StickyNote, Target } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectFeatures } from '@/hooks/useProjectFeatures';
import {
  apiDocsPath,
  cyclesPath,
  initiativesPath,
  mcpServerPath,
  notesPath,
  publicSharesPath,
} from '@/utils/paths';
import SidebarNavSubmenu, {
  type SidebarNavSubmenuItem,
} from '@/components/layout/SidebarNavSubmenu';

export default function SidebarLegacyNav({ projectKey }: { projectKey: string | null }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const features = useProjectFeatures();
  const { can } = usePermissions();

  if (!projectKey) return null;

  const items: SidebarNavSubmenuItem[] = [];

  if (features.initiatives && can('initiatives', 'read')) {
    items.push({
      key: 'initiatives',
      href: initiativesPath(projectKey),
      icon: Target,
      label: t('initiatives'),
      active: pathname.includes('/initiatives'),
    });
  }

  if (features.cycles && can('cycles', 'read')) {
    items.push({
      key: 'cycles',
      href: cyclesPath(projectKey),
      icon: RefreshCw,
      label: t('cycles'),
      active: pathname.includes('/cycles'),
    });
  }

  if (features.notes && can('note_boards', 'read')) {
    items.push({
      key: 'notes',
      href: notesPath(projectKey),
      icon: StickyNote,
      label: t('notes'),
      active: pathname.includes('/notes'),
    });
  }

  items.push(
    {
      key: 'public',
      href: publicSharesPath(projectKey),
      icon: Globe,
      label: t('public'),
      active: pathname === publicSharesPath(projectKey),
    },
    {
      key: 'api',
      href: apiDocsPath(projectKey),
      icon: Braces,
      label: t('apiDocs'),
      active: pathname.endsWith('/api'),
    },
    {
      key: 'mcp',
      href: mcpServerPath(projectKey),
      icon: Server,
      label: t('mcpServer'),
      active: pathname.endsWith('/mcp'),
    },
  );

  return <SidebarNavSubmenu icon={MoreHorizontal} label={t('sections')} items={items} />;
}
