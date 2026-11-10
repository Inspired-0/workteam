---
name: to-questionnaire
description: >-
  Trigger when «Открытые вопросы» — from a spec, an architecture or research
  doc, a review, or a subagent's final answer — must be answered by someone who
  is not in the session: the customer, a stakeholder, another team, or the user
  answering offline. Also on «собери вопросы для заказчика», «оформи опросник»,
  «отправлю вопросы клиенту». Not when the user is in the session and can answer
  in dialogue.
license: MIT
metadata:
  source: workteam plugin library
  upstream: mattpocock/skills (MIT), adapted
---

# To Questionnaire

Turn open questions the user cannot answer alone into a **questionnaire** — a Markdown document
in the project's user-facing language that goes to one recipient to fill in async, or that the user walks through with them
in a meeting. The recipient holds knowledge the user lacks; the questionnaire pulls it out. If
the person who can answer is the user and they are in the session, ask in dialogue instead.

## Input: the «Открытые вопросы» we already have

Collect, don't reinvent: the «Открытые вопросы» of artifacts in `docs/specs/`,
`docs/decisions/`, `docs/knowledge/`, `docs/investigations/`; subagents' final answers in the
current chain (per never-invent they hand questions back instead of guessing); gaps you hit
yourself in the code or the docs. Merge duplicates, split compound ones — one question = one
idea. If nothing survives except questions the user can answer, say so and stop.

**Mark what blocks.** A question blocks when guessing its answer would turn the artifact into
fiction: scope, integrations, data formats, external API behaviour, acceptance criteria. Those
go first, labelled **«блокирует спеку»**. Every other question carries the assumption we take if
no answer arrives, so silence stalls nothing but the blockers.

## Process

Interview the user only about the **send** — which they can always answer; the questions
themselves target the gap between what the recipient knows and what we need.

1. **Кому отправляем?** One exchange: the recipient's role, expertise, relation to the user —
   this fixes the tone and how much context the document must carry.
2. **Что нужно получить назад?** One exchange: which decisions the user must be able to make
   once the answers land, and by when. Done when that list is concrete and you can point at the
   blocking questions inside it.
3. **Пишем опросник.** Write it next to the artifact that raised the questions —
   `docs/specs/YYYY-MM-DD_опросник-<тема>.md`, or `docs/` root if there is none — and report the
   path. Done when every item from step 2 and every blocking question is covered.

## Document structure

A discovery questionnaire: we lack context, the recipient has it. Blocking questions first, the
rest most-important-first — async means you may get only one pass.

<questionnaire-template>

# <Тема опросника>

**Зачем:** какое решение зависит от этих ответов.

**От:** <пользователь> — **Кому:** <получатель> — **Что будет с ответами:**
<куда они пойдут: спека, архитектура, оценка>.

## Контекст

Один абзац для того, кто не был в нашей переписке. Достаточно, чтобы ответить
осмысленно, — не пересказ всего проекта.

## Как отвечать

Срок и примерный объём усилий. Частичные ответы и «не знаю» полезны — лучше
пометить неуверенность, чем пропустить вопрос. Отвечать можно прямо под
вопросом, в блоке цитаты.

## Блокирующие вопросы

### <Вопрос одним предложением>

_Почему важно: <что именно мы не сможем решить без ответа>._ **Блокирует
спеку.**

>

## <Тема>

Остальные вопросы, по темам, важные — выше. Один вопрос = одна мысль, без
«и/или» внутри. Под каждым — пустой блок цитаты для ответа. Строка «_Почему
важно_» — только там, где вопрос можно прочитать неправильно или отписаться
одним словом. Для неблокирующих — строка «_Если ответа не будет, действуем
так: …_».

## Что ещё?

Что мы не спросили, но вам кажется важным?

</questionnaire-template>

## When the answers come back

Fold them into the artifact, never leave them in the questionnaire: an answer becomes a decision
in the spec; an unanswered non-blocking question becomes an entry in «Допущения» with the
assumption we took; an unanswered blocking question stays in «Открытые вопросы» and work on that
part does not start. Tell the user which of the three happened to each question.
