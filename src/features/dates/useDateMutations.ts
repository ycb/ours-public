import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DateWhen } from "../../domain/dates";
import { useSupabase } from "../../lib/supabaseContext";
import { activityKeys, paletteKeys, rouletteKeys } from "../palette/keys";
import { cancelDraw, markDrawDone, setDrawWhen } from "./api";

/** Change when, We did it, Not anymore: each refreshes the inbox, the deck and activity. */
export function useDateMutations() {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
      queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
    ]);
  return {
    when: useMutation({ mutationFn: (input: { drawId: string; when: DateWhen }) => setDrawWhen(client, input.drawId, input.when), onSuccess: refresh }),
    done: useMutation({ mutationFn: (drawId: string) => markDrawDone(client, drawId), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: (drawId: string) => cancelDraw(client, drawId), onSuccess: refresh }),
  };
}

