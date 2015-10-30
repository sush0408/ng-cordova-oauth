angular.module('oauth.withings', ['oauth.utils'])
  .factory('$withings', withings);

function withings($q, $http, $cordovaUtility) {
  return { signin: oauthWithings };

  /*
   * Sign into the Withings service
   * Note that this service requires jsSHA for generating HMAC-SHA1 Oauth 1.0 signatures
   *
   * @param    string clientId
   * @param    string clientSecret
   * @return   promise
   */
  function oauthWithings(clientId, clientSecret) {
    var deferred = $q.defer();
    if(window.cordova) {
      var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
      if($cordovaOauthUtility.isInAppBrowserInstalled(cordovaMetadata) === true) {
        if(typeof jsSHA !== "undefined") {

          // Step 1 : get a oAuth "request token"
          var oauthObject = $cordovaOauthUtility.generateOauthParametersInstance(clientId);
          oauthObject.oauth_callback = 'http://localhost/callback';

          var requestTokenUrlBase = "https://oauth.withings.com/account/request_token";
          var signatureObj = $cordovaOauthUtility.createSignature("GET", requestTokenUrlBase, {}, oauthObject, clientSecret);
          oauthObject.oauth_signature = signatureObj.signature;

          var requestTokenParameters = $cordovaOauthUtility.generateUrlParameters(oauthObject);

          $http({method: "get", url: requestTokenUrlBase + "?" + requestTokenParameters })
            .success(function(requestTokenResult) {

              // Step 2 : End-user authorization
              var parameterMap = $cordovaOauthUtility.parseResponseParameters(requestTokenResult);
              if(parameterMap.hasOwnProperty("oauth_token") === false) {
                deferred.reject("Oauth request token was not received");
              }
              var oauthObject = $cordovaOauthUtility.generateOauthParametersInstance(clientId);
              oauthObject.oauth_token = parameterMap.oauth_token;

              // used in step 3
              var oauthTokenSecret = parameterMap.oauth_token_secret;

              var authorizeUrlBase = "https://oauth.withings.com/account/authorize";
              var signatureObj = $cordovaOauthUtility.createSignature("GET", authorizeUrlBase, {}, oauthObject, clientSecret);
              oauthObject.oauth_signature = signatureObj.signature;

              var authorizeParameters = $cordovaOauthUtility.generateUrlParameters(oauthObject);
              var browserRef = window.open(authorizeUrlBase + '?' + authorizeParameters, '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');

              // STEP 3: User Data Access token
              browserRef.addEventListener('loadstart', function(event) {
                if((event.url).indexOf("http://localhost/callback") === 0) {
                  var callbackResponse = (event.url).split("?")[1];
                  parameterMap = $cordovaOauthUtility.parseResponseParameters(callbackResponse);
                  if(parameterMap.hasOwnProperty("oauth_verifier") === false) {
                    deferred.reject("Browser authentication failed to complete.  No oauth_verifier was returned");
                  }

                  var oauthObject = $cordovaOauthUtility.generateOauthParametersInstance(clientId);
                  oauthObject.oauth_token = parameterMap.oauth_token;

                  var accessTokenUrlBase = "https://oauth.withings.com/account/access_token";
                  var signatureObj = $cordovaOauthUtility.createSignature("GET", accessTokenUrlBase, {}, oauthObject, clientSecret, oauthTokenSecret);
                  oauthObject.oauth_signature = signatureObj.signature;

                  var accessTokenParameters = $cordovaOauthUtility.generateUrlParameters(oauthObject);

                  $http({method: "get", url: accessTokenUrlBase + '?' + accessTokenParameters})
                    .success(function(result) {
                      var parameterMap = $cordovaOauthUtility.parseResponseParameters(result);
                      if(parameterMap.hasOwnProperty("oauth_token_secret") === false) {
                        deferred.reject("Oauth access token was not received");
                      }
                      deferred.resolve(parameterMap);
                    })
                    .error(function(error) {
                      deferred.reject(error);
                    })
                    .finally(function() {
                      setTimeout(function() {
                        browserRef.close();
                      }, 10);
                    });
                }
              });
              browserRef.addEventListener('exit', function(event) {
                deferred.reject("The sign in flow was canceled");
              });
            })
            .error(function(error) {
                deferred.reject(error);
            });
        } else {
            deferred.reject("Missing jsSHA JavaScript library");
        }
      } else {
        deferred.reject("Could not find InAppBrowser plugin");
      }
    } else {
      deferred.reject("Cannot authenticate via a web browser");
    }

    return deferred.promise;
  }
}

$withings.$inject = ['$q', '$http', '$cordovaUtility'];
