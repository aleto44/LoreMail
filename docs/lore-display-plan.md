# Loremail — Lore Display Feature Plan
### Technology-agnostic specification for the lore panel

---

## Overview

The lore panel is the player's window into the living world. It transforms the flat append-only canon document into a navigable, structured reference — organized by time, people, places, and factions. Everything is shared and omniscient — both players see the same world state with no fog of war.

The panel answers four questions:
- **What has happened?** → Timeline tab
- **Who exists in this world?** → People tab
- **Where is everything?** → Map tab
- **Who holds power?** → Factions tab

A "new since last visit" system highlights changes the player hasn't seen yet without requiring any server state.

---

## Data Files (Game Repo)

The GM engine maintains four structured JSON files alongside the existing canon documents. These are written lazily — only populated as the world generates content that belongs in them.

### `/world/map.json`
```json
{
  "nodes": [
    {
      "id": "crull",
      "label": "Crull Waystation",
      "description": "A remote guild outpost on the eastern edge of the Interior.",
      "first_mentioned": 1714000000
    },
    {
      "id": "interior",
      "label": "The Interior",
      "description": "A vast region of old roads and fading empire.",
      "first_mentioned": 1713000000
    }
  ],
  "edges": [
    {
      "from": "interior",
      "to": "crull",
      "label": "three days by road",
      "travel_hours": 72,
      "first_mentioned": 1714000000
    }
  ]
}
```

### `/world/people.json`
```json
{
  "people": [
    {
      "id": "warden-holt",
      "name": "Warden Holt",
      "description": "The guild's appointed overseer of the eastern waystation network.",
      "status": "whereabouts unknown",
      "first_mentioned": 1714200000,
      "last_updated": 1714200000
    }
  ]
}
```

### `/world/factions.json`
```json
{
  "factions": [
    {
      "id": "cartographers-guild",
      "name": "The Cartographers' Guild",
      "description": "Once the empire's instrument of administration. Now fractured and silent.",
      "disposition": "uncertain",
      "first_mentioned": 1713000000,
      "last_updated": 1714500000
    }
  ]
}
```

### `/world/timeline.json`
```json
{
  "entries": [
    {
      "id": "entry-001",
      "summary": "The eastern waystation at Crull reported unusual smoke on the horizon.",
      "full_ref": "canon.md#crull-smoke",
      "timestamp": 1714200000,
      "tags": ["crull", "cartographers-guild"]
    }
  ]
}
```

---

## GM Engine Changes

The GM response format gains four additional optional fields:

```json
{
  "canon_addition": "string or null",
  "world_event": "string or null",
  "gm_notes_addition": "string or null",
  "sender_location_update": "string or null",
  "recipient_location_update": "string or null",
  "next_letter_travel_hours": 24,
  "map_updates": {
    "new_nodes": [
      {
        "id": "string",
        "label": "string",
        "description": "string"
      }
    ],
    "new_edges": [
      {
        "from": "string",
        "to": "string",
        "label": "string",
        "travel_hours": 24
      }
    ]
  },
  "new_people": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "status": "string"
    }
  ],
  "updated_people": [
    {
      "id": "string",
      "description": "string",
      "status": "string"
    }
  ],
  "new_factions": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "disposition": "string"
    }
  ],
  "updated_factions": [
    {
      "id": "string",
      "description": "string",
      "disposition": "string"
    }
  ],
  "timeline_entry": {
    "id": "string",
    "summary": "string"
  }
}
```

All fields are optional. The engine only populates what the letter implies. If a letter mentions no new places, `map_updates` is null. The engine writes these to their respective JSON files after each delivery — always appending new entries, never overwriting existing ones.

---

## Last Seen System

Tracks what the player has already read so new content can be highlighted without any server state.

### Storage
A single value stored in client-side persistent storage:

```
key: "last_seen_{gameId}"
value: unix timestamp (integer)
```

### Rules
- On app open: read `last_seen` timestamp into memory
- Any canon entry, timeline entry, person, faction, or map node with a `first_mentioned` or `last_updated` timestamp **newer than `last_seen`** is considered NEW
- After the player has had the lore panel open for **30 seconds**, write the current timestamp to `last_seen`
- The 30-second delay prevents everything being marked as seen just because the player briefly visited the tab
- `[NEW]` badges disappear on next app open once `last_seen` has been updated

### New Indicators
- **Timeline tab:** `[NEW]` badge on individual entries
- **People tab:** `[NEW]` badge on person cards, `[UPDATED]` if description or status changed
- **Map tab:** newly appeared nodes pulse or glow subtly on first appearance
- **Factions tab:** `[NEW]` or `[UPDATED]` badge on faction cards
- **Tab bar itself:** a dot indicator on any tab that contains unseen content

