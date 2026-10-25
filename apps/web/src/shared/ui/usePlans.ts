import { useQuery } from "@tanstack/react-query";
import { listPlans } from "@/shared/api";

/** The plan catalogue: one cache entry for every page that shows prices or limits. It only changes on a deploy. */
export function usePlans({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: ["plans"], queryFn: listPlans, staleTime: Infinity, enabled });
}
