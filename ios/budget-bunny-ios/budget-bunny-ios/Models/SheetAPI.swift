import Foundation

struct HealthCheckResponse: Decodable {
    let status: String
    let app: String
    let version: String
}

struct GetCategoriesResponse: Decodable {
    let categories: [SheetCategory]
}

struct SheetCategory: Decodable {
    let name: String
    let group: String
    let color: String
    let subcategories: [String]
}

struct APIErrorResponse: Decodable {
    let error: String
}

enum SheetAPIError: LocalizedError {
    case missingURL
    case missingToken
    case invalidURL(String)
    case invalidResponse
    case signInPageRequired
    case httpError(status: Int, url: String, detail: String)
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .missingURL:
            return "Google Sheet App Script URL is required."
        case .missingToken:
            return "APP Script Token is required."
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .invalidResponse:
            return "Could not read a valid response from the server."
        case .signInPageRequired:
            return "Google returned a sign-in page. Redeploy the web app with Who has access: Anyone."
        case .httpError(let status, let url, let detail):
            if status == 405 {
                return """
                HTTP 405 at \(url). \
                Use the deployed /exec URL (not /dev). \
                If the URL is correct, redeploy the web app and update Settings.
                \(detail.isEmpty ? "" : "Response: \(detail)")
                """
            }
            return "HTTP \(status) at \(url). \(detail)"
        case .apiError(let message):
            return message
        }
    }
}