---

## The Four Tabs

---

### Tab 1 — Timeline

The chronological record of everything the GM has canonized. Newest entries at the top. This is the primary "catch me up" view.

```
┌──────────────────────────────────────┐
│  WORLD                               │
│                                      │
│  TIMELINE  PEOPLE  MAP  FACTIONS     │
│  ────────                            │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ [NEW]                        │    │
│  │ Unusual smoke was reported   │    │
│  │ on the horizon near Crull.   │    │
│  │ No guild correspondence has  │    │
│  │ been received in eleven days │    │
│  │                              │    │
│  │ crull · guild       3h ago   │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ The market district has been │    │
│  │ under guild protection since │    │
│  │ the third charter. The inner │    │
│  │ circle's role is disputed.   │    │
│  │                              │    │
│  │ market · guild      2d ago   │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ The Interior roads predate   │    │
│  │ the empire's current name.   │    │
│  │ Their builders are unknown.  │    │
│  │                              │    │
│  │ interior            5d ago   │    │
│  └──────────────────────────────┘    │
│                                      │
└──────────────────────────────────────┘
```

**Entry anatomy:**
- `[NEW]` badge if newer than `last_seen`
- Full summary text (not truncated — these are short by design)
- Location and faction tags pulled from the timeline entry
- Relative timestamp ("3h ago", "2d ago")
- Tap an entry to see the full canon passage it came from

---

### Tab 2 — People

All non-player characters the GM has introduced. Public, omniscient — both players see everyone regardless of who has encountered them.

```
┌──────────────────────────────────────┐
│  WORLD                               │
│                                      │
│  TIMELINE  PEOPLE  MAP  FACTIONS     │
│            ──────                    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ [NEW]  Warden Holt           │    │
│  │                              │    │
│  │ The guild's appointed        │    │
│  │ overseer of the eastern      │    │
│  │ waystation network.          │    │
│  │                              │    │
│  │ status: whereabouts unknown  │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ The Archivist                │    │
│  │                              │    │
│  │ A figure mentioned in the    │    │
│  │ margins of pre-edict maps.   │    │
│  │ No other record exists.      │    │
│  │                              │    │
│  │ status: unknown              │    │
│  └──────────────────────────────┘    │
│                                      │
│                                      │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

**Card anatomy:**
- `[NEW]` badge if first introduced since `last_seen`
- `[UPDATED]` badge if status or description changed since `last_seen`
- Name as header
- GM-written description (pulled from people.json)
- Status line — a single short phrase the GM maintains ("whereabouts unknown", "last seen in Crull", "deceased")

---

### Tab 3 — Map

The lazily forming node graph. Starts as two nodes (the two player characters' starting locations) connected by a single edge. Grows as the GM canonizes new places and routes.

```
┌──────────────────────────────────────┐
│  WORLD                               │
│                                      │
│  TIMELINE  PEOPLE  MAP  FACTIONS     │
│                    ───               │
│                                      │
│                                      │
│      ·  ·  ·  ·  ·  ·  ·  ·  ·      │
│    ·                           ·     │
│   ·     ◉ The Interior         ·     │
│    ·         \                 ·     │
│      ·        \  three days   ·      │
│        ·       \             ·       │
│          ·      \           ·        │
│            ·     ◎ Crull   ·         │
│              ·    ●       ·          │
│                ·  ↑      ·           │
│                  · ·   ·             │
│                     · ·              │
│                                      │
│  ◉ known location                    │
│  ◎ known location (active)           │
│  ● player character location         │
│                                      │
└──────────────────────────────────────┘
```

**On tap of a node:**
```
┌──────────────────────────────────────┐
│  WORLD                               │
│                                      │
│  TIMELINE  PEOPLE  MAP  FACTIONS     │
│                    ───               │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  Crull Waystation            │    │
│  │  ──────────────────────────  │    │
│  │  A remote guild outpost on   │    │
│  │  the eastern edge of the     │    │
│  │  Interior.                   │    │
│  │                              │    │
│  │  Connected to:               │    │
│  │  → The Interior (3 days)     │    │
│  │                              │    │
│  │  Last mentioned: 3h ago      │    │
│  │                  [ close ]   │    │
│  └──────────────────────────────┘    │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

**Map behaviour:**
- Starts with two nodes — one per player's starting location
- New nodes appear with a subtle pulse animation on first appearance
- Nodes are draggable — players can arrange the graph spatially however makes sense to them. Their layout is saved in local storage.
- Edge labels show travel time ("three days by road", "half a day by hawk")
- Player character current locations shown as a distinct node style
- Pinch to zoom, drag to pan

