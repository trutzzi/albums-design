import { useQuery } from "@tanstack/react-query";
import { listSlideshowSessions } from "@/shared/api";

/** A shoot's slideshow links — one query shared by the slideshow panel and the sidebar. */
export function useSlideshowSessions(projectId: string) {
  return useQuery({
    queryKey: ["slideshow-sessions", projectId],
    queryFn: () => listSlideshowSessions(projectId),
    refetchInterval: 15000,
  });
}
