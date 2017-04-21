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
import * as _ from 'lodash';
import * as express from 'express';
import * as path from 'path';

import config from './config';
import * as logging from './logging';
import { ICommentScorer, createApiRouter } from './api';

// Simple auth function based on environment variable token whitelist.
const simpleAuth: express.RequestHandler = (req, res, next) => {
  if (_.includes(config.get('authWhitelist'), req.get('Authorization'))) {
    next();
  } else {
    next({
      statusCode: 401,
      error: 'plz authenticate kthxbai',
    });
  }
};

const errorHandler: express.ErrorRequestHandler = (err, req, res, next) => {
  // TODO(jetpack): disable in test. move vlog functions from api to logger?
  logging.vlog1('Error caught:', err);
  res.status(err.statusCode || 500).json({
    error: err.toString() || 'Something broke!',
    details: err,
  });
};

export function createApp(commentScorer: ICommentScorer): express.Application {
  const app = express();

  app.disable('x-powered-by');  // s3curity

  // Respond to health checks (required when running on Compute Engine with
  // Managed Instance Groups). Install before logging middleware to avoid filling
  // logs with this.
  app.get('/_ah/health', (req, res) => {
    res.status(200).send('ok');
  });

  // Logging middleware.
  if (config.get('env') !== 'test') {
    app.use(logging.requestLogger, logging.errorLogger);
  }

  // API router, with authenication required.
  app.use('/api', simpleAuth, createApiRouter(commentScorer));

  // Serve public. Includes form for debugging score-comment.
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Error handler.
  app.use(errorHandler);

  return app;
}
