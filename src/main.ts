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
// Activate Google Cloud Trace in production.
if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/trace-agent').start();
  require('@google-cloud/debug-agent').start({ allowExpressions: true });
}

import config from './config';
import { createApp } from './server';
import { getCommentScorer } from './api';

// Log config.
console.log('Config:\n', config.getProperties());

// Start up the app.

getCommentScorer().then((commentScorer) => {
  const app = createApp(commentScorer);
  app.listen(config.get('port'), () => {
    console.log('The arc of the moral universe is long.');
  });
}).catch((err) => {
  console.error('DANGER DANGER! Error getting comment scoring function:', err);
});
