import Foundation

struct CommandParser {
    let openAI: OpenAIClient

    func parse(userText: String, categories: [SheetCategory]) async throws -> ParsedResponse {
        let today = DateFormatter.localDate.string(from: Date())
        let system = buildSystemPrompt(categories: categories, today: today)
        let rawJSON = try await openAI.chatJSON(system: system, user: userText)
        let decoded = try JSONDecoder().decode(RawParsedResponse.self, from: rawJSON)
        return normalize(decoded)
    }

    private func buildSystemPrompt(categories: [SheetCategory], today: String) -> String {
        let categoryBlock = categories.map { category in
            var line = "- \(category.name) (\(category.group))"
            if !category.subcategories.isEmpty {
                line += " → subs: \(category.subcategories.joined(separator: ", "))"
            }
            return line
        }.joined(separator: "\n")

        return """
        You are Budget-Bunny command parser. Today is \(today).

        Convert user natural language into JSON commands. For now ONLY support addTransaction.
        If the user asks for anything else (income, balances, subcategories), return intent "unknown".

        Use ONLY category/subcategory names from this list:
        \(categoryBlock.isEmpty ? "(no categories loaded)" : categoryBlock)

        Merchant naming:
        - merchant = ONLY a real store/venue name (Starbucks, Costco).
        - If no store named → merchant: "Not specified"
        - Put context in notes, not merchant.

        Rules:
        - amounts are positive numbers
        - paymentMethod: Card, Cash, Zelle, Venmo, Other
        - splits must sum to transaction amount
        - every split MUST include "category" (exact name from list)
        - if subcategory is not specified, keep it blank
        - include "subcategory" when known
        - if no date/time given, omit date and transactionTime (server uses now)
        - respond with JSON only, no markdown

        Schema:
        {
          "summary": "one line for user",
          "commands": [
            {
              "intent": "addTransaction",
              "summary": "short label",
              "payload": {
                "date": "YYYY-MM-DD?",
                "transactionTime": "YYYY-MM-DDTHH:mm:ss?",
                "merchant": "...",
                "amount": 0,
                "paymentMethod": "Card",
                "notes": "...",
                "source": "ios",
                "splits": [
                  { "category": "...", "subcategory": "...", "amount": 0, "notes": "..." }
                ]
              }
            }
          ]
        }

        For unsupported requests use:
        { "summary": "...", "commands": [{ "intent": "unknown", "summary": "...", "payload": { "reason": "..." } }] }
        """
    }

    private struct RawParsedResponse: Decodable {
        let summary: String?
        let commands: [RawCommand]?
        let intent: String?
        let payload: AddTransactionPayload?
    }

    private struct RawCommand: Decodable {
        let intent: String?
        let summary: String?
        let payload: AddTransactionPayload?
    }

    private func normalize(_ raw: RawParsedResponse) -> ParsedResponse {
        if let commands = raw.commands, !commands.isEmpty {
            let normalized = commands.map { cmd in
                ParsedCommand(
                    intent: cmd.intent ?? "unknown",
                    summary: cmd.summary,
                    payload: cmd.payload ?? AddTransactionPayload(reason: "missing payload")
                )
            }
            let summary = raw.summary ?? normalized.compactMap(\.summary).joined(separator: "; ")
            return ParsedResponse(summary: summary, commands: normalized)
        }

        if let intent = raw.intent {
            return ParsedResponse(
                summary: raw.summary,
                commands: [
                    ParsedCommand(
                        intent: intent,
                        summary: raw.summary,
                        payload: raw.payload ?? AddTransactionPayload(reason: raw.summary)
                    ),
                ]
            )
        }

        return ParsedResponse(
            summary: raw.summary ?? "Could not parse",
            commands: [
                ParsedCommand(
                    intent: "unknown",
                    summary: raw.summary,
                    payload: AddTransactionPayload(reason: raw.summary ?? "Could not parse")
                ),
            ]
        )
    }
}

private extension DateFormatter {
    static let localDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        return formatter
    }()
}

private extension AddTransactionPayload {
    init(reason: String?) {
        self.init(
            date: nil,
            transactionTime: nil,
            time: nil,
            merchant: nil,
            amount: nil,
            paymentMethod: nil,
            notes: nil,
            source: nil,
            category: nil,
            subcategory: nil,
            splits: nil,
            reason: reason
        )
    }
}
