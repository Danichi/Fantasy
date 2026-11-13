# Sandbox combat lab

Open the pause menu and choose **Enter Sandbox**. It saves the current adventure and loads a separate practice session. The Sandbox starts directly in a plain dark arena, without character creation or the story opening. Use the pause menu’s **Save Sandbox & return to adventure** action to return to the same adventure slot.

Sandbox progress lives under `fantasy-rpg-sandbox-v1`; practice settings use `fantasy-rpg-sandbox-settings-v1`. The adventure slot index and old save migration keys are left alone. Autosaves, before-unload saves and the normal inventory/skills screens use the Sandbox namespace throughout that boot. Reloading keeps the Sandbox build, equipment, move bar and rules, while opponents start fresh.

Every combat class is available at its level cap (currently 50). Choosing a combat style and an optional magic school fully ranks their implemented tree moves. Other magic schools remain dormant, so their mechanics and passives do not all run simultaneously. The ordinary character level remains derived from discipline levels. Sandbox XP and gold are ample for editing the build in K. Six move selectors populate the normal moves bar; weapon and target requirements still apply. Cross Style receives two swords for dual-wield practice. I opens equipment, and the Sandbox panel can grant weapons, spells, armour, consumables and ammunition by name.

- **F6**: open or close Sandbox controls; the simulation pauses while configuring.
- **F7**: reset the fight, restore health/resources, cancel delayed attacks and live projectiles, and recreate opponents.
- **F9**: existing combat inspection overlay and hitboxes.
- **I / K / Tab / 1–6**: normal equipment, skills, bar mode and equipped moves.

Start with a stationary target, a melee partner, a crossbow opponent or three melee opponents. Health and outgoing damage are adjustable. Player invulnerability, unlimited mana/stamina, instant technique cooldowns, opponent AI and automatic replacement are independent practice rules. Defaults favour uninterrupted experimentation; turn them off to check real timing and survival. Stationary targets stay alive, while living opponents can be defeated. A defeated player is restored in the arena after a short delay.

The lab uses the regular character, combat, animation, damage, posture, spells and skill systems. Its readout reports hits, damage, peak hit, DPS and perfect parries/dodges. The floor is a simple grid with low walls and neutral lighting. There are no world quests or decorative design requirements for this space.
