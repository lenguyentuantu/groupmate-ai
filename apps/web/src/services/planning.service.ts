import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import * as api from '@/lib/api/endpoints/planning';
import type { PageParams } from '@/lib/api/core/paging';

const key = (ref: string) => ['planning', ref] as const;
export const usePlanDrafts = (ref: string, page: PageParams) =>
  useQuery({
    queryKey: [...key(ref), 'list', page],
    queryFn: () => api.listPlanDrafts(ref, page),
    enabled: !!ref,
  });
export const usePlanDraft = (ref: string, id: number | null) =>
  useQuery({
    queryKey: [...key(ref), id],
    queryFn: () => api.getPlanDraft(ref, id!),
    enabled: id !== null,
  });
export const usePlanRevisions = (ref: string, id: number, page: PageParams) =>
  useQuery({
    queryKey: [...key(ref), id, 'history', page],
    queryFn: () => api.listPlanRevisions(ref, id, page),
  });
export const usePlanRevision = (ref: string, id: number, version: number | null) =>
  useQuery({
    queryKey: [...key(ref), id, 'history', version],
    queryFn: () => api.getPlanRevision(ref, id, version!),
    enabled: version !== null,
  });
export const usePlanSources = (ref: string, page: PageParams) =>
  useQuery({
    queryKey: [...key(ref), 'sources', page],
    queryFn: () => api.listPlanSources(ref, page),
  });
export function useSavePlan(ref: string, id?: number) {
  const qc = useQueryClient();
  const t = useTranslations('documents.planning');
  return useMutation({
    mutationFn: (input: Parameters<typeof api.savePlanDraft>[1]) =>
      api.savePlanDraft(ref, input, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key(ref) });
      toast.success(t('saved'));
    },
  });
}
export function useUploadPlanSource(ref: string) {
  const qc = useQueryClient();
  const t = useTranslations('documents.planning');
  return useMutation({
    mutationFn: (input: Parameters<typeof api.uploadPlanSource>[1]) =>
      api.uploadPlanSource(ref, input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [...key(ref), 'sources'] });
      toast.success(t('uploaded'));
    },
  });
}
export function useGeneratePlan(ref: string, id?: number) {
  return useMutation({
    mutationFn: ({ agentId, version }: { agentId: number; version: number }) =>
      api.generatePlan(ref, id!, agentId, version),
  });
}
