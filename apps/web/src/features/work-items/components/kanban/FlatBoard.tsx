import { useMemo } from 'react';
import { DndContext } from '@dnd-kit/core';
import { toast } from 'sonner';
import { ChevronDown, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  buildGroups,
  buildMaps,
  groupDefaults,
  groupIssues,
  positionsAt,
  sortIssues,
  type WorkItemsViewProps,
  type IssueGroup,
} from '@/utils/project';
import type { BoardIssue } from '@/lib/api/endpoints/issues';
import { isActiveFilterSet } from '@/utils/filters';
import { useBoardDnd } from '../../hooks/useBoardDnd';
import { useSortedOrderMessage } from '../../hooks/useSortedOrderMessage';
import { useWipLimitMessage } from '../../hooks/useWipLimitMessage';
import { countEntering, wipAllows, wipStateFor } from '../../utils/wipLimit';
import { useGroupLabels } from '@/hooks/useGroupLabels';
import { useStableCallback } from '@/hooks/useStableCallback';
import { usePermissions } from '@/hooks/usePermissions';
import { useSelection } from '../../context/useSelection';
import { boardCollision, issuesToMove } from '../../utils/kanban';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GroupDot } from '../shared/GroupDot';
import { CardOverlay } from './CardOverlay';
import { BoardColumn } from './BoardColumn';
import { CollapsedColumn } from './CollapsedColumn';
import { WipCount } from './WipCount';

// A column with no issues gets the same empty list on every render.
const NO_ISSUES: BoardIssue[] = [];

