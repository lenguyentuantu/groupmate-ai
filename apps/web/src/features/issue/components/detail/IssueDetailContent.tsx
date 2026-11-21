import { type CSSProperties, useRef, useState } from 'react';
import { Direction } from 'radix-ui';
import type { ProjectDetail } from '@/lib/api/endpoints/projects';
import type { IssueDetail as IssueDetailRow } from '@/lib/api/endpoints/issues';
import type { MentionSource } from '@/lib/api/endpoints/mentions';
import { usePermissions } from '@/hooks/usePermissions';
import { usePriorityLabel } from '@/hooks/usePriorityLabel';
import { usePersistedWidth } from '@/hooks/usePersistedWidth';
import { useProjectFeatures } from '@/hooks/useProjectFeatures';
import ResizeGrip from '@/components/common/ResizeGrip';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatShortDate } from '@/utils/dates';
import { formatMinutes } from '@/utils/estimate';
import { useIssueDetail } from '../../hooks/useIssueDetail';
import { usePersistedOpen, usePersistedOpenGroups } from '@/hooks/usePersistedOpen';
import { useFilePaste } from '../../hooks/useFilePaste';
import IssueAttachmentsPanel from './IssueAttachmentsPanel';
import IssueDeliverableReviewPanel from './IssueDeliverableReviewPanel';
import IssueChecklistsPanel from './IssueChecklistsPanel';
import IssueLinksPanel from './IssueLinksPanel';
import IssueDevelopmentPanel from './IssueDevelopmentPanel';
import IssueDocumentsPanel from './IssueDocumentsPanel';
import IssueWorklogPanel from './IssueWorklogPanel';
import IssueSubtasksPanel from './IssueSubtasksPanel';
import IssueActivityFeed from './IssueActivityFeed';
import LastCommentBubble from './LastCommentBubble';
import IssueDetailSkeleton from './IssueDetailSkeleton';
import IssueStatusTimeline from './IssueStatusTimeline';
import MarkdownEditor from '@/components/common/editor/MarkdownEditor';
import IssueCustomFieldBody from '../fields/IssueCustomFieldBody';
import IssueProperties from './IssueProperties';
import IssueActionsBar from '../actions/IssueActionsBar';
import {
  PROPERTIES_MAX_W,
  PROPERTIES_MIN_W,
  PROPERTIES_W,
  propertiesWidthKey,
} from '../../utils/propertiesWidth';
import { useTranslations } from 'next-intl';

const planningHeadings = [
  'Deliverable',
  'Acceptance criteria',
  'Required skills',
  'Planning source',
] as const;

function parsePlanningDescription(description: string) {
  const pattern = /^## (Deliverable|Acceptance criteria|Required skills|Planning source)\r?$/gm;
  const matches = [...description.matchAll(pattern)];
  if (!matches.some((match) => match[1] === 'Planning source')) return null;
  const sections = new Map<string, string>();
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? description.length;
    sections.set(match[1], description.slice(start, end).trim());
  });
  return {
    objective: description.slice(0, matches[0]?.index ?? 0).trim(),
    deliverable: sections.get(planningHeadings[0]) ?? '',
    acceptanceCriteria: (sections.get(planningHeadings[1]) ?? '')
      .split('\n')
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean),
    requiredSkills: (sections.get(planningHeadings[2]) ?? '')
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean),
    source: sections.get(planningHeadings[3]) ?? '',
  };
}

