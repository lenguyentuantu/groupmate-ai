import type { PlanningCandidate } from '@/lib/api/endpoints/planning';

export function displayCandidateReferences(value: string, candidates: PlanningCandidate[]) {
  return value.replace(/\bc([1-9]\d*)\b/gi, (_, index: string) => {
    return candidates[Number(index) - 1]?.name ?? 'ứng viên không xác định';
  });
}
