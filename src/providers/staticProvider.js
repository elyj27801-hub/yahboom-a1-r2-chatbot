import { makeNoAnswer, searchKnowledge } from "../search.js";

export class StaticKnowledgeProvider {
  constructor(entries) {
    this.entries = entries;
  }

  async answer(question, context) {
    const results = searchKnowledge(this.entries, question, context.model, {
      contextId: context.lastEntryId,
      contextTitle: context.lastEntryTitle
    });
    if (!results.length) return { type: "not-found", message: makeNoAnswer(context.model), results: [] };
    return { type: "match", primary: results[0].entry, results: results.map(({ entry, score }) => ({ entry, score })) };
  }
}

// A future server-side AI provider can implement the same answer(question, context)
// contract. Never place API keys or direct paid-API calls in browser code.
