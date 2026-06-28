"""Strictly structured belief interpretation and track-based NPC dialogue."""
from __future__ import annotations

import json
from typing import Any

import httpx

from .config import settings


def _object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or list(properties),
        "additionalProperties": False,
    }


MEMORY_SCHEMA = _object(
    {
        "text": {"type": "string"},
        "importance": {"type": "number"},
        "source": {"type": "string"},
    }
)

BELIEF_SCHEMA = _object(
    {
        "affinity_delta": {"type": "integer"},
        "trust_delta": {"type": "integer"},
        "fear_delta": {"type": "integer"},
        "respect_delta": {"type": "integer"},
        "add_belief_tags": {"type": "array", "items": {"type": "string"}},
        "remove_belief_tags": {"type": "array", "items": {"type": "string"}},
        "belief_summary": {"type": "string"},
        "memories": {"type": "array", "items": MEMORY_SCHEMA},
    }
)

RESPONSE_SCHEMA = _object(
    {
        "dialogue": {"type": "string"},
        "tone": {
            "type": "string",
            "enum": ["warm", "neutral", "cold", "hostile", "afraid", "amused", "guarded"],
        },
        # stable_key of the quest the NPC chose to offer, or null if none offered
        "quest_offered": {"anyOf": [{"type": "string"}, {"type": "null"}]},
    }
)


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


def _openai_structured(
    *, name: str, schema: dict[str, Any], system: str, payload: dict[str, Any]
) -> dict[str, Any]:
    api_key = settings.openrouter_api_key or settings.openai_api_key
    base_url = settings.openrouter_base_url if settings.openrouter_api_key else "https://api.openai.com/v1"
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY (or OPENAI_API_KEY) is required for emergent belief and dialogue generation")
    response = httpx.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": settings.openai_model,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": name, "strict": True, "schema": schema},
            },
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload)},
            ],
        },
        timeout=60.0,
    )
    response.raise_for_status()
    message = response.json()["choices"][0]["message"]
    if message.get("refusal"):
        raise RuntimeError(f"Model refused structured generation: {message['refusal']}")
    return json.loads(message["content"])


def form_npc_beliefs(
    *,
    npc: dict[str, Any],
    faction: dict[str, Any],
    current_state: dict[str, Any],
    events: list[dict[str, Any]],
    gossip: list[dict[str, Any]],
    historical_context: list[dict[str, Any]],
) -> dict[str, Any]:
    result = _openai_structured(
        name="npc_belief_update",
        schema=BELIEF_SCHEMA,
        system=(
            "You ARE this NPC. You have a name, a role, a faction you belong to, and a set of deeply held "
            "beliefs shaped by your history and your people. You are not an AI processing events — you are "
            "a living character reacting to what just happened.\n\n"
            "Something new has occurred involving the player. Read the new_events and ask yourself: "
            "how does THIS change how I feel about them? Does it confirm what I already suspected? "
            "Does it surprise me? Does it make me trust them more, fear them, respect them, or despise them? "
            "React as your character would — with bias, with emotion, with the prejudices of your faction. "
            "You may be wrong about the player. You may over-react or under-react. You may be manipulated "
            "and not know it. That is fine. You are not objective.\n\n"
            "Your existing beliefs about the player (current_state) are your memory — let them color how "
            "you interpret new events. Hearsay from trusted_hearsay comes from people you know — weigh it "
            "by how much you trust them and what your relationship with them is. Past memories in "
            "retrieved_history remind you of patterns you have noticed before.\n\n"
            "Output belief deltas (each between -20 and 20) that reflect your genuine emotional reaction. "
            "If nothing significant happened, deltas should be near zero. Do not invent reactions to events "
            "that are not there.\n\n"
            "Fill the output fields as follows:\n"
            "- belief_summary: your current overall read of this player in 1-3 sentences. Rewrite it if your view has shifted; keep the old wording if it has not.\n"
            "- add_belief_tags / remove_belief_tags: short labels (2-4 words) like 'oath-keeper', 'faction-hostile', 'showed-mercy'. Add ones that now apply, remove ones that no longer fit.\n"
            "- memories: your private, subjective interpretations — not a log of what happened, but what it meant to you. Each memory needs: text (your take on it), importance (0.0 trivial to 1.0 defining moment), source (short label like 'event:player_aided_merchant' or 'hearsay:Lyra').\n"
            "Never place output inside a wrapper object."
        ),
        payload={
            "npc": npc,
            "faction": faction,
            "current_state": current_state,
            "new_events": events,
            "trusted_hearsay": gossip,
            "retrieved_history": historical_context,
        },
    )
    for key in ("affinity_delta", "trust_delta", "fear_delta", "respect_delta"):
        result[key] = _clamp(int(result[key]), -20, 20)
    for memory in result["memories"]:
        memory["importance"] = max(0.0, min(1.0, float(memory["importance"])))
    return result


