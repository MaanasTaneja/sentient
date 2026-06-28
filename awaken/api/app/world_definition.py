from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, model_validator


TRACK_IDS = {
    "greeting",
    "identity",
    "quest",
    "quest_status",
    "opinion",
    "world_lore",
}


class WorldInfo(BaseModel):
    id: str
    name: str
    description: str
    lore: dict[str, Any] = Field(default_factory=dict)
    entities: dict[str, dict[str, Any]] = Field(default_factory=dict)


class FactionDefinition(BaseModel):
    name: str
    description: str
    lore: list[str] = Field(default_factory=list)
    beliefs: dict[str, Any] = Field(default_factory=dict)
    interpretation_prompt: str = ""


class QuestCompletion(BaseModel):
    event_type: str
    filters: dict[str, Any] = Field(default_factory=dict)


class QuestDefinition(BaseModel):
    name: str
    description: str
    essential: bool = False
    priority: int = 0
    objectives: list[str] = Field(default_factory=list)
    completion: QuestCompletion
    completion_events: list[QuestCompletion] = Field(default_factory=list)
    # Only essential quests need a base_dialogue — the LLM must weave it in.
    # Optional quests have no scripted line; the LLM decides whether to offer them.
    base_dialogue: str | None = None
    hint: str | None = None

    def all_completion_events(self) -> list[QuestCompletion]:
        return [self.completion, *self.completion_events]


class PersonalityDefinition(BaseModel):
    speaking_style: str
    temperament: str
    talkativeness: float = Field(ge=0, le=1)
    volatility: float = Field(ge=0, le=1)
    stubbornness: float = Field(ge=0, le=1)
    curiosity: float = Field(ge=0, le=1)
    empathy: float = Field(ge=0, le=1)
    paranoia: float = Field(ge=0, le=1)
    humor: float = Field(ge=0, le=1)


class TrackDefinition(BaseModel):
    player_text: str
    guidance: str


class NPCDefinition(BaseModel):
    name: str
    role: str
    faction: str
    quest: str
    optional_quests: list[str] = Field(default_factory=list)
    personality: PersonalityDefinition
    behavioral_prompt: str
    tracks: dict[str, TrackDefinition]

    @model_validator(mode="after")
    def validate_tracks(self):
        missing = TRACK_IDS - set(self.tracks)
        extra = set(self.tracks) - TRACK_IDS
        if missing or extra:
            raise ValueError(f"tracks must be exactly {sorted(TRACK_IDS)}; missing={missing}, extra={extra}")
        return self


class RelationshipDefinition(BaseModel):
    from_npc: str
    to_npc: str
    relationship_type: str = "acquaintance"
    trust: float = Field(ge=0, le=1)
    affinity: float = Field(ge=-1, le=1)


class EventRuleDefinition(BaseModel):
    memory_template: str
    interpretation_guidance: str = ""


class DemoEventDefinition(BaseModel):
    id: str
    label: str
    faction: str
    event_type: str
    summary: str
    importance: float = Field(default=0.5, ge=0, le=1)
    visibility: str = "PUBLIC"
    payload_json: dict[str, Any] = Field(default_factory=dict)
    quest_key: str | None = None


class WorldDefinition(BaseModel):
    version: int = 1
    world: WorldInfo
    factions: dict[str, FactionDefinition]
    quests: dict[str, QuestDefinition]
    npcs: dict[str, NPCDefinition]
    relationships: list[RelationshipDefinition] = Field(default_factory=list)
    event_rules: dict[str, EventRuleDefinition] = Field(default_factory=dict)
    demo_events: list[DemoEventDefinition] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_references(self):
        for npc_key, npc in self.npcs.items():
            if npc.faction not in self.factions:
                raise ValueError(f"NPC {npc_key} references unknown faction {npc.faction}")
            if npc.quest not in self.quests:
                raise ValueError(f"NPC {npc_key} references unknown quest {npc.quest}")
            for quest_key in npc.optional_quests:
                if quest_key not in self.quests:
                    raise ValueError(f"NPC {npc_key} references unknown optional quest {quest_key}")
        for relationship in self.relationships:
            if relationship.from_npc not in self.npcs or relationship.to_npc not in self.npcs:
                raise ValueError("relationship references an unknown NPC")
        for event in self.demo_events:
            if event.faction not in self.factions:
                raise ValueError(f"demo event {event.id} references unknown faction {event.faction}")
            if event.quest_key and event.quest_key not in self.quests:
                raise ValueError(f"demo event {event.id} references unknown quest {event.quest_key}")
        return self


def load_world_definition(path: Path) -> WorldDefinition:
    with path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    return WorldDefinition.model_validate(raw)
