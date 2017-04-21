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
import * as chai from 'chai';
import * as request from 'supertest';
import * as http from 'http';
import * as express from 'express';

import config from './config';
import { createApp } from './server';
import * as api from './api';

const assert = chai.assert;

describe('server', () => {
  let server: http.Server;
  let app: express.Application;
  beforeEach(function setupServer(done) {
    // Fake comment scoring function.
    const stub: api.IAnalyzeCommentStub = (_analyzeCommentRequest) => {
      const response: api.IAnalyzeCommentResponse = {attributeScores: {
        INCOHERENT: {spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
      }};
      return Promise.resolve(response);
    };
    app = createApp(api.getCommentAnalyzerScorer(stub));
    server = app.listen(0, done);
  });
  afterEach(function closeServer(done) {
    server.close(done);
  });

  it('api call fails without authentication', (done) => {
    request(server)
      .post('/api/score-comment')
      .send({sync: true, comment: {plainText: 'Hi my name in Rando.'}})
      .expect(401, done);
  });

  it('api call succeeds with authentication', (done) => {
    config.load({authWhitelist: ['randotoken']});
    request(server)
      .post('/api/score-comment')
      .send({sync: true, comment: {plainText: 'Hi my name in Rando.'}})
      .set('Authorization', 'randotoken')
      .expect(200, done)
      .expect((res: request.Response) => {
        assert.isTrue('INCOHERENT' in res.body.scores, 'INCOHERENT scores present');
      });
  });

  it('/_ah/health works without auth', (done) => {
    request(server)
      .get('/_ah/health')
      .expect(200, done);
  });

  it('/ works without auth', (done) => {
    request(server)
      .get('/')
      .expect(200, done);
  });
});
