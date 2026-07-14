import Foundation

@MainActor
final class SettingsStore: ObservableObject {
    private enum Keys {
        static let googleSheetURL = "googleSheetAppScriptURL"
        static let openAIToken = "openAIToken"
        static let appScriptToken = "appScriptToken"
    }

    @Published var openAIToken: String {
        didSet { KeychainStore.save(openAIToken, account: Keys.openAIToken) }
    }

    @Published var googleSheetAppScriptURL: String {
        didSet {
            UserDefaults.standard.set(googleSheetAppScriptURL, forKey: Keys.googleSheetURL)
        }
    }

    @Published var appScriptToken: String {
        didSet { KeychainStore.save(appScriptToken, account: Keys.appScriptToken) }
    }

    var isSheetConfigured: Bool {
        !googleSheetAppScriptURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !appScriptToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    init() {
        openAIToken = KeychainStore.load(account: Keys.openAIToken) ?? ""
        googleSheetAppScriptURL = UserDefaults.standard.string(forKey: Keys.googleSheetURL) ?? ""
        appScriptToken = KeychainStore.load(account: Keys.appScriptToken) ?? ""
    }
}
