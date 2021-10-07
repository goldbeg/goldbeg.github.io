class EasyFetchStatusError extends Error {
    constructor(response, respJson) {
        super(`fetch failed with status ${response.statusText || response.status}`);
        this.name = "EasyFetchStatusError";
        this.response = response;
        this.respJson = respJson;
    }
}

async function easyFetch(resource, init = {}) {
    if (!init.credentials) init.credentials = 'include';
    const response = await fetch(resource, init);

    if (!response.ok) {
        let respJson = null;
        try {
            respJson = await response.json();
        }
        catch (err) {
            respJson = { error: "failed to decode the response body, or no error information was given" };
        }
        finally {
            throw new EasyFetchStatusError(response, respJson);
        }
    }

    return response.json();
}