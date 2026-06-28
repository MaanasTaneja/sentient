import unittest

from app.seed import DEFAULT_WORLD_FILE
from app.world_definition import TRACK_IDS, load_world_definition


class WorldDefinitionTests(unittest.TestCase):
    def test_aelryn_definition_is_complete(self):
        definition = load_world_definition(DEFAULT_WORLD_FILE)

        self.assertEqual(definition.world.id, "aelryn")
        self.assertEqual(len(definition.factions), 3)
        self.assertEqual(len(definition.quests), 7)
        self.assertEqual(len(definition.npcs), 5)
        self.assertEqual(len(definition.demo_events), 15)
        for npc in definition.npcs.values():
            self.assertEqual(set(npc.tracks), TRACK_IDS)
            self.assertIn(npc.quest, definition.quests)
            for quest_key in npc.optional_quests:
                self.assertIn(quest_key, definition.quests)
        for event in definition.demo_events:
            self.assertIn(event.faction, definition.factions)
            if event.quest_key:
                self.assertIn(event.quest_key, definition.quests)

    def test_essential_quests_have_base_dialogue(self):
        definition = load_world_definition(DEFAULT_WORLD_FILE)

        for quest in definition.quests.values():
            if quest.essential:
                self.assertTrue(quest.base_dialogue)

    def test_quests_can_define_alternate_terminal_events(self):
        definition = load_world_definition(DEFAULT_WORLD_FILE)

        relic_events = definition.quests["recover_sacred_relic"].all_completion_events()
        self.assertIn(
            ("ITEM_STOLEN", {"entity_key": "sacred_relic"}),
            [(event.event_type, event.filters) for event in relic_events],
        )

    def test_npcs_can_have_optional_quests(self):
        definition = load_world_definition(DEFAULT_WORLD_FILE)

        self.assertEqual(
            definition.npcs["varyon"].optional_quests,
            ["consecrate_ward_flame"],
        )
        self.assertEqual(
            definition.npcs["cassian"].optional_quests,
            ["reinforce_western_gate"],
        )
        self.assertEqual(
            definition.npcs["elara"].optional_quests,
            ["expose_temple_ledger"],
        )

if __name__ == "__main__":
    unittest.main()