**What the GM populates:**
- `new_nodes` — whenever a new named location is canonized
- `new_edges` — whenever a route or distance between two places is implied by a letter
- The GM does not place nodes on a coordinate grid — the graph layout is handled by the client's force-directed layout algorithm. Geography is implied by connections, not coordinates.

---

### Tab 4 — Factions

Organizations, guilds, governments, and groups that have been canonized. Shows the power landscape of the world as it emerges.

```
┌──────────────────────────────────────┐
│  WORLD                               │
│                                      │
│  TIMELINE  PEOPLE  MAP  FACTIONS     │
│                         ────────     │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ [UPDATED]                    │    │
│  │ The Cartographers' Guild     │    │
│  │                              │    │
│  │ Once the empire's instrument │    │
│  │ of administration. Now       │    │
│  │ fractured, its inner circle  │    │
│  │ suspected of deeper dealings │    │
│  │ with the edict itself.       │    │
│  │                              │    │
│  │ disposition: uncertain       │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ The Edict Authority          │    │
│  │                              │    │
│  │ The body that criminalized   │    │
│  │ the practice of magic.       │    │
│  │ Little is known of its       │    │
│  │ membership or reach.         │    │
│  │                              │    │
│  │ disposition: hostile         │    │
│  └──────────────────────────────┘    │
│                                      │
└──────────────────────────────────────┘
```

**Card anatomy:**
- `[NEW]` badge if introduced since `last_seen`
- `[UPDATED]` badge if description or disposition changed
- Faction name as header
- GM-written description — grows as the GM adds to it over time
- Disposition line — a single word or short phrase the GM maintains: "allied", "hostile", "uncertain", "defunct", "unknown"

---

## Tab Bar With Unseen Indicators

When any tab contains content newer than `last_seen`, a dot appears on the tab label:

```
┌──────────────────────────────────────┐
│  WORLD                               │
│                                      │
│  TIMELINE·  PEOPLE  MAP·  FACTIONS   │
│  ────────                            │
│                                      │
```

The dot disappears from a tab once its content has been viewed and `last_seen` has been updated.

---

## GM Prompt Additions

The system prompt gains instructions for extracting structured data alongside narrative additions. Key rules:

- **Extract conservatively.** Only add a person, place, or faction to structured data if it is genuinely established — not just mentioned speculatively.
- **Status and disposition are short phrases only.** One line maximum. The GM does not write paragraphs for status fields.
- **IDs are stable.** Once a person or faction is given an ID, that ID never changes. Updates use `updated_people` / `updated_factions` with the existing ID.
- **Map edges are bidirectional by default.** A route from A to B implies a route from B to A at the same travel time unless the letter implies otherwise (one-way passage, dangerous return).
- **Do not extract player characters into people.json.** Player characters have their own character files. People.json is for NPCs only.

---

## Build Order for This Feature

| Step | What |
|------|------|
| 1 | Update GM response format to include map, people, faction, timeline fields |
| 2 | Update engine to write map.json, people.json, factions.json, timeline.json after each delivery |
| 3 | Update GM system prompt with extraction rules |
| 4 | Implement last_seen timestamp read/write in client storage |
| 5 | Build Timeline tab — chronological entries with NEW badges |
| 6 | Build People tab — NPC cards with status and NEW/UPDATED badges |
| 7 | Build Map tab — force-directed node graph, draggable, zoomable |
| 8 | Build Map node detail panel — tap to expand |
| 9 | Build Factions tab — faction cards with disposition and NEW/UPDATED badges |
| 10 | Implement tab bar unseen dot indicators |
| 11 | Test last_seen 30-second update trigger |
| 12 | Test GM extraction across all three GM styles (gentle, medium, dramatic) |

---

## Decisions

| Question | Decision |
|----------|----------|
| Fog of war | None — both players see all canonized content |
| People visibility | All NPCs public regardless of which player encountered them |
| Map coordinates | No fixed coordinates — force-directed layout, player-arrangeable |
| Map node tap | Shows description and connections in an overlay panel |
| Player character locations on map | Shown as distinct node style, updated by GM each delivery |
| Last seen timer | 30 seconds on lore panel before marking as seen |
| Last seen storage | Client-side persistent storage only, keyed by gameId |
| Timeline entries | Short summaries only — tap to read full canon passage |
| Faction disposition | Single short phrase maintained by GM — not a full paragraph |
| NPC status | Single short phrase maintained by GM |