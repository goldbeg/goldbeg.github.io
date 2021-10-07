class AuthNotPossibleError extends Error {
   constructor(message) {
      super(message);
      this.name = "AuthNotPossibleError";
   }
}

class UserRejectedSignInError extends Error {
   constructor(message) {
      super(message);
      this.name = "UserRejectedSignInError";
   }
}

// NOTE: the auth endpoints called here will set an auth cookie on the response - no need to set anything after a successful auth request
class Authenticate {
   constructor() {
      this.partialFailedCache = new PartialAuthFailedCredentialsCache();

      chrome.runtime.onMessage.addListener(function(msg) {
         if (msg.type === "GOOGLE_AUTHENTICATE") {
            authenticate.google();
         }
      });
   }

   /**
    * Automatically authenticates the user with non-interactive authentication, callers don't need to know about the different auth available to try get the best level of authentication.
    * If this endpoint returns successfully, then an auth cookie will have been set in the browser to the '*.linewize.net' domain.
    */
   async autoAuth() {
      try {
         await this.onNetwork();
         return;
      }
      catch (error) {
         // we're not on-network, try off-network auth methods (error intentionally swallowed to continue to off-network auth below)
         console.error("error from on-network auth attempt", {error})
      }

      await this.partial();
   }

   async partial() {
      if (config.is_teacher) {
         throw new AuthNotPossibleError("user is a teacher, partial auth not supported")
      }

      const applianceId = config.getDeviceId();
      const username = config.currentUserInfo.user
      let email;
      if (!username) {
         email = await this.findUserEmail();
      }

      if (!applianceId || (!username && !email)) {
         throw new AuthNotPossibleError("applianceId and username or email is required for partial auth");
      }
      else if (this.partialFailedCache.contains(applianceId, username, email)) {
         throw new AuthNotPossibleError("partial auth credentials used are in the known bad credentials cache")
      }

      try {
         await easyFetch(`${config.apiDispatcherUrl}/authenticate/agent/partial`, { method: 'POST', body: JSON.stringify({email, username, appliance_id: applianceId})});
      }
      catch (error) {
         if (error.name === 'EasyFetchStatusError' && error.response.status === 400) {
            this.partialFailedCache.set(applianceId, username, email)
         }
         throw error;
      }
   }

   async google() {
      return new Promise((resolve, reject) => {
         chrome.identity.getAuthToken({interactive: true }, async (token) => {
            if (!token) {
               reject(new UserRejectedSignInError("User did not complete Google sign-in"));
               return;
            }

            try {
               const response = await easyFetch(`${config.apiDispatcherUrl}/authenticate/agent/chrome/google`, {
                  method: "POST",
                  body: JSON.stringify({token, appliance_id: config.getDeviceId()})
               });
               
               // Tell others about this token
               chrome.runtime.sendMessage( { type : "TOKEN", token : response.token });
               resolve();
            }
            catch (error) {
               if (error.name === 'EasyFetchStatusError' && error.response.status === 401) {
                  await this._clearIdentityToken(token);
                  resolve(this.google());
                  return;
               }
               reject(error);
            }
         })
      })
   }

   async onNetwork() {
      const result = await easyFetch(`http://whoami.linewize.net`)
      await easyFetch(`${config.apiDispatcherUrl}/authenticate/agent/on-network`, {method: "POST", body: JSON.stringify(result)})
   }

   async findUserEmail() {
      if (config.currentUserInfo && config.currentUserInfo.email) {
         return config.currentUserInfo.email
      }

      return new Promise(async (resolveOuter, rejectOuter) => {
         const signedInEmailPromise = new Promise((resolveInner, rejectInner) => {
            chrome.identity.getProfileUserInfo(userinfo => {
               resolveInner(userinfo.email);
            })
         })
         const storedEmailPromise = new Promise((resolveInner, rejectInner) => {
            chrome.storage.sync.get('userInfo', userInfo => {
               if (userInfo) {
                  resolveInner(userInfo.email);
               }
               else {
                  resolveInner(undefined);
               }
            })
         })

         const signedInEmail = await signedInEmailPromise;
         if (signedInEmail) {
            resolveOuter(signedInEmail);
            return;
         }
         const storedEmail = await storedEmailPromise;
         if (storedEmail) {
            resolveOuter(storedEmail);
            return;
         }
         resolveOuter(null);
      })
   }

   async _clearIdentityToken(token) {
      return new Promise((resolve, reject) => {
         chrome.identity.removeCachedAuthToken({token}, resolve)
      })
   }
}

class PartialAuthFailedCredentialsCache {
   constructor() {
      this.cacheMaxSize = 1;
      this.cache = [];
   }

   set = (applianceId, username, email) => {
      this.cache.unshift(this._key(applianceId, username, email));
      this.cache.length = this.cacheMaxSize;
   }

   contains = (applianceId, username, email) => {
      return this.cache.includes(this._key(applianceId, username, email))
   }

   clear = () => {
      this.cache.length = 0;
   }

   _key = (applianceId, username, email) => {
      return `${applianceId}_${username}_${email}`
   }
}