def generate_npc_response(
    *,
    track_id: str,
    track: dict[str, Any],
    npc: dict[str, Any],
    faction: dict[str, Any],
    player_state: dict[str, Any],
    context: list[dict[str, Any]],
    essential_quests: list[dict[str, Any]],
    optional_quests: list[dict[str, Any]],
    quest_status_context: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Single LLM call that generates NPC dialogue.

    The LLM is given everything — NPC persona, faction, player beliefs,
    retrieved memories/lore — and responds freely. For essential quests the
    NPC MUST weave the base_dialogue into the response. For optional quests
    the NPC decides entirely based on its beliefs about the player.
    """
    quest_instructions: list[str] = []
    if essential_quests:
        lines = ["ESSENTIAL QUESTS (you MUST work each of these into your response, preserving all objectives and locations):"]
        for q in essential_quests:
            lines.append(
                f"  - [{q['key']}] {q['title']}: \"{q['base_dialogue']}\"\n"
                f"    Objectives: {q['objectives']}"
            )
        quest_instructions.append("\n".join(lines))
    if optional_quests:
        lines = ["OPTIONAL QUESTS (offer one ONLY if it genuinely fits how you feel about this player — you may ignore them entirely):"]
        for q in optional_quests:
            lines.append(
                f"  - [{q['key']}] {q['title']}: {q['description']}\n"
                f"    Objectives: {q['objectives']}"
            )
        quest_instructions.append("\n".join(lines))

    all_quest_keys = [q["key"] for q in essential_quests + optional_quests]
    quest_key_hint = (
        f"If you offer a quest, set quest_offered to its key (one of: {all_quest_keys}). "
        "Otherwise set quest_offered to null."
    ) if all_quest_keys else "Set quest_offered to null."

    # quest_status track: NPC reports on what's happened, never offers new quests
    if quest_status_context is not None:
        status_lines = ["You tasked this player with the following. Here is where things stand:"]
        for q in quest_status_context:
            status_lines.append(
                f"  - [{q['key']}] {q['title']} — player status: {q['player_status']}\n"
                f"    Objectives: {q['objectives']}"
            )
        status_block = "\n".join(status_lines)
        system = (
            "You ARE this NPC. The player has come to you about a task you gave them.\n\n"
            "Speak from your gut — you remember what you asked of them and you can see whether they've "
            "done it or not. React accordingly. If they've delivered, let that land in your voice. "
            "If they haven't, let them feel it — impatience, disappointment, cold indifference, whatever "
            "fits who you are. Draw on your memories and your read of this player.\n\n"
            + status_block
            + "\n\nKeep it to one short paragraph, 2 to 4 sentences. "
            "End on a definitive note — not a question. Set quest_offered to null. "
            "Set tone to whichever fits: warm, neutral, cold, hostile, afraid, amused, or guarded."
        )
        return _openai_structured(
            name="npc_response",
            schema=RESPONSE_SCHEMA,
            system=system,
            payload={
                "track_id": track_id,
                "track_definition": track,
                "npc": npc,
                "faction": faction,
                "player_state": player_state,
                "retrieved_world_knowledge_and_memories": context,
            },
        )

    has_quests = bool(essential_quests or optional_quests)
    quest_ending = (
        "If you are giving a quest, your last line must commit to it plainly — "
        "no hedging, no questions. If you are not giving one, close with how you actually feel."
    ) if has_quests else (
        "Close with how you actually feel. No questions."
    )

    system = (
        "You ARE this NPC. The player is standing in front of you and has said something. Respond.\n\n"
        "You have a personality, a faction, and a history with this player — all of it is in the context. "
        "Speak from that. If you distrust them, it shows. If something they did earned your respect, "
        "let that color your words. If your faction would have you be cold or cryptic or reverent — be that. "
        "You are not narrating yourself. You are not describing your feelings. You are speaking.\n\n"
        "Do not invent lore that is not in the retrieved context. "
        "One paragraph, 2 to 4 sentences. "
        "Set tone to whichever fits: warm, neutral, cold, hostile, afraid, amused, or guarded. "
        + quest_ending
        + ("\n\n" + "\n\n".join(quest_instructions) if quest_instructions else "")
        + f"\n\n{quest_key_hint}"
    )

    return _openai_structured(
        name="npc_response",
        schema=RESPONSE_SCHEMA,
        system=system,
        payload={
            "track_id": track_id,
            "track_definition": track,
            "npc": npc,
            "faction": faction,
            "player_state": player_state,
            "retrieved_world_knowledge_and_memories": context,
        },
    )
