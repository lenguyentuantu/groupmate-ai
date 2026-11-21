'use client';
import { ChevronDown } from 'lucide-react';
import type { PlanningCandidate, ProposalAssignment } from '@/lib/api/endpoints/planning';
import { cn } from '@/lib/utils';
import { displayCandidateReferences } from '../utils/planningAssignment';
import PlanningAssignmentDetails from './PlanningAssignmentDetails';

const statusLabels = {
  QUALIFIED_ASSIGNMENT: 'Đủ điều kiện',
  PARTIAL_RECOMMENDATION: 'Cần xem xét',
  NO_SAFE_CANDIDATE: 'Chưa có ứng viên an toàn',
  INSUFFICIENT_DATA: 'Thiếu dữ liệu',
  CAPACITY_CONFLICT: 'Xung đột sức chứa',
  MANUAL_DECISION: 'Quyết định thủ công',
} as const;

function assignmentStatus(assignment: ProposalAssignment, hasAssignee: boolean) {
  if (assignment.reviewRequired && assignment.status !== 'MANUAL_DECISION') return 'Cần xem xét';
  if (assignment.status) return statusLabels[assignment.status];
  return hasAssignee ? 'Đề xuất phân công' : 'Chưa phân công';
}

export default function PlanningAssignmentTask({
  assignment,
  candidates,
  taskName,
  canEdit,
  isOverridden,
  value,
  onChange,
}: {
  assignment: ProposalAssignment;
  candidates: PlanningCandidate[];
  taskName: string;
  canEdit: boolean;
  isOverridden: boolean;
  value: string;
  onChange: (candidateId: string | null) => void;
}) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const assignee = value ? byId.get(value) : null;
  const recommended = assignment.recommendedCandidateId
    ? byId.get(assignment.recommendedCandidateId)
    : null;
  const status = isOverridden
    ? statusLabels.MANUAL_DECISION
    : assignmentStatus(assignment, Boolean(assignee));
  const needsAttention = assignment.reviewRequired || !assignee;

  return (
    <details className="group rounded-xl border bg-card px-3 py-3 shadow-xs open:border-primary/25 sm:px-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <span className="min-w-0">
          <span className="block truncate font-medium" dir="auto">
            {taskName}
          </span>
          <span className="block text-sm text-muted-foreground">
            {assignee ? assignee.name : 'Chưa phân công'}
            {recommended && recommended.id !== assignee?.id ? ` · Gợi ý: ${recommended.name}` : ''}
          </span>
          <span className="block max-w-xl truncate text-sm text-muted-foreground">
            {displayCandidateReferences(assignment.reason, candidates)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-1 text-xs font-medium',
              needsAttention ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary',
            )}
          >
            {status}
          </span>
          <ChevronDown className="mt-1 size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </span>
      </summary>

      <PlanningAssignmentDetails
        assignment={assignment}
        candidates={candidates}
        canEdit={canEdit}
        value={value}
        onChange={onChange}
      />
    </details>
  );
}
