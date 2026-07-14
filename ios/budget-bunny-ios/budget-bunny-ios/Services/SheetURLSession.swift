import Foundation

/// Google Apps Script POSTs redirect to googleusercontent.com. iOS must not auto-follow (POST becomes GET → 405).
enum SheetURLSession {
    static func get(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SheetAPIError.invalidResponse
        }
        return (data, http)
    }

    static func post(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        guard let startURL = request.url else {
            throw SheetAPIError.invalidResponse
        }

        var currentURL = startURL
        let body = request.httpBody ?? Data()
        let headers = request.allHTTPHeaderFields ?? [:]

        for _ in 0..<5 {
            var nextRequest = URLRequest(url: currentURL)
            nextRequest.httpMethod = "POST"
            nextRequest.httpBody = body
            headers.forEach { key, value in
                nextRequest.setValue(value, forHTTPHeaderField: key)
            }

            let config = URLSessionConfiguration.ephemeral
            config.httpShouldSetCookies = true
            config.httpCookieAcceptPolicy = .always
            let session = URLSession(configuration: config)

            let (data, response) = try await session.data(for: nextRequest)
            guard let http = response as? HTTPURLResponse else {
                throw SheetAPIError.invalidResponse
            }

            if (200...299).contains(http.statusCode) {
                return (data, http)
            }

            if (300...399).contains(http.statusCode),
               let location = http.value(forHTTPHeaderField: "Location"),
               let redirectURL = URL(string: location, relativeTo: currentURL)?.absoluteURL {
                currentURL = redirectURL
                continue
            }

            let detail = String(data: data, encoding: .utf8)?.prefix(200) ?? ""
            throw SheetAPIError.httpError(
                status: http.statusCode,
                url: currentURL.absoluteString,
                detail: String(detail)
            )
        }

        throw SheetAPIError.httpError(
            status: 0,
            url: startURL.absoluteString,
            detail: "Too many redirects"
        )
    }
}