// Flat board: one vertically-virtualized column per group, in a horizontal row. A
// trailing "Hidden" panel holds the columns that the user hid.
export default function FlatBoard({
  project,
  filters,
  columnCounts,
  settings,
  onSettingsChange,
  onOpenIssue,
  onAddIssue,
  readOnly,
  simpleStatusBoard = false,
  showSimpleStatusToggle = false,
  onSimpleStatusBoardChange,
}: WorkItemsViewProps & {
  simpleStatusBoard?: boolean;
  showSimpleStatusToggle?: boolean;
  onSimpleStatusBoardChange?: (simple: boolean) => void;
}) {
  const t = useTranslations('workItems');
  const groupLabels = useGroupLabels();
  const sortedOrderMessage = useSortedOrderMessage();
  const wipLimitMessage = useWipLimitMessage();
  const dnd = useBoardDnd(project, readOnly);
  const selection = useSelection();
  const { can } = usePermissions();
  const filtered = isActiveFilterSet(filters);

  // Hidden columns are stored in the view's display (settings.hiddenGroups). A
  // toggle writes through onSettingsChange. On a saved view that is a display edit,
  // applied on Save. On the All tab it reaches localStorage at once.
  const hiddenSet = new Set(simpleStatusBoard ? [] : settings.hiddenGroups);
  const setHidden = (key: string, hide: boolean) =>
    onSettingsChange({
      ...settings,
      hiddenGroups: hide
        ? [...settings.hiddenGroups, key]
        : settings.hiddenGroups.filter((k) => k !== key),
      // A hidden column is off the board, so it cannot stay pinned.
      pinnedGroup: hide && settings.pinnedGroup === key ? null : settings.pinnedGroup,
    });

  // Collapsed columns keep their position as a narrow strip. The state is stored in
  // the view's display (settings.collapsedGroups) and persists the same way as
  // hiddenGroups.
  const collapsedSet = new Set(simpleStatusBoard ? [] : settings.collapsedGroups);
  const setCollapsed = (key: string, collapse: boolean) =>
    onSettingsChange({
      ...settings,
      collapsedGroups: collapse
        ? [...settings.collapsedGroups, key]
        : settings.collapsedGroups.filter((k) => k !== key),
    });

  // At most one column is pinned. It persists the same way as the two sets above.
  const togglePin = (key: string) =>
    onSettingsChange({ ...settings, pinnedGroup: settings.pinnedGroup === key ? null : key });

  // The board's data is memoized on its inputs, so a render of the page that changes
  // none of them hands the memoized columns and cards the same objects.
  const workflowGroups = useMemo(
    () => buildGroups(project, settings.group, groupLabels, filters),
    [project, settings.group, groupLabels, filters],
  );
  const groups = useMemo(() => {
    if (!simpleStatusBoard) return workflowGroups;
    const combine = (
      key: string,
      name: string,
      stateTypes: Array<'backlog' | 'unstarted' | 'started' | 'completed'>,
    ): IssueGroup | null => {
      const members = workflowGroups.filter(
        (group) => group.stateType && stateTypes.some((state) => group.stateType === state),
      );
      if (members.length === 0) return null;
      return {
        key,
        name,
        color: members[0].color,
        stateType: stateTypes[stateTypes.length - 1],
        assign: members.length === 1 ? members[0].assign : null,
        values: members.flatMap((group) => group.values),
      };
    };
    return [
      combine('simple-not-started', 'Chưa bắt đầu', ['backlog', 'unstarted']),
      combine('simple-started', 'Đang làm', ['started']),
      combine('simple-completed', 'Hoàn thành', ['completed']),
    ].filter((group): group is IssueGroup => group !== null);
  }, [simpleStatusBoard, workflowGroups]);
  const sorted = useMemo(
    () => sortIssues(project.issues, settings.sort, project),
    [project, settings.sort],
  );
  const issuesByGroup = useMemo(() => {
    if (!simpleStatusBoard) return groupIssues(groups, sorted, settings.group);
    const result = new Map(groups.map((group) => [group.key, [] as BoardIssue[]]));
    const stateByColumn = new Map(project.columns.map((column) => [column.id, column.stateType]));
    for (const issue of sorted) {
      const state = stateByColumn.get(issue.columnId);
      let key: string | null = null;
      if (state === 'backlog' || state === 'unstarted') key = 'simple-not-started';
      else if (state === 'started') key = 'simple-started';
      else if (state === 'completed') key = 'simple-completed';
      if (key) result.get(key)?.push(issue);
    }
    return result;
  }, [groups, project.columns, simpleStatusBoard, sorted, settings.group]);
  const maps = useMemo(() => buildMaps(project), [project]);
  const wipByGroup = useMemo(
    () => new Map(groups.map((g) => [g.key, wipStateFor(g, project.columns, columnCounts)])),
    [groups, project.columns, columnCounts],
  );

  // Empty groups are removed when "Show empty columns" is off. A manual hide moves
  // any of the remaining groups into the "Hidden" panel.
  const baseGroups =
    simpleStatusBoard || settings.showEmptyGroups
      ? groups
      : groups.filter((g) => (issuesByGroup.get(g.key)?.length ?? 0) > 0);
  const visibleGroups = baseGroups.filter((g) => !hiddenSet.has(g.key));
  const hiddenGroups = baseGroups.filter((g) => hiddenSet.has(g.key));

  // The pinned column renders first. A key that names no group on the board
  // (another grouping field, a since-deleted column) pins nothing.
  const pinnedGroup = visibleGroups.find((g) => g.key === settings.pinnedGroup) ?? null;
  const orderedGroups = pinnedGroup
    ? [pinnedGroup, ...visibleGroups.filter((g) => g !== pinnedGroup)]
    : visibleGroups;

  // A reorder inside a column only holds when the view is ordered manually. With
  // any other sort field, the card returns to the position that the sort gives it.
  // The board then skips cards that are already in the target column. A drop with
  // no card left to move is refused, and the reason is shown. A card from another
  // column is still moved, because that changes the grouping field, not the order.
  const manualOrder = settings.sort.field === 'manual';

  const wipOf = (group: IssueGroup) => wipByGroup.get(group.key) ?? null;

  const moveIssue = useStableCallback((issueIds: number[], group: IssueGroup, index: number) => {
    const assign = group.assign;
    if (!assign) return;
    const target = issuesByGroup.get(group.key) ?? [];
    const ids = issuesToMove(issueIds, sorted, target, manualOrder);
    if (ids.length === 0) {
      toast.info(sortedOrderMessage(settings.sort.field));
      return;
    }
    // The board refuses the move instead of the server, because the move is
    // optimistic. The card would otherwise appear in the column and then return to
    // its old column.
    const wip = wipOf(group);
    if (wip && !wipAllows(wip, countEntering(ids, sorted, group))) {
      toast.info(wipLimitMessage(group.name, wip.limit));
      return;
    }
    const positions = positionsAt(target, index, ids.length);
    ids.forEach((id, n) => dnd.move(id, assign, positions[n]));
  });

  const addIssueTo = useStableCallback((group: IssueGroup) =>
    onAddIssue(groupDefaults(group.assign)),
  );
  const hideGroup = useStableCallback((group: IssueGroup) => setHidden(group.key, true));
  const collapseGroup = useStableCallback((group: IssueGroup) => setCollapsed(group.key, true));
  const togglePinGroup = useStableCallback((group: IssueGroup) => togglePin(group.key));

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={boardCollision}
      onDragStart={dnd.onDragStart}
      onDragCancel={dnd.onDragCancel}
      onDragEnd={dnd.onDragEnd}
    >
      <div className="flex h-full min-h-0 flex-col">
        {showSimpleStatusToggle && onSimpleStatusBoardChange && (
          <div className="flex justify-end px-4 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSimpleStatusBoardChange(!simpleStatusBoard)}
            >
              {simpleStatusBoard ? 'Xem quy trình đầy đủ' : 'Xem ba giai đoạn'}
            </Button>
          </div>
        )}
        <div
          className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4"
          onClick={() => selection.isSelecting && selection.clear()}
        >
          {orderedGroups.map((group) =>
            collapsedSet.has(group.key) ? (
              <CollapsedColumn
                key={group.key}
                group={group}
                count={issuesByGroup.get(group.key)?.length ?? 0}
                wip={wipOf(group)}
                pinned={group === pinnedGroup}
                onExpand={() => setCollapsed(group.key, false)}
                onTogglePin={() => togglePin(group.key)}
                onAddIssue={() => addIssueTo(group)}
                readOnly={readOnly}
              />
            ) : (
              <BoardColumn
                key={group.key}
                project={project}
                group={group}
                issues={issuesByGroup.get(group.key) ?? NO_ISSUES}
                maps={maps}
                properties={settings.properties}
                manualOrder={manualOrder}
                wip={wipOf(group)}
                filtered={filtered}
                boardIssues={sorted}
                onMoveIssue={moveIssue}
                onOpenIssue={onOpenIssue}
                onAddIssue={addIssueTo}
                onHide={hideGroup}
                onCollapse={collapseGroup}
                pinned={group === pinnedGroup}
                onTogglePin={togglePinGroup}
                canCreate={can('work_items', 'create')}
                canEdit={can('work_items', 'edit')}
                fixedPresentation={simpleStatusBoard}
                readOnly={readOnly}
              />
            ),
          )}

          {!simpleStatusBoard && hiddenGroups.length > 0 && (
            <div className="ml-auto w-64 shrink-0 self-start rounded-md border p-2">
              <div className="flex w-full items-center gap-1.5 px-1 py-1 text-sm font-medium text-muted-foreground">
                <ChevronDown className="size-4" />
                {settings.group === 'status' ? t('hiddenColumns') : t('hiddenGroups')}
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {hiddenGroups.map((group) => (
                  <div
                    key={group.key}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/40"
                  >
                    <div className="flex items-center gap-2 text-foreground">
                      <GroupDot group={group} />
                      {group.name}
                      <WipCount
                        filteredCount={issuesByGroup.get(group.key)?.length ?? 0}
                        wip={wipOf(group)}
                        filtered={filtered}
                      />
                    </div>
                    {!readOnly && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground"
                            onClick={() => setHidden(group.key, false)}
                            aria-label={t('show')}
                          >
                            <Eye />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('show')}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <CardOverlay
        activeId={dnd.activeId}
        count={dnd.activeCount}
        issues={project.issues}
        maps={maps}
        properties={settings.properties}
      />
    </DndContext>
  );
}
