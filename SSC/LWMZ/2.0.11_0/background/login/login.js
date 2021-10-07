class Login {
    constructor() {
        let self = this;
        self.lastTime = 0;

        chrome.extension.onMessage.addListener((request, sender, sendResponse) => {
            if (request.greeting === "SignIn") {
                self.login();
                sendResponse({});
            }
        });
    }

    login() {
        let self = this;
        logging__debug("login(force) was called");

        /* Only perform the network login if its required */
        if (!config.inside_device_network || !config.google_classroom_extension_login) {
            return
        }

        /* Only perform the network login if:
        *   -- has_timed_out
        *   -- the device is not authenticated on the network
        *   -- TODO: potentially check if the user account is correct?
        * */
        let has_timed_out = self.lastTime + 600000 < (new Date()).getTime();
        if (!has_timed_out && config.inside_device_network__authenticated) {
            logging__debug("login(force) will be ignored");
            return
        }

        logging__message("Attempting to authenticate with appliance");
        logging__debug("Requesting identity token from chrome");
        if (config.google_allow_insecure_chrome) {
            chrome.identity.getProfileUserInfo(function (obejct) {
                logging__debug( "Chrome provided a email identity via ::getProfileUserInfo");
                logging__message("Identity retrieved was: " + obejct.email);
                logging__message("Sending request to chromelogin.linewize");

                let xhr = new XMLHttpRequest();
                xhr.open("GET", "http://chromelogin.linewize.net?gto=" + obejct.email + "&signedin=true", true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            logging__message("chromelogin.linewize returned success");
                            self.lastTime = (new Date()).getTime();
                        } else {
                            logging__error("chromelogin.linewize returned a failure, " + xhr.statusText);
                        }
                    }
                };
                xhr.send();
            });
        } else {
            chrome.identity.getAuthToken({interactive: true}, function (token) {
                if (chrome.runtime.lastError) {
                    logging__error("Chrome rejected the request for an identity token, lets try again!!");
                    self.login()
                } else {
                    if (token !== undefined) {
                        logging__debug("Chrome provided an identity token via oauth ::getAuthToken");
                        logging__debug("Identity retrieved was: " + token);
                        logging__message("Sending request with token to chromelogin.linewize");

                        let xhr = new XMLHttpRequest();
                        xhr.open("GET", "http://chromelogin.linewize.net?gto=" + token + "&signedin=true", true);
                        xhr.onreadystatechange = function () {
                            if (xhr.readyState === 4) {
                                if (xhr.status === 200) {
                                    logging__message("Background Login successful.");
                                    self.lastTime = (new Date()).getTime();
                                } else {
                                    logging__error("Background Login error:", xhr.statusText);
                                }
                            }
                        };
                        xhr.send();
                    } else {
                        logging__error("Background Login error: No Chrome token.");
                        self.login()
                    }
                }
            });
        }
    }
}


