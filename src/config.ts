/*
Copyright 2017 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import * as path from 'path';
import * as convict from 'convict';

/**
 * Default/base configuration settings for OS Moderator
 */
const config: convict.Config = convict({
  env: {
    doc: 'The current application environment',
    format: ['production', 'local', 'test', 'circle_ci'],
    default: 'local',
    env: 'NODE_ENV',
  },
  port: {
    doc: 'The port to bind to',
    format: 'port',
    default: 8080,
    env: 'PORT',
  },
  verbosity: {
    doc: 'Verbosity of console logging: 1 for basic logging, 2 for request bodies.',
    format: Number,
    default: 0,
    env: 'VERBOSITY',
  },
  requestLimit: {
    doc: 'Size limit of requests that the assistant will accept from the Osmod backend',
    format: String,
    default: '500kb',
    env: 'REQUEST_LIMIT',
  },
  userAgent: {
    doc: 'User-Agent header for requests to the Osmod backend',
    format: String,
    default: 'OsmodAssistantV0',
    env: 'USER_AGENT',
  },
  commentAnalyzerDiscoveryUrl: {
    doc: 'The discovery document for the Comment Analyzer API',
    format: String,
    default: 'https://commentanalyzer.googleapis.com/$discovery/rest?version=v1alpha1',
    env: 'COMMENT_ANALYZER_DISCOVERY_URL',
  },
  googleCloudApiKey: {
    doc: 'A Google Cloud API key to use for accessing the Comment Analyzer API',
    format: String,
    default: '',
    env: 'GOOGLE_CLOUD_API_KEY',
  },
  osmodToken: {
    doc: 'The API key for the Osmod backend',
    format: String,
    default: 'JWT 09 F9 11 02 9D 74 E3 5B D8 41 56 C5 63 56 88 C0',
    env: 'OSMOD_TOKEN',
  },
  attributeRequests: {
    doc: 'The set of requests to make to the PerspectiveAPI.',
    format: Object,
    // NOTE: Convict appears to have surprising behavior when merging Object
    // config values. When loading a config from a file, it seems like the
    // object values are merged, and there doesn't seem to be a way to *remove*
    // attributes when they're present in this default, so we leave it empty so
    // config files can specify exactly what attributes to requested.
    default: {},
    env: 'ATTRIBUTE_REQUESTS',
  },
  // Note: To specify multiple tokens via the AUTH_WHITELIST environment
  // variable, join them with commas.
  authWhitelist: {
    doc: 'List of whitelisted auth tokens.',
    format: Array,
    default: [],
    env: 'AUTH_WHITELIST',
  },
});

// Try to load ../config/<env>.json config file (defaults to 'local.json').
try {
  const envFile = path.join(__dirname, '../config/', config.get('env') + '.json');
  console.log('envFile:' + envFile);
  config.loadFile(envFile);
  console.log('Loaded config file:', envFile);
} catch (e) {
  console.error('Exception loading config file:', e.message);
}

config.validate({strict: true});

// TODO(jetpack): I get confusing errors when trying to use this as the 'format'
// checking method on attributeRequests. Doing this validate here at
// module-level means we don't get checking when dynamically loading a new
// config, but we do at least test the actual production code path.
function checkAttributeRequests(attrRequests: Object) {
  const unversionedNames = [];
  for (const attrName in attrRequests) {
    const unversioned = attrName.replace(/@.*/, '');
    if (unversionedNames.indexOf(unversioned) !== -1) {
      throw new Error('attribute name appears multiple times: ' + unversioned);
    }
    unversionedNames.push(unversioned);
  }
}
checkAttributeRequests(config.get('attributeRequests'));

export default config;
