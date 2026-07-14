import Foundation

struct ParsedResponse: Codable {
    let summary: String?
    let commands: [ParsedCommand]
}

struct ParsedCommand: Codable {
    let intent: String
    let summary: String?
    let payload: AddTransactionPayload
}

struct AddTransactionPayload: Codable {
    var date: String?
    var transactionTime: String?
    var time: String?
    var merchant: String?
    var amount: Double?
    var paymentMethod: String?
    var notes: String?
    var source: String?
    var category: String?
    var subcategory: String?
    var splits: [TransactionSplitPayload]?
    var reason: String?

    func normalizedForSheet() throws -> AddTransactionData {
        var payload = self
        if payload.source == nil { payload.source = "ios" }

        var splits = payload.splits ?? []
        if splits.isEmpty, let amount = payload.amount, let category = payload.category {
            splits = [
                TransactionSplitPayload(
                    category: category,
                    subcategory: payload.subcategory,
                    amount: amount,
                    reimbursementStatus: nil,
                    notes: nil
                ),
            ]
        }

        guard let amount = payload.amount else {
            throw CommandRunnerError.invalidPayload("addTransaction requires amount")
        }
        guard !splits.isEmpty else {
            throw CommandRunnerError.invalidPayload("addTransaction requires splits")
        }

        return AddTransactionData(
            date: payload.date,
            transactionTime: payload.transactionTime,
            merchant: payload.merchant ?? "Not specified",
            amount: amount,
            paymentMethod: payload.paymentMethod ?? "Other",
            notes: payload.notes,
            source: payload.source,
            splits: splits.map { split in
                TransactionSplitData(
                    category: split.category,
                    subcategory: split.subcategory,
                    amount: split.amount,
                    reimbursementStatus: split.reimbursementStatus,
                    notes: split.notes
                )
            }
        )
    }
}

struct TransactionSplitPayload: Codable {
    let category: String
    var subcategory: String?
    let amount: Double
    var reimbursementStatus: String?
    var notes: String?
}

struct AddTransactionData: Encodable {
    let date: String?
    let transactionTime: String?
    let merchant: String
    let amount: Double
    let paymentMethod: String
    let notes: String?
    let source: String?
    let splits: [TransactionSplitData]
}

struct TransactionSplitData: Encodable {
    let category: String
    let subcategory: String?
    let amount: Double
    let reimbursementStatus: String?
    let notes: String?
}

struct AddTransactionResponse: Decodable {
    let id: String
    let success: Bool
}

enum CommandRunnerError: LocalizedError {
    case missingOpenAIToken
    case missingSheetConfig
    case invalidPayload(String)
    case unsupportedIntent(String)
    case noExecutableCommands(String)

    var errorDescription: String? {
        switch self {
        case .missingOpenAIToken:
            return "OpenAI token is required in Settings."
        case .missingSheetConfig:
            return "Google Sheet URL and APP Script token are required in Settings."
        case .invalidPayload(let message):
            return message
        case .unsupportedIntent(let intent):
            return "Intent not implemented yet: \(intent)"
        case .noExecutableCommands(let reason):
            return reason
        }
    }
}
