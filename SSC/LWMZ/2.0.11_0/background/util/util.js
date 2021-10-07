is_active = function (configuration) {
    const timezone = config.getDeviceTimezone();
    const dateTime = new luxon.DateTime.now().setZone(timezone);

    let dayOfWeek = dateTime.weekday;
    let minutes = (dateTime.minute < 10 ? "0" : "") + dateTime.minute;
    let hours = (dateTime.hour < 10 ? "0" : "") + dateTime.hour;
    let time = parseInt(hours + minutes);
    let configActive = config_active(configuration);
    logging__debug("Config Active", configuration, configActive, dayOfWeek, time);
    return configActive
};

safeMapGet = (map, value, defaultValue = undefined) => {
    if (map[value]) {
        return map[value]
    } else {
        return defaultValue
    }
};


extractDomain = (url) => {
    let domain;
    if (url.indexOf("://") > -1) {
        domain = url.split('/')[2];
    } else {
        domain = url.split('/')[0];
    }
    domain = domain.split(':')[0];
    return domain;
};

function extractHostname(url) {
    let hostname;
    if (!url) {
        return undefined;
    }
    //find & remove protocol (http, ftp, etc.) and get hostname

    if (url.indexOf("//") > -1) {
        hostname = url.split('/')[2];
    } else {
        hostname = url.split('/')[0];
    }

    //find & remove port number
    hostname = hostname.split(':')[0];
    //find & remove "?"
    hostname = hostname.split('?')[0];
    return hostname;
}

nowInSeconds = () => {
    return Math.floor(Date.now() / 1000)
};

function extractURLPath(url) {
    let path;
    let start;

    if (url.indexOf("//") > 0) {

        let offset = url.indexOf("//");
        start = url.indexOf('/', offset + 2);
        if (start > 0) {
            path = url.substring(start + 1);
        }
    } else {
        start = url.indexOf('/');
        if (start > 0) {
            path = url.substring(url.indexOf('/') + 1);
        }
    }

    if (start < 0) {
        path = "";
    }

    if (path.slice(-1) == "/") {
        path = path.slice(0, -1);
    }

    return path;
}

extractPort = function (url) {
    let port = Number(extractRequestUri(url).split("/")[0].replace(":", ""));
    if (!isNaN(port) && port > 0) {
        return port
    }
    if (url.startsWith("https")) {
        return 443
    }
    if (url.startsWith("http")) {
        return 80
    }
    if (url.startsWith("ftp")) {
        return 21
    }
    return 0
};

extractRequestUri = function (url) {
    let domain = extractHostname(url);
    return url.substring(url.indexOf(domain) + domain.length)
};

config_active = function (configuration) {
    let now = nowInSeconds();
    if (configuration.timeout !== 0 && configuration.timeout > now) {
        return true;
    }

    return !!find_active_period(configuration.periods);
};

const DAY_INT_TO_STR_MAP = new Map().set(0, 'sun').set(1, 'mon').set(2, 'tue').set(3, 'wed').set(4, 'thur').set(5, 'fri').set(6, 'sat')
const DAY_STR_TO_INT_MAP = new Map().set('sun', 0).set('mon', 1).set('tue', 2).set('wed', 3).set('thur', 4).set('fri', 5).set('sat', 6)
/**
 * @param {Array} periods - Scheduled periods for a classroom (configuration)
 * @return {Object|null} - The currently active period, or null if no periods are active
 */
function find_active_period(periods) {
    const timezone = config.getDeviceTimezone();
    const nowDate = new luxon.DateTime.now().setZone(timezone);
    const nowDayStr = DAY_INT_TO_STR_MAP.get(nowDate.weekday);
    
    const time = nowDate.hour * 100 + nowDate.minute; // converts to HHmm representation

    for (const p of periods) {
        if (p.day === nowDayStr && time >= p.startTime && time < p.endTime) {
            return p;
        }
    }

    return null;
}

/**
 * Finds the soonest period to start in the future - note that active periods are considered in the past by this function, and thus will never be returned as the soonest period.
 * The milliseconds until it starts is also returned for convenience.
 * @param {Array} periods - scheduled periods
 * @returns {Array|null} 2-tuple of soonest starting period and time in milliseconds until it starts. null if periods is empty.
 */
function findSoonestStartingPeriod(periods) {
    if (!periods.length) return null;

    const timezone = config.getDeviceTimezone();
    const dateTime = new luxon.DateTime.now().setZone(timezone);
    const nowDate = new Date(dateTime.toMillis());

    let pSmallest = periods[0];
    let pSmallestDate = _periodToNextDate(periods[0], nowDate);
    for (let i = 1; i < periods.length; i++) {
        const pDate = _periodToNextDate(periods[i], nowDate);
        if (pDate < pSmallestDate) {
            pSmallest = periods[i];
            pSmallestDate = pDate;
        }
    }

    return [pSmallest, pSmallestDate.valueOf() - nowDate.valueOf()];
}

/**
 * Returns the next datetime that the period will start on
 * @param {Object} period 
 * @param {Date} nowDate 
 * @returns {Date} Datetime period starts on. Returned datetime will be next week if the period has already passed this week
 */
