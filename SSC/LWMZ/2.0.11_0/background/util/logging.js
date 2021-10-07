logging__error = (message, ...optionalParams) => {
    let module = get_caller();
    if (optionalParams.length > 0) {
        console.error("[" + new Date().toLocaleTimeString() + ":ERROR][" + module + "] " + message, optionalParams)
    } else {
        console.error("[" + new Date().toLocaleTimeString() + ":ERROR][" + module + "] " + message)
    }
};

logging__warning = (message, ...optionalParams) => {
    let module = get_caller();
    if (optionalParams.length > 0) {
        console.warn("[" + new Date().toLocaleTimeString() + "::WARN][" + module + "] " + message, optionalParams)
    } else {
        console.warn("[" + new Date().toLocaleTimeString() + "::WARN][" + module + "] " + message)
    }
};

logging__message = (message, ...optionalParams) => {
    let module = get_caller();
    if (optionalParams.length > 0) {
        console.log("[" + new Date().toLocaleTimeString() + "::INFO][" + module + "] " + message, optionalParams)
    } else {
        console.log("[" + new Date().toLocaleTimeString() + "::INFO][" + module + "] " + message)
    }
};

logging__debug = (message, ...optionalParams) => {
    let module = get_caller();
    if (optionalParams.length > 0) {
        console.debug("[" + new Date().toLocaleTimeString() + ":DEBUG][" + module + "] " + message, optionalParams)
    } else {
        console.debug("[" + new Date().toLocaleTimeString() + ":DEBUG][" + module + "] " + message)
    }
};

get_caller = (depth = 3) => {
    try {
        throw new Error();
    } catch (e) {
        let caller = e.stack.split("\n")[depth].split("/");
        caller = caller[caller.length - 1];
        return caller.substring(0, caller.lastIndexOf(":"))
    }
};