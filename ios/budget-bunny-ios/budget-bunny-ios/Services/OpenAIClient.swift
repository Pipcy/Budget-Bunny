import Foundation

enum OpenAIError: LocalizedError {
    case missingAPIKey
    case invalidResponse
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "OpenAI API key is required."
        case .invalidResponse:
            return "Could not read OpenAI response."
        case .apiError(let message):
            return message
        }
    }
}

struct OpenAIClient {
    static let defaultModel = "gpt-4o-mini"

    let apiKey: String
    let model: String

    init(apiKey: String, model: String = Self.defaultModel) {
        self.apiKey = apiKey
        self.model = model
    }

    func chatJSON(system: String, user: String) async throws -> Data {
        let trimmedKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedKey.isEmpty else { throw OpenAIError.missingAPIKey }

        var request = URLRequest(url: URL(string: "https://api.openai.com/v1/chat/completions")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(trimmedKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ChatRequest(
            model: model,
            temperature: 0.1,
            responseFormat: ResponseFormat(type: "json_object"),
            messages: [
                ChatMessage(role: "system", content: system),
                ChatMessage(role: "user", content: user),
            ]
        )
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw OpenAIError.invalidResponse
        }

        if let apiError = try? JSONDecoder().decode(OpenAIAPIErrorResponse.self, from: data),
           let message = apiError.error?.message {
            throw OpenAIError.apiError(message)
        }

        guard (200...299).contains(http.statusCode) else {
            let snippet = String(data: data, encoding: .utf8) ?? ""
            throw OpenAIError.apiError("HTTP \(http.statusCode): \(snippet.prefix(200))")
        }

        let completion = try JSONDecoder().decode(ChatCompletionResponse.self, from: data)
        guard let content = completion.choices.first?.message.content,
              let contentData = content.data(using: .utf8)
        else {
            throw OpenAIError.invalidResponse
        }
        return contentData
    }

    private struct ChatRequest: Encodable {
        let model: String
        let temperature: Double
        let responseFormat: ResponseFormat
        let messages: [ChatMessage]

        enum CodingKeys: String, CodingKey {
            case model, temperature, messages
            case responseFormat = "response_format"
        }
    }

    private struct ResponseFormat: Encodable {
        let type: String
    }

    private struct ChatMessage: Encodable {
        let role: String
        let content: String
    }

    private struct ChatCompletionResponse: Decodable {
        let choices: [Choice]

        struct Choice: Decodable {
            let message: Message
        }

        struct Message: Decodable {
            let content: String?
        }
    }

    private struct OpenAIAPIErrorResponse: Decodable {
        let error: APIErrorBody?

        struct APIErrorBody: Decodable {
            let message: String
        }
    }
}
