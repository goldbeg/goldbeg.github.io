class VerdictResponseStore {
    constructor(ttl = 5) { // ttl in seconds
        this.store = {};
        this.ttl = ttl;
        setInterval(this.evictOldResponses, Math.min(10, ttl) * 1000)
    }

    getVerdictResponse = (requestId, requestUrl) => {
        if (requestId in this.store) {
            let hostname = extractHostname(requestUrl);
            return this.store[requestId][hostname];
        }
    };

    setVerdictResponse = (requestId, requestUrl, response) => {
        response["response_time"] = nowInSeconds();

        if (!(requestId in this.store)) {
            this.store[requestId] = {};
        }

        let hostname = extractHostname(requestUrl);
        this.store[requestId][hostname] = response;
    };

    removeVerdictResponse = (requestId) => {
      delete this.store[requestId];
    };

    evictOldResponses = () => {
        for (let requestId of Object.keys(this.store)) {
            let response_time = this.store[requestId]["response_time"];
            if (!response_time || response_time + this.ttl < nowInSeconds()) {
                delete this.store[requestId]
            }
        }
    };
}
