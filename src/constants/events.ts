import { WorldDefinition } from "@/hooks/useAwakenAPI";

export interface WorldEvent {
  id: string;
  label: string;
  faction: string;
  quest_key?: string | null;
  event_type: string;
  summary: string;
  importance: number;
  visibility: "PUBLIC" | "DIRECT" | "SECRET" | "GLOBAL";
  payload_json?: Record<string, unknown>;
}

export function getWorldEvents(definition: WorldDefinition | null): WorldEvent[] {
  return (definition?.demo_events ?? []).map((event) => {
    const completion = event.quest_key
      ? definition?.quests[event.quest_key]?.completion
      : null;

    if (!completion) return event;

    return {
      ...event,
      event_type: completion.event_type,
      payload_json: completion.filters,
    };
  });
}
