import Foundation

/// Programmatic user-facing summaries for executed commands (not LLM-generated).
enum CommandSummarizer {
    static func summarize(intent: String, payload: AddTransactionData) -> String? {
        switch intent {
        case "addTransaction":
            return AddTransactionSummarizer.summarize(payload)
        default:
            return nil
        }
    }
}

enum AddTransactionSummarizer {
    static func summarize(_ data: AddTransactionData) -> String {
        let allocation = formatAllocations(data.splits)
        return "Spend logged. \(allocation)."
    }

    private static func formatAllocations(_ splits: [TransactionSplitData]) -> String {
        guard !splits.isEmpty else { return formatCurrency(0) }

        if splits.count == 1 {
            return formatSingleSplit(splits[0])
        }

        let total = splits.reduce(0) { $0 + $1.amount }
        let parts = splits.map { split in
            let sub = splitLabel(split)
            return "\(sub) (\(formatCurrency(split.amount)))"
        }
        return "\(formatCurrency(total)) total — \(parts.joined(separator: ", "))"
    }

    private static func formatSingleSplit(_ split: TransactionSplitData) -> String {
        "\(formatCurrency(split.amount)) in \(splitLabel(split))"
    }

    private static func splitLabel(_ split: TransactionSplitData) -> String {
        if let sub = split.subcategory, !sub.isEmpty {
            return "\(split.category): \(sub)"
        }
        return split.category
    }

    private static func formatCurrency(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = amount.truncatingRemainder(dividingBy: 1) == 0 ? 0 : 2
        return formatter.string(from: NSNumber(value: amount)) ?? "$\(amount)"
    }
}
