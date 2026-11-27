---
title: Bots that work together
description: Set up an assistant that hands questions to specialist bots and brings the answers back.
---

A person's bots can hand work to each other. A common setup is one general assistant and a few specialists: you ask the assistant everything, it answers what it can itself, and it passes a question to the specialist whose field it is. The specialist's answer either comes back through the assistant or goes straight to you in the specialist's own chat.

Bots only reach the other bots of the same person. Nobody else's bots, and nothing outside the person's Vinci, takes part.

## Example: an assistant, a games bot and a chess bot

In the app, create three bots (**Create bot**), with any model you have a key for, and give each its instructions (the bot's **Instructions** tab):

| Name | Instructions |
| --- | --- |
| Assistant | You are my personal assistant for everyday questions. You may ask my other bots for help when a question is in their field. |
| Games | You are a computer games specialist: PC and console games, genres, recommendations, hardware for gaming and game history. |
| Chess | You are a chess specialist: openings, tactics, endgames, famous games and players, and how to improve. |

That is all. Each bot is told about the others: their names and the start of their instructions (the first 280 characters). So write the field in the first sentence of a specialist's instructions, as above. Renaming a bot or changing its instructions takes effect from its next message.

## What happens when you ask

**You ask Assistant a chess question.** Assistant asks Chess and waits. While it waits, its chat shows *Asking Chess* with a timer. When the answer comes, Assistant passes it on in its own words, and the chat shows *Messaged Chess* above the reply. Chess worked in a private chat with Assistant, which you don't see; Chess's own chat stays as it was.

**You ask Assistant to let the specialist answer you.** For example: *Hand this to Games and let it answer me directly: a relaxing strategy game for a Steam Deck?* Assistant says it passed the question on. The request then appears in Games' own chat as *Request from Assistant*, followed by Games' answer, and Games gets an unread mark in your chat list. You can carry on the conversation there with Games. Assistant gets a copy and doesn't repeat it.

**A question for two specialists.** Assistant asks both at the same time and combines the answers.

**A question for nobody in particular**, such as a recipe: Assistant answers it itself.

**You ask a specialist something outside its field.** Chess, asked about a graphics card, hands it to Games, which answers you in Games' chat.

**A specialist needs your approval** (in the **Normal** mode, for something your approvals say to ask about): the question appears in the specialist's own chat, marked *Raised from a private chat with Assistant*. Until you answer it there, Assistant keeps showing *Asking …*. If nobody answers before the approval timeout (Settings → Tools), the request is declined and the bots carry on.

## Modes and approvals

- Handing work to another bot never asks you for approval: it stays among your own bots. What the other bot then does follows its own mode and your approvals, as if you had asked it yourself.
- A bot in **Read only** mode cannot hand work to other bots and is not told about them. It can still receive requests: it answers them with what Read only allows.
- **Normal** and **No questions** bots hand work over freely.

## Limits

- A request passes through at most 3 bots, and bots are told not to send a request back to the bot that sent it, so they don't ask each other in circles.
- A bot that is busy in its own chat still answers a private request from another bot. A request handed over to its own chat waits until it finishes there.
- A restart of the server in the middle of a handoff doesn't lose or repeat the request: the specialist answers once and the answer still arrives.
- Bots don't decide by name alone. If a bot doesn't hand a question over that it should, make the specialist's first sentence name its field, or tell the assistant in your message ("ask Chess").

## For admins

Nothing to set up on the server. To give everyone the same team of bots, create them as **suggested bots** in Global settings (see [Global settings and suggested bots](admin.md#global-settings-and-suggested-bots)) with instructions like the table above, and pick them when adding a person. Each person gets their own copies, which only reach each other.