function _periodToNextDate(period, nowDate) {
    const pDate = new Date();
    const pHours = Math.floor(period.startTime / 100);
    const pMins = period.startTime % 100;
    pDate.setHours(pHours, pMins, 0, 0);

    // does period start this week or next? Adjust calculation accordingly
    const pDay = DAY_STR_TO_INT_MAP.get(period.day);
    const dayDiff = pDay - nowDate.getDay();
    const dayInMonth = nowDate.getDate();
    if (dayDiff > 0) {
        pDayInMonth = dayInMonth + dayDiff;
    } else if (dayDiff === 0 && pDate > nowDate) {
        pDayInMonth = nowDate.getDate();
    } else {
        pDayInMonth = (dayInMonth+7) - dayDiff; // next period day is next week
    }
    pDate.setDate(pDayInMonth);

    return pDate;
}

function configEndUnix(givenConfig) {
    let endUnix = givenConfig.timeout;

    const activePeriod = find_active_period(givenConfig.periods);
    if (activePeriod) {
        const timezone = config.getDeviceTimezone();
        const date = new luxon.DateTime.now().setZone(timezone);
        const periodEndUnix = date.set({hour: activePeriod.endTime/100, minute: activePeriod.endTime%100, second: 0, millisecond: 0}) / 1000;

        endUnix = Math.max(endUnix, periodEndUnix);
    }

    return endUnix;
}

getStorage = function (key, callback) {
    chrome.storage.local.get([key], function (result) {
        callback(result)
    })
};

resetStorage = function () {
    // We only want to clear connections information.
    chrome.storage.local.get(null, function(items) {
        const allKeys = Object.keys(items);
        for(const key of allKeys) {
            // The connection keys are all numbers. So, remove if the key is a number.
            if (!Number.isNaN(key)) {
                chrome.storage.local.remove(key);
            }
        }
    });
};

updateStorage = function (key, value, callback = () => {}) {
    chrome.storage.local.get([key], function (result) {
        if (Object.keys(result).length === 0) {
            result.key = {}
        }
        let connections = {};
        connections[key] = value;
        chrome.storage.local.set(connections, callback);
    })
};

roughSizeOfObject = function (object) {
    let objectList = [];
    let stack = [object];
    let bytes = 0;

    while (stack.length) {
        let value = stack.pop();
        if (typeof value === 'boolean') {
            bytes += 4;
        } else if (typeof value === 'string') {
            bytes += value.length * 2;
        } else if (typeof value === 'number') {
            bytes += 8;
        } else if (value.byteLength > 0) {
            bytes += value.byteLength;
        } else if
        (
            typeof value === 'object'
            && objectList.indexOf(value) === -1
        ) {
            objectList.push(value);

            for (let i in value) {
                stack.push(value[i]);
            }
        }
    }
    return bytes;
};

arrayQueue = function (length) {
    let array = [];
    array.push = function () {
        if (this.length >= length) {
            this.shift();
        }
        return Array.prototype.push.apply(this, arguments);
    };
    return array;
};

/**
 * Generates a new UUID using the browsers
 * CPRNG for use in API requests and connection
 * reports.
 *
 * Lifted from: https://stackoverflow.com/a/2117523
 *
 * @returns {string}
 */
function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function getUserIP(newIpCallback) {
    //compatibility for firefox and chrome
    var myPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    var pc = new myPeerConnection({
            iceServers: []
        }),
        noop = function () {
        },
        ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/g;

    //create a bogus data channel
    pc.createDataChannel("");

    // create offer and set local description
    pc.createOffer().then(function (sdp) {
        sdp.sdp.split('\n').forEach(function (line) {
            if (line.indexOf('candidate') < 0) {
                return;
            }
            let ip_address = line.match(ipRegex)[0];
            /**********************************************************************************
             * Android on Chrome OS uses a bridged interface br0 at IP 100.115.92.0/24        *
             * (probably 100.115.92.1, check with ifconfig) to provide network separation     *
             * between Android and Chrome OS. I suspect AI2 Companion wants the computer and  *
             * device on the same subnet.                                                     *
             * -- REF: https://www.reddit.com/r/chromeos/comments/6cxs8w/ai2_companion_on_cb/ *
             **********************************************************************************/
            if (ip_address.startsWith("100.115.92")) {
                ip_address = "10.255.255.254"
            }
            newIpCallback(ip_address);
        });
        pc.setLocalDescription(sdp, noop, noop);
    }).catch(function (reason) {
        // An error occurred, so handle the failure to connect
    });

    //listen for candidate events
    pc.onicecandidate = function (ice) {
        if (ice && ice.candidate && ice.candidate.candidate && ice.candidate.candidate.match(ipRegex)) {
            let ip_address = ice.candidate.candidate.match(ipRegex)[0];
            /*********************
             * See above comment *
             *********************/
            if (ip_address.startsWith("100.115.92")) {
                ip_address = "10.255.255.254"
            }
            newIpCallback(ip_address);
        }
    };
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
}
