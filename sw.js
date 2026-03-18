/*
 * Service Worker — simulates a network proxy (like AdGuard).
 *
 * On every navigation request to this page, the SW intercepts the response
 * and injects a <style> element into <head>. This is exactly what a content-
 * filtering proxy does during HTTP transit.
 *
 * If the browser serves the page from HTTP cache on session restore WITHOUT
 * going through the SW fetch pipeline, the injected <style> will be missing
 * — proving that the network stack (and any proxy) was bypassed.
 */

var SW_VERSION = "1.0";
var INJECTED_STYLE_ID = "sw-proxy-injected";

self.addEventListener("install", function (e) {
    // Activate immediately, don't wait for old SW to retire
    e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (e) {
    // Claim all open tabs immediately so the SW intercepts on first load
    e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (e) {
    var request = e.request;

    // Only intercept navigation requests (top-level page loads)
    if (request.mode !== "navigate") {
        return; // Let non-navigation requests pass through normally
    }

    e.respondWith(
        fetch(request).then(function (response) {
            // Only modify HTML responses
            var contentType = response.headers.get("content-type") || "";
            if (contentType.indexOf("text/html") === -1) {
                return response;
            }

            return response.text().then(function (html) {
                // Inject a marker <style> into <head>, simulating proxy injection
                var timestamp = new Date().toISOString();
                var injectedStyle =
                    '<style id="' + INJECTED_STYLE_ID + '">\n' +
                    "/* Injected by Service Worker (simulating network proxy) */\n" +
                    "/* SW version: " + SW_VERSION + " */\n" +
                    "/* Injection time: " + timestamp + " */\n" +
                    ":root { --sw-proxy-active: 1; }\n" +
                    "#sw-status-indicator { " +
                        "display: block !important; " +
                        "background: #d4edda !important; " +
                        "color: #155724 !important; " +
                        "border: 2px solid #28a745 !important; " +
                    "}\n" +
                    "#sw-status-indicator::after { " +
                        'content: " (injected by SW at ' + timestamp + ')" !important; ' +
                    "}\n" +
                    ".ad-placeholder { display: none !important; }\n" +
                    "</style>\n";

                var modified = html.replace("</head>", injectedStyle + "</head>");

                // Build new headers without Content-Length (it changed)
                var headers = new Headers(response.headers);
                headers.delete("content-length");
                headers.set("x-sw-proxy", "active");
                headers.set("x-sw-timestamp", timestamp);

                return new Response(modified, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: headers
                });
            });
        }).catch(function (err) {
            // Network error — let the browser handle it (e.g., show cached version)
            return caches.match(request);
        })
    );
});
