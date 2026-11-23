/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "e560984c6599aedf819e20fa4333ee74"
  }, {
    "url": "pwa-512x512.png",
    "revision": "9abb02ea85a200b550de84c648805003"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f0df62f8d03962868d8dc37e65104689"
  }, {
    "url": "og-image.png",
    "revision": "87d868c21f43495878e3939aa41f0d64"
  }, {
    "url": "index.html",
    "revision": "0292bcf61392d51b0020e55d8b7a41cd"
  }, {
    "url": "icon.svg",
    "revision": "95f6c70c154d22b20bbcb42900e8513d"
  }, {
    "url": "favicon-32x32.png",
    "revision": "a60e1fbf27e6ccfbb428158e0ae74384"
  }, {
    "url": "favicon-16x16.png",
    "revision": "16caecec47e60ac7f6f011ae53975af4"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "bf7c605cea30d27f420331d65544dd1a"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-800-normal-Dz0hZPb5.woff",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-800-normal-D_CZYdm9.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-700-normal-Ch8EUCfz.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-700-normal-C9SQsXvj.woff",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-600-normal-DO1RqFw5.woff",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-600-normal-BY8O6Cug.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-400-normal-DtOtW02z.woff",
    "revision": null
  }, {
    "url": "assets/nunito-vietnamese-400-normal-BHkVbP3T.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-800-normal-CtU8tJOV.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-800-normal-CDcxIxx8.woff",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-700-normal-D4woHhbd.woff",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-700-normal-BWeMsAzO.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-600-normal-Dd9Zuxh1.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-600-normal-BKUpuB78.woff",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-400-normal-i-8OOpdj.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-ext-400-normal-CjMJVfGn.woff",
    "revision": null
  }, {
    "url": "assets/nunito-latin-800-normal-Dz8SOQK_.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-800-normal-D-J0wlBY.woff",
    "revision": null
  }, {
    "url": "assets/nunito-latin-700-normal-OcDqTBcA.woff",
    "revision": null
  }, {
    "url": "assets/nunito-latin-700-normal-Dort48En.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-600-normal-Cd0eNu1l.woff",
    "revision": null
  }, {
    "url": "assets/nunito-latin-600-normal-Br8yIETf.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-400-normal-r8SDr6Up.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-latin-400-normal-DKg4f3fz.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-800-normal-pjRatrRO.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-800-normal-B-cvGohL.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-700-normal-DfoqN4Gs.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-700-normal-BuR0mlCG.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-600-normal-vnfu4DTE.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-600-normal-CWPPjBOD.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-400-normal-xaE7D4Sw.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-ext-400-normal-CuPM9foi.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-800-normal-DymMgApb.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-800-normal-D3igD7Kl.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-700-normal-DfHRUDv-.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-700-normal-DP36NgGt.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-600-normal-DJGQ2h05.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-600-normal-BUjmtIuu.woff",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-400-normal-xAOo5cBP.woff2",
    "revision": null
  }, {
    "url": "assets/nunito-cyrillic-400-normal-D1j0u8EH.woff",
    "revision": null
  }, {
    "url": "assets/index-DeA1-l2E.js",
    "revision": null
  }, {
    "url": "assets/index-CHDpVz56.css",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "bf7c605cea30d27f420331d65544dd1a"
  }, {
    "url": "favicon-16x16.png",
    "revision": "16caecec47e60ac7f6f011ae53975af4"
  }, {
    "url": "favicon-32x32.png",
    "revision": "a60e1fbf27e6ccfbb428158e0ae74384"
  }, {
    "url": "icon.svg",
    "revision": "95f6c70c154d22b20bbcb42900e8513d"
  }, {
    "url": "og-image.png",
    "revision": "87d868c21f43495878e3939aa41f0d64"
  }, {
    "url": "pwa-192x192.png",
    "revision": "f0df62f8d03962868d8dc37e65104689"
  }, {
    "url": "pwa-512x512.png",
    "revision": "9abb02ea85a200b550de84c648805003"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "e560984c6599aedf819e20fa4333ee74"
  }, {
    "url": "manifest.webmanifest",
    "revision": "1cceff7ca2a1c9d126899e4b91acfb6c"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
