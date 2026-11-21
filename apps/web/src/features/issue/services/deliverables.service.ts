import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  decideDeliverable,
  getDeliverableState,
  reviewDeliverable,
  submitDeliverable,
  type DeliverableDecision,
} from '@/lib/api/endpoints/deliverables';
import { qk } from '@/services/queryKeys';

export function useDeliverableQuery(issueId: number) {
  return useQuery({
    queryKey: qk.deliverable(issueId),
    queryFn: () => getDeliverableState(issueId),
  });
}

function useRefreshDeliverable(issueId: number) {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: qk.deliverable(issueId) });
}

export function useSubmitDeliverable(issueId: number) {
  const refresh = useRefreshDeliverable(issueId);
  return useMutation({
    mutationFn: (file: File) => submitDeliverable(issueId, file),
    onSuccess: refresh,
  });
}

export function useReviewDeliverable(issueId: number) {
  const refresh = useRefreshDeliverable(issueId);
  return useMutation({ mutationFn: reviewDeliverable, onSuccess: refresh });
}

export function useDecideDeliverable(issueId: number) {
  const refresh = useRefreshDeliverable(issueId);
  return useMutation({
    mutationFn: (input: {
      submissionId: number;
      decision: DeliverableDecision;
      comment?: string;
    }) => decideDeliverable(input.submissionId, input.decision, input.comment),
    onSuccess: refresh,
  });
}
