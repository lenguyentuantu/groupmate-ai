'use client';
import { AlertTriangle, CheckCircle2, Lightbulb, UserRoundCheck } from 'lucide-react';
import type { PlanningCandidate, ProposalAssignment } from '@/lib/api/endpoints/planning';
import { displayCandidateReferences } from '../utils/planningAssignment';

const actionLabels: Record<string, string> = {
  review: 'Trưởng nhóm xem xét',
  split: 'Tách công việc',
  pair: 'Phối hợp nhiều thành viên',
  recruit: 'Bổ sung chuyên môn',
  reschedule: 'Điều chỉnh lịch',
  unassigned: 'Giữ trạng thái chưa phân công',
};

const relationshipLabels = {
  direct: 'Đã xác minh trực tiếp',
  equivalent: 'Tương đương đã xác minh',
  related: 'Liên quan theo quy tắc',
  inferred: 'AI suy luận',
  missing: 'Chưa có bằng chứng',
} as const;

const capacityLabels = {
  sufficient: 'đủ sức chứa',
  insufficient: 'thiếu sức chứa',
  unknown: 'chưa rõ sức chứa',
} as const;

function assignmentOriginLabel(origin: ProposalAssignment['origin']) {
  if (origin === 'ai_assisted') return 'Đề xuất từ AI';
  if (origin === 'manual') return 'Quyết định của trưởng nhóm';
  return 'Đề xuất theo quy tắc';
}

function alternativeNote(
  alternative: NonNullable<ProposalAssignment['alternatives']>[number],
  candidates: PlanningCandidate[],
) {
  if (alternative.reason) return displayCandidateReferences(alternative.reason, candidates);
  if (alternative.missingSkills.length > 0) return alternative.missingSkills.join(', ');
  return 'Không có lưu ý nổi bật';
}

export default function PlanningAssignmentDetails({
  assignment,
  candidates,
  canEdit,
  value,
  onChange,
}: {
  assignment: ProposalAssignment;
  candidates: PlanningCandidate[];
  canEdit: boolean;
  value: string;
  onChange: (candidateId: string | null) => void;
}) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const assignee = value ? byId.get(value) : null;
  const strengths = (assignment.skillEvidence ?? []).filter(
    (evidence) => evidence.relationship !== 'missing',
  );
  const risks = [
    ...(assignment.skillEvidence ?? [])
      .filter((evidence) => evidence.relationship === 'missing')
      .map((evidence) => `Thiếu bằng chứng cho ${evidence.requiredSkill}`),
    ...(assignment.concerns ?? []),
    ...(assignment.warning ? [assignment.warning] : []),
  ];
  const origin = assignmentOriginLabel(assignment.origin);
  return (
    <div className="mt-4 space-y-5 border-t pt-4 text-sm">
      <section className="rounded-lg bg-muted/45 p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <UserRoundCheck className="size-4" />
          Đề xuất chính · {origin}
        </div>
        <p className="mt-2 font-medium">
          {assignee ? `Đề xuất giao cho ${assignee.name}` : 'Đề xuất giữ trạng thái chưa phân công'}
        </p>
        <p className="mt-1 leading-6 text-muted-foreground" dir="auto">
          {displayCandidateReferences(assignment.reason, candidates)}
        </p>
        {assignment.reviewRequired && (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            Đây là gợi ý cần trưởng nhóm xác nhận, chưa phải phân công an toàn.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h4 className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4 text-primary" />
            Điểm phù hợp
          </h4>
          {strengths.length === 0 ? (
            <p className="text-muted-foreground">Chưa có năng lực phù hợp được xác minh.</p>
          ) : (
            <ul className="space-y-2">
              {strengths.map((evidence, index) => (
                <li key={`${evidence.requiredSkill}-${index}`} className="rounded-lg border p-2.5">
                  <p className="font-medium" dir="auto">
                    {evidence.requiredSkill}
                  </p>
                  <p className="mt-0.5 text-muted-foreground" dir="auto">
                    {evidence.candidateSkills.join(', ')} ·{' '}
                    {evidence.proficiency === null
                      ? 'chưa rõ trình độ'
                      : `trình độ ${evidence.proficiency}/5`}
                  </p>
                  <p className="mt-1 text-xs font-medium">
                    {relationshipLabels[evidence.relationship]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h4 className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-amber-600" />
            Rủi ro cần lưu ý
          </h4>
          {risks.length === 0 ? (
            <p className="text-muted-foreground">Không có rủi ro nổi bật từ dữ liệu hiện tại.</p>
          ) : (
            <ul className="list-disc space-y-1.5 ps-5 text-muted-foreground">
              {risks.map((risk, index) => (
                <li key={`${risk}-${index}`} dir="auto">
                  {displayCandidateReferences(risk, candidates)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {assignment.alternatives && assignment.alternatives.length > 0 && (
        <section>
          <h4 className="mb-2 font-medium">So sánh ứng viên</h4>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[36rem] text-start text-sm">
              <thead className="bg-muted/55 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">Ứng viên</th>
                  <th className="px-3 py-2 text-start">Điểm đối chiếu</th>
                  <th className="px-3 py-2 text-start">Nguồn lực</th>
                  <th className="px-3 py-2 text-start">Lưu ý chính</th>
                </tr>
              </thead>
              <tbody>
                {assignment.alternatives.map((alternative) => (
                  <tr key={alternative.candidateId} className="border-t align-top">
                    <td className="px-3 py-2 font-medium" dir="auto">
                      {byId.get(alternative.candidateId)?.name ?? 'Ứng viên không còn khả dụng'}
                    </td>
                    <td className="px-3 py-2">{alternative.matchQuality}/100</td>
                    <td className="px-3 py-2">
                      {alternative.capacityStatus
                        ? capacityLabels[alternative.capacityStatus]
                        : 'chưa rõ sức chứa'}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-muted-foreground" dir="auto">
                      {alternativeNote(alternative, candidates)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Điểm đối chiếu phản ánh bằng chứng kỹ năng hiện có, không phải xác suất thành công.
          </p>
        </section>
      )}
      {assignment.suggestedAction && (
        <section className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <h4 className="font-medium">
              {assignment.origin === 'ai_assisted' ? 'Phương án AI khác' : 'Phương án khác'}
            </h4>
            <p className="mt-1 text-muted-foreground">
              {actionLabels[assignment.suggestedAction] ?? assignment.suggestedAction}
            </p>
          </div>
        </section>
      )}
      <section className="rounded-lg border border-primary/25 p-3">
        <h4 className="font-medium">Quyết định của trưởng nhóm</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Chọn người phụ trách hoặc chủ động giữ công việc ở trạng thái chưa phân công.
        </p>
        {canEdit ? (
          <label className="mt-3 block">
            <span className="sr-only">Quyết định của trưởng nhóm</span>
            <select
              className="w-full rounded-md border bg-background p-2"
              value={value}
              onChange={(event) => onChange(event.target.value || null)}
            >
              <option value="">Chưa phân công</option>
              {candidates.map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.name}
                  {!candidate.isRealMember ? ' (tạm thời)' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-3 font-medium">{assignee?.name ?? 'Chưa phân công'}</p>
        )}
      </section>
    </div>
  );
}
