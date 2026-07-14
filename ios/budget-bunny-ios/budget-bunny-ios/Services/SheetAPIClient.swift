import Foundation

struct SheetAPIClient {
    let baseURL: String
    let token: String

    func healthCheck() async throws -> HealthCheckResponse {
        var request = URLRequest(url: try makeURL())
        request.httpMethod = "GET"
        let data = try await performGet(request)
        return try decode(HealthCheckResponse.self, from: data)
    }

    func getCategories() async throws -> GetCategoriesResponse {
        try await post(action: "getCategories")
    }

    func addTransaction(_ data: AddTransactionData) async throws -> AddTransactionResponse {
        try await post(action: "addTransaction", data: data)
    }

    private struct ActionRequest: Encodable {
        let token: String
        let action: String
    }

    private struct ActionRequestWithData<D: Encodable>: Encodable {
        let token: String
        let action: String
        let data: D
    }

    private func post<T: Decodable>(action: String) async throws -> T {
        var request = URLRequest(url: try makeURL())
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(ActionRequest(token: token, action: action))
        let responseData = try await performPost(request)
        return try decode(T.self, from: responseData)
    }

    private func post<T: Decodable, D: Encodable>(action: String, data: D) async throws -> T {
        var request = URLRequest(url: try makeURL())
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            ActionRequestWithData(token: token, action: action, data: data)
        )
        let responseData = try await performPost(request)
        return try decode(T.self, from: responseData)
    }

    private func makeURL() throws -> URL {
        var trimmed = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw SheetAPIError.missingURL }

        if trimmed.hasSuffix("/dev") {
            trimmed = String(trimmed.dropLast(3)) + "exec"
        }
        if !trimmed.contains("/exec") {
            throw SheetAPIError.invalidURL("URL must end with /exec (web app deployment URL)")
        }

        guard let url = URL(string: trimmed) else { throw SheetAPIError.invalidURL(trimmed) }
        return url
    }

    private func performGet(_ request: URLRequest) async throws -> Data {
        let (data, http) = try await SheetURLSession.get(request)
        return try validateResponse(data: data, http: http, url: request.url?.absoluteString ?? "")
    }

    private func performPost(_ request: URLRequest) async throws -> Data {
        let (data, http) = try await SheetURLSession.post(request)
        return try validateResponse(data: data, http: http, url: request.url?.absoluteString ?? "")
    }

    private func validateResponse(data: Data, http: HTTPURLResponse, url: String) throws -> Data {
        guard (200...299).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8)?.prefix(200) ?? ""
            throw SheetAPIError.httpError(status: http.statusCode, url: url, detail: String(detail))
        }
        if looksLikeSignInPage(data) {
            throw SheetAPIError.signInPageRequired
        }
        return data
    }

    private func looksLikeSignInPage(_ data: Data) -> Bool {
        guard let text = String(data: data, encoding: .utf8) else { return false }
        return text.contains("<!DOCTYPE html") || text.contains("accounts.google.com")
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        if let apiError = try? JSONDecoder().decode(APIErrorResponse.self, from: data),
           !apiError.error.isEmpty {
            throw SheetAPIError.apiError(apiError.error)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw SheetAPIError.invalidResponse
        }
    }
}

extension SheetAPIClient {
    @MainActor static func make(from settings: SettingsStore) throws -> SheetAPIClient {
        let url = settings.googleSheetAppScriptURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let token = settings.appScriptToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !url.isEmpty else { throw SheetAPIError.missingURL }
        guard !token.isEmpty else { throw SheetAPIError.missingToken }
        return SheetAPIClient(baseURL: url, token: token)
    }

    func testConnection() async throws -> String {
        let health = try await healthCheck()
        let categories = try await getCategories()
        return "Connected to \(health.app) v\(health.version) — \(categories.categories.count) categories loaded."
    }
}
