import SwiftUI

struct ChatMessage: Identifiable {
    enum Role {
        case user
        case assistant
    }

    let id = UUID()
    let role: Role
    let text: String
    var summaries: [String] = []
}

struct MainView: View {
    @EnvironmentObject private var settings: SettingsStore

    @State private var userInput = ""
    @State private var messages: [ChatMessage] = []
    @State private var isSending = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .bottom, spacing: 8) {
                    TextField("Describe a transaction in a sentence.", text: $userInput, axis: .vertical)
                        .lineLimit(3...8)
                        .textFieldStyle(.roundedBorder)
                        .disabled(isSending)

                    Button("Send", action: sendMessage)
                        .buttonStyle(.borderedProminent)
                        .disabled(isSending || userInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.horizontal)
                .padding(.top)

                VStack(alignment: .leading, spacing: 8) {
                    if isSending {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Working...")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }

                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 12) {
                                if messages.isEmpty {
                                    Text("No messages yet.")
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach(messages) { message in
                                        messageRow(message)
                                            .id(message.id)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4)
                        }
                        .onChange(of: messages.count) { _, _ in
                            if let lastID = messages.last?.id {
                                withAnimation {
                                    proxy.scrollTo(lastID, anchor: .bottom)
                                }
                            }
                        }
                    }
                }
                .padding()
                .frame(maxHeight: .infinity)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal)
                .padding(.bottom)
            }
            .navigationTitle("Main Menu")
        }
    }

    private func messageRow(_ message: ChatMessage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message.role == .user ? "You:" : "Reply:")
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundStyle(message.role == .user ? .primary : .secondary)

            if message.role == .assistant {
                Text(message.text)
                    .font(.system(.footnote, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)

                if !message.summaries.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(message.summaries, id: \.self) { summary in
                            Text(summary)
                                .font(.body)
                                .fontWeight(.bold)
                                .foregroundStyle(.blue)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .textSelection(.enabled)
                                .padding(10)
                                .background(Color(.systemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
            } else {
                Text(message.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(10)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private func sendMessage() {
        let trimmed = userInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }

        messages.append(ChatMessage(role: .user, text: trimmed))
        userInput = ""
        isSending = true

        Task {
            let result = await BudgetCommandRunner(settings: settings).run(userText: trimmed)
            messages.append(ChatMessage(role: .assistant, text: result.debugLog, summaries: result.summaries))
            isSending = false
        }
    }
}

#Preview {
    MainView()
        .environmentObject(SettingsStore())
}
