import Foundation

@MainActor
struct BudgetCommandRunner {
    let settings: SettingsStore

    func run(userText: String) async -> CommandRunResult {
        var lines: [String] = []
        var summaries: [String] = []

        do {
            try validateSettings()
            let openAI = OpenAIClient(apiKey: settings.openAIToken)
            let sheet = try SheetAPIClient.make(from: settings)

            lines.append("Parsing with \(OpenAIClient.defaultModel)...")

            let categoriesResponse = try await sheet.getCategories()
            lines.append("Loaded \(categoriesResponse.categories.count) categories from sheet.")

            let parser = CommandParser(openAI: openAI)
            let parsed = try await parser.parse(userText: userText, categories: categoriesResponse.categories)

            lines.append("")
            lines.append("--- Parsed ---")
            lines.append(prettyJSON(parsed))

            let transactionCommands = parsed.commands.filter { $0.intent == "addTransaction" }
            let skipped = parsed.commands.filter { $0.intent != "addTransaction" }

            if transactionCommands.isEmpty {
                let reason = skipped.first?.payload.reason ?? parsed.summary ?? "No addTransaction command"
                throw CommandRunnerError.noExecutableCommands("Could not parse addTransaction: \(reason)")
            }

            if !skipped.isEmpty {
                lines.append("")
                lines.append("--- Skipped (not implemented) ---")
                for cmd in skipped {
                    lines.append("- \(cmd.intent): \(cmd.summary ?? "")")
                }
            }

            lines.append("")
            lines.append("Executing \(transactionCommands.count) addTransaction command(s)...")

            for (index, command) in transactionCommands.enumerated() {
                lines.append("")
                lines.append("[\(index + 1)/\(transactionCommands.count)] \(command.summary ?? "addTransaction")")
                let payload = try command.payload.normalizedForSheet()
                lines.append("Payload:")
                lines.append(prettyJSON(payload))

                let result = try await sheet.addTransaction(payload)
                lines.append("Result: id=\(result.id), success=\(result.success)")

                if result.success, let summary = CommandSummarizer.summarize(intent: command.intent, payload: payload) {
                    summaries.append(summary)
                }
            }

            lines.append("")
            lines.append("Done.")
        } catch {
            lines.append("")
            lines.append("ERROR: \(error.localizedDescription)")
        }

        return CommandRunResult(debugLog: lines.joined(separator: "\n"), summaries: summaries)
    }

    private func validateSettings() throws {
        if settings.openAIToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw CommandRunnerError.missingOpenAIToken
        }
        if !settings.isSheetConfigured {
            throw CommandRunnerError.missingSheetConfig
        }
    }

    private func prettyJSON<T: Encodable>(_ value: T) -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(value),
              let text = String(data: data, encoding: .utf8)
        else {
            return String(describing: value)
        }
        return text
    }
}
