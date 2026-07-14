import SwiftUI

struct SettingView: View {
    @EnvironmentObject private var settings: SettingsStore

    @State private var isTestingConnection = false
    @State private var connectionTestMessage: String?
    @State private var showConnectionTestAlert = false
    @State private var showOpenAIToken = false
    @State private var showAppScriptToken = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    settingsSecretField(
                        title: "OpenAI Token",
                        placeholder: "sk-proj-abc123xyz...",
                        text: $settings.openAIToken,
                        isVisible: $showOpenAIToken
                    )
                }

                Section {
                    settingsURLField(
                        title: "Google Sheet App Script URL",
                        placeholder: "https://script.google.com/macros/s/AKfycb.../exec",
                        text: $settings.googleSheetAppScriptURL
                    )
                }

                Section {
                    settingsSecretField(
                        title: "APP Script Token",
                        placeholder: "a1b2c3d4e5f6789012345678abcdef...",
                        text: $settings.appScriptToken,
                        isVisible: $showAppScriptToken
                    )
                }

                Section {
                    Button {
                        Task { await testConnection() }
                    } label: {
                        HStack {
                            Text("Test connection")
                            Spacer()
                            if isTestingConnection {
                                ProgressView()
                            }
                        }
                    }
                    .disabled(isTestingConnection || !settings.isSheetConfigured)
                } footer: {
                    Text("Checks the web app URL and APP Script token against your Google Sheet.")
                }
            }
            .navigationTitle("Settings")
            .alert("Connection test", isPresented: $showConnectionTestAlert) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(connectionTestMessage ?? "")
            }
        }
    }

    private func settingsSecretField(
        title: String,
        placeholder: String,
        text: Binding<String>,
        isVisible: Binding<Bool>
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.semibold)

            HStack(spacing: 8) {
                Group {
                    if isVisible.wrappedValue {
                        TextField(placeholder, text: text)
                    } else {
                        SecureField(placeholder, text: text)
                    }
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(.body, design: .monospaced))

                Button(isVisible.wrappedValue ? "Hide" : "Show") {
                    isVisible.wrappedValue.toggle()
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.tint)
                .fixedSize()
            }
        }
        .padding(.vertical, 4)
    }

    private func settingsURLField(
        title: String,
        placeholder: String,
        text: Binding<String>
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.semibold)

            TextField(placeholder, text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .font(.system(.body, design: .monospaced))
        }
        .padding(.vertical, 4)
    }

    private func testConnection() async {
        isTestingConnection = true
        defer { isTestingConnection = false }

        do {
            let client = try SheetAPIClient.make(from: settings)
            connectionTestMessage = try await client.testConnection()
        } catch {
            connectionTestMessage = error.localizedDescription
        }

        showConnectionTestAlert = true
    }
}

#Preview {
    SettingView()
        .environmentObject(SettingsStore())
}
