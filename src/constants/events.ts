import { WorldDefinition } from "@/hooks/useAwakenAPI";

export interface WorldEvent {
  id: string;
  label: string;
  faction: string;          // stable_key matching seed factions map
  questKey?: string;
  event_type: string;
  summary: string;
  importance: number;
  visibility: "PUBLIC" | "DIRECT" | "SECRET";
  payload_json?: Record<string, unknown>;
}

const FALLBACK_EVENTS: WorldEvent[] = [
  {
    id: "steal_relic",
    label: "⚔ Steal Sacred Relic",
    faction: "ashen_temple",
    event_type: "ITEM_STOLEN",
    summary: "Player stole the Sacred Relic from the Ashen Temple",
    importance: 0.9,
    visibility: "PUBLIC",
    payload_json: { entity_key: "sacred_relic" },
  },
  {
    id: "return_relic",
    label: "✦ Return Sacred Relic",
    faction: "ashen_temple",
    questKey: "recover_sacred_relic",
    event_type: "ITEM_RETURNED",
    summary: "Player returned the Sacred Relic to the Ashen Temple",
    importance: 0.85,
    visibility: "PUBLIC",
    payload_json: { entity_key: "sacred_relic", destination: "ashen_temple" },
  },
  {
    id: "calibrate_lens",
    label: "✦ Calibrate the Star Lens",
    faction: "mages_guild",
    questKey: "calibrate_star_lens",
    event_type: "ENTITY_UPDATED",
    summary: "Player calibrated the Star Lens for Elara of the Mages Guild",
    importance: 0.8,
    visibility: "PUBLIC",
    payload_json: { entity_key: "star_lens", calibrated: true },
  },
  {
    id: "deliver_letter",
    label: "✦ Deliver Sealed Letter",
    faction: "merchant_house",
    questKey: "deliver_sealed_letter",
    event_type: "ITEM_DELIVERED",
    summary: "Player delivered the sealed letter for Mira of the Merchant House",
    importance: 0.75,
    visibility: "PUBLIC",
    payload_json: { entity_key: "sealed_letter", recipient: "elara", opened: false },
  },
  {
    id: "map_tunnels",
    label: "✦ Map Smuggler Tunnels",
    faction: "merchant_house",
    questKey: "map_smuggler_tunnels",
    event_type: "LOCATION_MAPPED",
    summary: "Player mapped the smuggler tunnels for Bren of the Merchant House",
    importance: 0.7,
    visibility: "PUBLIC",
    payload_json: { location: "lantern_market_tunnels", branches: 3 },
  },
  {
    id: "attack",
    label: "⚔ Attack Villager",
    faction: "ashen_temple",
    event_type: "PLAYER_ATTACKED",
    summary: "Player attacked a villager in the town square",
    importance: 0.9,
    visibility: "PUBLIC",
  },
];

export function getWorldEvents(definition: WorldDefinition | null): WorldEvent[] {
  return FALLBACK_EVENTS.map((event) => {
    if (!event.questKey) return event;

    const completion = definition?.quests[event.questKey]?.completion;
    if (!completion) return event;

    return {
      ...event,
      event_type: completion.event_type,
      payload_json: completion.filters,
    };
  });
}