// The body of a issue — title, description, markdown custom fields, the
// Properties grid, attachments, and the activity feed. Shared by the side panel
// (IssueDetail) and the full-page view (IssueViewPage); each supplies its own
// surrounding chrome (close button / breadcrumbs). Without work_items edit every
// part of it renders as a static value. Data loading and mutations live in
// useIssueDetail; this component is layout only.
export default function IssueDetailContent({
  project,
  issueId,
  onIssueLoaded,
  onDeleted,
  layout = 'panel',
  commentId = null,
}: {
  project: ProjectDetail;
  issueId: number;
  onIssueLoaded?: (issue: IssueDetailRow) => void;
  // Called after the issue is deleted, so the surrounding chrome can leave the
  // now-gone issue (close the panel / return to the project).
  onDeleted?: () => void;
  // 'panel' stacks everything in one column (side panel). 'page' puts the
  // Properties in a right sidebar fixed to the viewport edge (Linear full-page
  // layout), and stacks them into the column below xl. 'split' is the same
  // two-column shape but in normal flow (no fixed positioning), so it fits
  // inside a narrower container like the inbox pane.
  layout?: 'panel' | 'page' | 'split';
  // The comment to bring into view: the one a link or a notification points at.
  commentId?: number | null;
}) {
  const t = useTranslations('issue');
  const tCommon = useTranslations('common');
  const tEditor = useTranslations('issue.editor');
  const tFields = useTranslations('issue.fields');
  const tNoDate = useTranslations('workItems.calendar.noDate');
  const priorityLabel = usePriorityLabel();
  const direction = Direction.useDirection();
  const {
    issue,
    fieldDefs,
    patch,
    setField,
    toggleLabel,
    insertAttachment,
    attachFiles,
    uploadFile,
    imageAttachments,
    setDescEditor,
    activityView,
  } = useIssueDetail(project, issueId, onIssueLoaded);
  const permissions = usePermissions(project);
  const canReadAgentRuns =
    permissions.can('ai_agents', 'read') && permissions.can('work_items', 'read');
  const effectiveActivityView =
    activityView.tab === 'agentRuns' && !canReadAgentRuns
      ? { ...activityView, tab: 'all' as const }
      : activityView;
  const canEdit = permissions.can('work_items', 'edit');
  const canManageDevelopment = permissions.can('repositories', 'edit');
  const canReadDocuments = permissions.can('documents', 'read');
  const canLinkDocuments = canEdit && permissions.can('documents', 'edit');
  const features = useProjectFeatures();
  useFilePaste(canEdit && issue ? (files) => void attachFiles(files) : null);
  const properties = usePersistedOpen('issue-properties-open');
  const propertyGroups = usePersistedOpenGroups('issue-property-groups-closed');
  const { width: propertiesWidth, setWidth: setPropertiesWidth } = usePersistedWidth(
    propertiesWidthKey(project.project.key),
    PROPERTIES_W,
    PROPERTIES_MIN_W,
    PROPERTIES_MAX_W,
  );
  // A replaced attachment keeps its URL, so an <img> already in an editor is
  // never requested again. Counting the replacements remounts the editors, which
  // builds the element anew and lets the raw route revalidate it.
  const [replacements, setReplacements] = useState(0);
  const textMentions: MentionSource = {
    projectKey: project.project.ref,
    on: 'issue',
    place: 'text',
  };
  const feedRef = useRef<HTMLDivElement>(null);

  if (!issue) return <IssueDetailSkeleton />;

  const column = project.columns.find((candidate) => candidate.id === issue.columnId);
  const assignee = project.assignees.find((candidate) => candidate.userId === issue.assigneeUserId);
  const inProgressColumn = project.columns.find((candidate) => candidate.stateType === 'started');
  const blockers = issue.links.filter((link) => {
    if (link.kind !== 'blocks' || link.direction !== 'inward') return false;
    const blockingColumn = project.columns.find(
      (candidate) => candidate.id === link.issue.columnId,
    );
    return blockingColumn?.stateType !== 'completed' && blockingColumn?.stateType !== 'canceled';
  });
  const planningDescription = parsePlanningDescription(issue.description);
  const stage =
    blockers.length > 0 && (column?.stateType === 'backlog' || column?.stateType === 'unstarted')
      ? 'Đang bị chặn'
      : column?.stateType === 'started'
        ? 'Đang thực hiện'
        : column?.stateType === 'completed'
          ? 'Hoàn thành'
          : column?.stateType === 'canceled'
            ? column.name
            : 'Sẵn sàng bắt đầu';
  const canStart =
    canEdit &&
    blockers.length === 0 &&
    inProgressColumn !== undefined &&
    (column?.stateType === 'backlog' || column?.stateType === 'unstarted');

  const heading = (
    <>
      <div className="flex items-start gap-2">
        {issue.archivedAt && (
          <span className="mt-1 shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
            {t('archived')}
          </span>
        )}
        {canEdit ? (
          // A textarea, not an input, so a long title wraps and is shown in full.
          // Its value stays single-line: Enter commits instead of inserting a
          // newline, and pasted line breaks are collapsed on blur.
          <textarea
            // Laid out by the script the title is written in, not the interface
            // language, so an Arabic title reads correctly in an English session.
            dir="auto"
            className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent text-lg leading-snug font-semibold outline-none placeholder:text-muted-foreground"
            rows={1}
            placeholder={t('titlePlaceholder')}
            defaultValue={issue.title}
            key={`title-${issue.updatedAt}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              const next = e.target.value.replace(/\s+/g, ' ').trim();
              e.target.value = next;
              if (next && next !== issue.title) patch({ title: next });
            }}
          />
        ) : (
          <h1 dir="auto" className="min-w-0 flex-1 text-lg leading-snug font-semibold">
            {issue.title}
          </h1>
        )}
        {canStart && (
          <Button
            type="button"
            className="shrink-0"
            onClick={() => patch({ columnId: inProgressColumn.id })}
          >
            Bắt đầu làm
          </Button>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{tFields('state')}</dt>
          <dd className="font-medium">{stage}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{tFields('assignee')}</dt>
          <dd className="font-medium" dir="auto">
            {assignee?.name ?? 'Chưa phân công'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{tFields('priority')}</dt>
          <dd className="font-medium">{priorityLabel(issue.priority ?? '')}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{tFields('dueDate')}</dt>
          <dd className="font-medium">
            {issue.dueDate ? formatShortDate(issue.dueDate) : tNoDate('dueDate')}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{tFields('estimateTime')}</dt>
          <dd className="font-medium">
            {issue.estimateMinutes === null
              ? 'Chưa ước tính'
              : formatMinutes(issue.estimateMinutes)}
          </dd>
        </div>
      </dl>

      {blockers.length > 0 && (
        <p className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
          Đang bị chặn bởi{' '}
          <span className="font-medium" dir="auto">
            {blockers.map((link) => `${link.issue.identifier} · ${link.issue.title}`).join(', ')}
          </span>
          . Hoàn thành công việc chặn trước khi bắt đầu.
        </p>
      )}

      {planningDescription ? (
        <div className="mt-6 space-y-5">
          {planningDescription.objective && (
            <section>
              <h2 className="text-sm font-semibold">Mục tiêu công việc</h2>
              <MarkdownEditor
                className="mt-2"
                defaultValue={planningDescription.objective}
                editable={false}
              />
            </section>
          )}
          {planningDescription.acceptanceCriteria.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold">Tiêu chí nghiệm thu</h2>
              <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm">
                {planningDescription.acceptanceCriteria.map((criterion, index) => (
                  <li key={`${criterion}-${index}`} dir="auto">
                    {criterion}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        (canEdit || issue.description.trim() !== '') && (
          <MarkdownEditor
            className="mt-4"
            placeholder={tEditor('descriptionPlaceholder')}
            defaultValue={issue.description}
            key={`desc-${issue.updatedAt}-${replacements}`}
            editable={canEdit}
            onReady={setDescEditor}
            uploadFile={uploadFile}
            imageAttachments={imageAttachments}
            mentions={textMentions}
            onBlur={(md) => {
              if (md !== issue.description) patch({ description: md });
            }}
          />
        )
      )}

      {fieldDefs
        .filter((def) => def.showInBody)
        .map((def) => (
          <IssueCustomFieldBody
            key={def.id}
            def={def}
            current={issue.fields.find((f) => f.fieldId === def.id)}
            assignees={project.assignees}
            saveKey={`${def.id}-${issue.updatedAt}-${replacements}`}
            uploadFile={uploadFile}
            imageAttachments={imageAttachments}
            onSetField={setField}
            readOnly={!canEdit}
            mentions={textMentions}
          />
        ))}
    </>
  );

  const attachments = (
    <IssueAttachmentsPanel
      issueId={issue.id}
      onInsert={insertAttachment}
      onReplaced={() => setReplacements((n) => n + 1)}
      readOnly={!canEdit}
    />
  );

  // Keep the next work actions visible. Supporting context stays collapsed until
  // the user needs it.
  const workSections = (
    <>
      {features.subtasks && <IssueSubtasksPanel project={project} issue={issue} />}

      {features.checklists && <IssueChecklistsPanel issue={issue} />}

      <IssueLinksPanel project={project} issue={issue} />

      <details className="mt-6 border-t pt-5">
        <summary className="cursor-pointer text-sm font-medium">Thông tin nâng cao</summary>
        <div className="mt-3">
          {layout !== 'page' && attachments}

          {planningDescription && (
            <section className="mt-6 border-t pt-5">
              <h3 className="text-sm font-semibold">Thông tin lập kế hoạch</h3>
              {planningDescription.requiredSkills.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground">Kỹ năng cần thiết</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {planningDescription.requiredSkills.map((skill) => (
                      <span
                        className="rounded-full border px-2.5 py-1 text-xs"
                        dir="auto"
                        key={skill}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {planningDescription.source && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">Nguồn WBS</summary>
                  <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground" dir="auto">
                    {planningDescription.source}
                  </p>
                </details>
              )}
              {canEdit && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Chỉnh sửa nội dung gốc
                  </summary>
                  <MarkdownEditor
                    className="mt-3"
                    placeholder={tEditor('descriptionPlaceholder')}
                    defaultValue={issue.description}
                    key={`desc-${issue.updatedAt}-${replacements}`}
                    editable
                    onReady={setDescEditor}
                    uploadFile={uploadFile}
                    imageAttachments={imageAttachments}
                    mentions={textMentions}
                    onBlur={(md) => {
                      if (md !== issue.description) patch({ description: md });
                    }}
                  />
                </details>
              )}
            </section>
          )}

          {features.timeLogging && <IssueWorklogPanel project={project} issue={issue} />}

          <IssueDevelopmentPanel
            issueId={issue.id}
            identifier={issue.identifier}
            issueTitle={issue.title}
            links={issue.development ?? []}
            canEdit={canEdit}
            canManage={canManageDevelopment}
          />

          {features.documents && (
            <IssueDocumentsPanel
              projectKey={project.project.ref}
              issueId={issue.id}
              canRead={canReadDocuments}
              canLink={canLinkDocuments}
            />
          )}

          {layout === 'panel' && features.issueStats && (
            <IssueStatusTimeline
              issueId={issue.id}
              columns={project.columns}
              imageByUserId={new Map(project.assignees.map((a) => [a.userId, a.image]))}
            />
          )}
        </div>
      </details>
    </>
  );

  const handoff = (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/45 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Quy trình bàn giao</p>
        <p className="mt-1 text-sm font-medium">
          Nộp sản phẩm <span aria-hidden="true">→</span> AI đánh giá{' '}
          <span aria-hidden="true">→</span> Trưởng nhóm duyệt
        </p>
      </div>
      {planningDescription?.deliverable && (
        <section>
          <h2 className="text-sm font-semibold">Sản phẩm cần bàn giao</h2>
          <p className="mt-2 text-sm leading-6" dir="auto">
            {planningDescription.deliverable}
          </p>
        </section>
      )}
      <IssueDeliverableReviewPanel issueId={issue.id} />
    </div>
  );

  const renderProperties = (className?: string) => (
    <IssueProperties
      project={project}
      issue={issue}
      fieldDefs={fieldDefs}
      onPatch={patch}
      onSetField={setField}
      onToggleLabel={toggleLabel}
      uploadFile={uploadFile}
      imageAttachments={imageAttachments}
      watchers={issue.watchers}
      readOnly={!canEdit}
      className={className}
      open={properties.open}
      onToggle={properties.toggle}
      groupsOpen={propertyGroups}
    />
  );
  // In a sidebar the section follows the actions row, which needs less room above
  // it than the content block it follows in a single column.
  const sidebarProperties = renderProperties('mt-3 pt-4');

  const actions = <IssueActionsBar project={project} issue={issue} onDeleted={onDeleted} />;

  // The sidebar grows towards the content, so the pointer moving away from the
  // edge the panel sits on is what widens it.
  const propertiesGrip = (
    <ResizeGrip
      label={tCommon('resizePropertiesPanel')}
      className="absolute inset-y-0 start-0 -ms-3"
      onDrag={(deltaX) =>
        setPropertiesWidth(propertiesWidth + (direction === 'rtl' ? deltaX : -deltaX))
      }
    />
  );
  // The dragged width reaches the layout as a variable, since the two blocks it
  // sizes only take it from the breakpoint where the sidebar exists.
  const propertiesWidthVar = { '--issue-properties-w': `${propertiesWidth}px` } as CSSProperties;

  // A feed entry stores the author's name, not their picture, so the uploaded avatar
  // comes from the project's candidate list by actor id. An author who is no longer a
  // member falls back to the initials circle.
  const imageByUserId = new Map(project.assignees.map((a) => [a.userId, a.image]));

  const timeline = features.issueStats ? (
    <IssueStatusTimeline
      issueId={issue.id}
      columns={project.columns}
      imageByUserId={imageByUserId}
    />
  ) : null;

  const conversation = (
    <>
      <div ref={feedRef}>
        <IssueActivityFeed
          issueId={issue.id}
          projectKey={project.project.ref}
          sequenceNumber={issue.sequenceNumber}
          columns={project.columns}
          imageByUserId={imageByUserId}
          view={effectiveActivityView}
          canReadAgentRuns={canReadAgentRuns}
          commentId={commentId}
        />
      </div>
      {commentId == null && (
        <LastCommentBubble
          key={issue.id}
          issueId={issue.id}
          feedRef={feedRef}
          imageByUserId={imageByUserId}
          view={effectiveActivityView}
        />
      )}
    </>
  );

  const activity = (
    <>
      {timeline}
      {conversation}
    </>
  );

  if (layout === 'page') {
    return (
      <div
        className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_var(--issue-properties-w)] xl:items-start xl:gap-x-12"
        style={propertiesWidthVar}
      >
        <main className="max-w-3xl min-w-0">
          <div className="sticky top-0 z-10 -mt-6 bg-background/85 pt-6 pb-3 backdrop-blur-md xl:hidden">
            {actions}
          </div>
          {heading}
          {workSections}
          {handoff}
        </main>
        <aside className="relative min-w-0 xl:sticky xl:top-16 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="hidden xl:block">{propertiesGrip}</div>
          <div className="xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto xl:overscroll-contain">
            <div className="hidden xl:block">{actions}</div>
            {sidebarProperties}
            {attachments}
          </div>
        </aside>
        <div className="max-w-3xl min-w-0 xl:col-start-1 xl:row-start-2">{activity}</div>
      </div>
    );
  }

  if (layout === 'split') {
    // Two columns in normal flow: content on the left, Properties as a right
    // sidebar. Unlike 'page' the sidebar is not viewport-fixed, so it stays inside
    // a narrower host (the inbox detail pane) without overlapping the content.
    // The breakpoint is the pane's own width, not the viewport's. The container
    // wraps the flex row rather than being it — an element cannot query itself.
    return (
      <div className="@container">
        <div className="flex gap-8">
          <div className="min-w-0 flex-1">
            <div className="@3xl:hidden">{actions}</div>
            {heading}
            <div className="@3xl:hidden">{renderProperties()}</div>
            {workSections}
            {handoff}
            {activity}
          </div>
          <aside
            className="relative hidden w-(--issue-properties-w) shrink-0 @3xl:block"
            style={propertiesWidthVar}
          >
            {propertiesGrip}
            {actions}
            {sidebarProperties}
          </aside>
        </div>
      </div>
    );
  }

  // The panel renders the actions in its header row (see IssueDetail), so the
  // panel body omits them. The wrapper is what the bubble sticks inside: without
  // it the bubble's parent would be the panel's scroll container, which bounds a
  // sticky child to the first screen of the scroll.
  return (
    <Tabs defaultValue={commentId == null ? 'work' : 'discussion'} className="gap-0">
      <TabsList
        variant="line"
        className="sticky top-[63px] z-10 mb-5 bg-card/95 backdrop-blur-md"
        aria-label="Nội dung công việc"
      >
        <TabsTrigger value="work">Công việc</TabsTrigger>
        <TabsTrigger value="handoff">Bàn giao</TabsTrigger>
        <TabsTrigger value="discussion">Trao đổi</TabsTrigger>
      </TabsList>
      <TabsContent value="work">
        {heading}
        {renderProperties()}
        {workSections}
      </TabsContent>
      <TabsContent value="handoff">{handoff}</TabsContent>
      <TabsContent value="discussion">{conversation}</TabsContent>
    </Tabs>
  );
}
