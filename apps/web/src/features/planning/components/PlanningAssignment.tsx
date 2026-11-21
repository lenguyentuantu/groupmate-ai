'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, Bot, ListChecks, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useAssignmentInputs,
  useAssignmentProposal,
  useGenerateAssignmentProposal,
  useSaveAssignmentProposal,
} from '@/services/planning.service';
import type { PlanningProposal } from '@/lib/api/endpoints/planning';
import { useProjectAgents } from '@/hooks/useProjectAgents';
import { usePermissions } from '@/hooks/usePermissions';
import { ApiError } from '@/lib/api/core/client';
import { displayCandidateReferences } from '../utils/planningAssignment';
import PlanningAssignmentTask from './PlanningAssignmentTask';

export default function PlanningAssignment({
  projectRef,
  draftId,
  draftVersion,
  canEdit,
}: {
  projectRef: string;
  draftId: number;
  draftVersion: number;
  canEdit: boolean;
}) {
  const inputs = useAssignmentInputs(projectRef, draftId);
  const saved = useAssignmentProposal(projectRef, draftId);
  const generate = useGenerateAssignmentProposal(projectRef, draftId);
  const save = useSaveAssignmentProposal(projectRef, draftId);
  const { can } = usePermissions();
  const agents = useProjectAgents(can('ai_agents', 'read'));
  const [agentId, setAgentId] = useState('');
  const [proposal, setProposal] = useState<PlanningProposal | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const current = proposal ?? saved.data;
  const taskNames = useMemo(
    () => new Map(inputs.data?.tasks.map((task) => [task.id, task.title])),
    [inputs.data?.tasks],
  );
  const candidates = current?.candidates ?? inputs.data?.candidates ?? [];
  const provisionalCandidates = candidates.filter((candidate) => !candidate.isRealMember);
  const selectedCandidateIds = new Map(
    current?.assignments.map((assignment) => [
      assignment.taskId,
      Object.prototype.hasOwnProperty.call(overrides, assignment.taskId)
        ? overrides[assignment.taskId]
        : assignment.candidateId,
    ]) ?? [],
  );
  const assignedCount =
    current?.assignments.filter((assignment) => selectedCandidateIds.get(assignment.taskId))
      .length ?? 0;
  function needsDecision(assignment: PlanningProposal['assignments'][number]) {
    return (
      !selectedCandidateIds.get(assignment.taskId) ||
      assignment.reviewRequired === true ||
      (assignment.status !== undefined &&
        assignment.status !== 'QUALIFIED_ASSIGNMENT' &&
        assignment.status !== 'MANUAL_DECISION')
    );
  }
  const reviewCount =
    current?.assignments.filter((assignment) => needsDecision(assignment)).length ?? 0;
  const [taskFilter, setTaskFilter] = useState<'needs_decision' | 'assigned' | 'all'>(
    'needs_decision',
  );
  const activeFilter = taskFilter === 'needs_decision' && reviewCount === 0 ? 'all' : taskFilter;
  const visibleAssignments =
    current?.assignments.filter((assignment) => {
      if (activeFilter === 'needs_decision') return needsDecision(assignment);
      if (activeFilter === 'assigned') return Boolean(selectedCandidateIds.get(assignment.taskId));
      return true;
    }) ?? [];
  const insightGroups: [string, string[]][] = current?.planningInsights
    ? [
        ['Nút thắt chính', current.planningInsights.bottlenecks],
        ['Rủi ro chính', current.planningInsights.risks],
        ['Đánh đổi', current.planningInsights.tradeoffs],
      ]
    : [];
  if (inputs.isPending) return <p role="status">Đang tải dữ liệu phân công…</p>;
  if (inputs.isError) return <p role="alert">{inputs.error.message}</p>;
  if (!inputs.data || !draftId) return null;
  let generateLabel = 'Tạo đề xuất';
  if (generate.isPending) generateLabel = 'Đang tạo…';
  else if (current) generateLabel = 'Kiểm tra lại đề xuất';

  async function generateProposal() {
    try {
      const preservedDecisions = Object.fromEntries(
        (current?.assignments ?? [])
          .filter((assignment) => assignment.origin === 'manual' || assignment.origin === undefined)
          .map((assignment) => [assignment.taskId, assignment.candidateId]),
      );
      const result = await generate.mutateAsync({
        sourceVersion: draftVersion,
        overrides: { ...preservedDecisions, ...overrides },
        provisionalCandidates,
        ...(agentId ? { agentId: Number(agentId) } : {}),
      });
      setActionError(null);
      setProposal({
        ...result,
        ...(current
          ? {
              id: current.id,
              draftId: current.draftId,
              version: current.version,
              updatedAt: current.updatedAt,
            }
          : {}),
      });
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Không thể cập nhật đề xuất.');
    }
  }

  async function saveProposal() {
    if (!current) return;
    try {
      const result = await save.mutateAsync({
        sourceVersion: draftVersion,
        overrides,
        provisionalCandidates,
        proposal: current,
        version: current.version,
      });
      setActionError(null);
      setProposal(result);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : 'Không thể lưu đề xuất.');
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Đề xuất phân công</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Đây là bản đề xuất để trưởng nhóm xem xét. Hệ thống không tự tạo công việc hoặc thay đổi
            WBS.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {current?.id ? `Đã lưu · phiên bản ${current.version}` : 'Chưa lưu đề xuất'}
        </span>
      </div>

      {canEdit && (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium">
            Chế độ tạo đề xuất mới
            <select
              className="mt-1 block h-10 w-full rounded-md border bg-background px-3"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              <option value="">Chỉ dùng quy tắc xác định</option>
              {agents.data
                ?.filter((agent) => agent.kind === 'internal' && agent.chatEnabled)
                .map((agent) => (
                  <option value={agent.id} key={agent.id}>
                    {agent.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void generateProposal()}
              disabled={generate.isPending || save.isPending}
            >
              <Bot />
              {generateLabel}
            </Button>
            {current && (
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending || generate.isPending || current.stale}
                onClick={() => void saveProposal()}
              >
                <Save />
                {save.isPending ? 'Đang lưu…' : 'Lưu đề xuất'}
              </Button>
            )}
          </div>
        </div>
      )}

      {current?.stale && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          role="alert"
        >
          WBS nguồn đã thay đổi. Hãy tạo lại đề xuất trước khi lưu.
        </p>
      )}
      {!current && (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Chưa có đề xuất phân công. Chọn chế độ và tạo đề xuất để bắt đầu rà soát.
        </div>
      )}
      {current?.aiEnrichment === 'applied' && (
        <p className="flex items-center gap-2 rounded-lg bg-primary/5 p-3 text-sm">
          <ShieldCheck className="size-4 text-primary" />
          Đề xuất từ AI đã được kiểm tra lại bằng dữ liệu phía máy chủ.
        </p>
      )}
      {current?.aiEnrichment === 'partially_applied' && (
        <p className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          Một phần kế hoạch AI đã được áp dụng. Các công việc không hợp lệ giữ nguyên đề xuất xác
          định để trưởng nhóm xem xét.
        </p>
      )}
      {current?.aiEnrichment === 'failed' && (
        <p className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          Không thể tạo kế hoạch AI hợp lệ. Đề xuất xác định vẫn được hiển thị đầy đủ.
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      {current && (
        <div className="space-y-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {[
              { icon: ListChecks, label: 'Tổng công việc', value: current.assignments.length },
              { icon: ShieldCheck, label: 'Đã có người phụ trách', value: assignedCount },
              { icon: AlertTriangle, label: 'Cần quyết định', value: reviewCount },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg bg-muted/45 p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <metric.icon className="size-3.5" />
                  {metric.label}
                </dt>
                <dd className="mt-1 font-heading text-xl font-semibold">{metric.value}</dd>
              </div>
            ))}
          </dl>
          {current.warnings.length > 0 && (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Có {current.warnings.length} rủi ro cần trưởng nhóm xem xét trong các công việc bên
              dưới.
            </p>
          )}
          {current.planningInsights && (
            <section className="rounded-xl border bg-card p-4 shadow-xs">
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                Chiến lược phân bổ của AI
              </p>
              <p className="mt-2 text-sm leading-6" dir="auto">
                {displayCandidateReferences(
                  current.planningInsights.allocationStrategy,
                  candidates,
                )}
              </p>
              <details className="mt-3 border-t pt-3 text-sm">
                <summary className="cursor-pointer font-medium">Xem nút thắt và đánh đổi</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  {insightGroups.map(([label, items]) => (
                    <div key={label}>
                      <h3 className="font-medium">{label}</h3>
                      {items.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-1 ps-5 text-muted-foreground">
                          {items.map((item) => (
                            <li key={item} dir="auto">
                              {displayCandidateReferences(item, candidates)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-muted-foreground">Không có nội dung nổi bật.</p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </section>
          )}
          <div className="flex flex-wrap gap-2" aria-label="Lọc công việc phân công">
            {[
              ['needs_decision', 'Cần quyết định'],
              ['assigned', 'Đã đề xuất'],
              ['all', 'Tất cả'],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={activeFilter === value ? 'default' : 'outline'}
                aria-pressed={activeFilter === value}
                onClick={() => setTaskFilter(value as typeof taskFilter)}
              >
                {label}
              </Button>
            ))}
          </div>
          {visibleAssignments.map((assignment) => (
            <PlanningAssignmentTask
              key={assignment.taskId}
              assignment={assignment}
              candidates={candidates}
              taskName={taskNames.get(assignment.taskId) ?? 'Công việc không còn khả dụng'}
              canEdit={canEdit}
              isOverridden={Object.prototype.hasOwnProperty.call(overrides, assignment.taskId)}
              value={
                Object.prototype.hasOwnProperty.call(overrides, assignment.taskId)
                  ? (overrides[assignment.taskId] ?? '')
                  : (assignment.candidateId ?? '')
              }
              onChange={(candidateId) =>
                setOverrides((currentOverrides) => ({
                  ...currentOverrides,
                  [assignment.taskId]: candidateId,
                }))
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
