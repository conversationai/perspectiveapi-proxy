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
import * as bodyParser from 'body-parser';
import * as _ from 'lodash';

import * as api from './api';
import config from './config';

const assert = chai.assert;

describe('api router', () => {
  // We use sync:true for most tests because, though it's not quite the
  // production code path, it's way less annoying :|
  describe('score-comment endpoint (with "sync: true")', () => {
    let server: http.Server;
    let app: express.Application;
    beforeEach(function setupServer(done) {
      app = express();
      server = app.listen(0, done);
    });
    afterEach(function closeServer(done) {
      server.close(done);
    });

    it('should return results directly', (done) => {
      // Basic response.
      const stub: api.IAnalyzeCommentStub = (_analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, comment: {plainText: 'Hi, I like rockets: 🚀.'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
          assert.isTrue('INCOHERENT' in body.scores, 'INCOHERENT scores present');
        });
    });

    it('should do protocol translation properly', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        assert.isOk(analyzeCommentRequest.comment, 'comment present');
        assert.strictEqual(analyzeCommentRequest.comment.text,
                           'Y = λf.(λx.f(x x))(λx.f(x x))',
                           'comment text is propagated');
        assert.strictEqual(analyzeCommentRequest.languages.length, 1,
                           'languages has single entry');
        assert.strictEqual(analyzeCommentRequest.languages[0], 'en',
                           'language set correctly');
        // More elaborate response from the ML API: multiple attributes, each
        // with multiple scores. Only INCOHERENT has a summary score.
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {summaryScore: {value: 0.7},
                       spanScores: [
                         {begin: 0, end: 10, score: {value: 0.5}},
                         {begin: 11, end: 20, score: {value: 0.9}},
                       ]},
          OBSCENE: {spanScores: [
            {begin: 0, end: 10, score: {value: 0.2}},
            {begin: 11, end: 20, score: {value: 0.3}},
          ]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, comment: {plainText: 'Y = λf.(λx.f(x x))(λx.f(x x))'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          // This is the format expected by the Osmod backend.
          assert.isOk(body.scores, 'result has `scores`');
          assert(_.isEqual(body.scores['INCOHERENT'],
                           [{begin: 0, end: 10, score: 0.5},
                            {begin: 11, end: 20, score: 0.9}]),
                 'INCOHERENT scores as expected');
          assert(_.isEqual(body.scores['OBSCENE'],
                           [{begin: 0, end: 10, score: 0.2},
                            {begin: 11, end: 20, score: 0.3}]),
                 'OBSCENE scores as expected');
        });
    });

    it('should return summaryScores when includeSummaryScores is true', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {summaryScore: {value: 0.7},
                       spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, includeSummaryScores: true, comment: {plainText: 'summary scores please'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
          assert(_.isEqual(body.scores['INCOHERENT'],
                           [{begin: 0, end: 10, score: 0.5}]),
                 'INCOHERENT scores as expected');
          assert.isOk(body.summaryScores, 'result has `summaryScores`');
          assert(_.isEqual(body.summaryScores, {'INCOHERENT': 0.7}),
                 'summaryScores as expected');
        });
    });

    it('should not return summaryScores when includeSummaryScores is false', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {summaryScore: {value: 0.7},
                       spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, includeSummaryScores: false, comment: {plainText: 'summary scores please'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          // Request explicitly said no summaryScores, so response shouldn't have them.
          assert.strictEqual(body.summaryScores, undefined,
                             'result lacks `summaryScores`');
        });
    });

    it('If empty span-score, the summary score is treated as a text-wide span', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {
          attributeScores: { INCOHERENT: {summaryScore: {value: 0.7}, spanScores: []}, }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, includeSummaryScores: true,
               comment: {plainText: 'summary scores please'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
          assert(_.isEqual(body.scores['INCOHERENT'], [{begin: 0, end: 21, score: 0.7}]),
                 'INCOHERENT scores as expected');
          assert.isOk(body.summaryScores, 'result has `summaryScores`');
          assert(_.isEqual(body.summaryScores, {'INCOHERENT': 0.7}),
                 'summaryScores as expected');
        });
    });

    it('If no span-score, the summary score is treated as a text-wide span', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {
          attributeScores: { INCOHERENT: {summaryScore: {value: 0.7}}, }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, includeSummaryScores: true,
               comment: {plainText: 'summary scores please'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
          assert(_.isEqual(body.scores['INCOHERENT'], [{begin: 0, end: 21, score: 0.7}]),
                 'INCOHERENT scores as expected');
          assert.isOk(body.summaryScores, 'result has `summaryScores`');
          assert(_.isEqual(body.summaryScores, {'INCOHERENT': 0.7}),
                 'summaryScores as expected');
        });
    });

    it('If (empty or no) span-scores and no summary, then no scores.', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {
          attributeScores: { INCOHERENT: {}, }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, includeSummaryScores: true,
               comment: {plainText: 'summary scores please'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
          assert(_.isEqual(body.scores, {}),
              'INCOHERENT scores are empty as expected');
        });
    });

    // This is important for backwards-compatibility.
    it('should not return summaryScores when includeSummaryScores is undefined', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {summaryScore: {value: 0.7},
                       spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, comment: {plainText: 'summary scores please'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          // Request explicitly said no summaryScores, so response shouldn't
          // have them. The "should do protocol transalation properly" test
          // tests the case where includeSummaryScores isn't specified.
          assert.strictEqual(body.summaryScores, undefined,
                             'result lacks `summaryScores`');
        });
    });

    it('should pass context from article', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        assert.isOk(analyzeCommentRequest.comment, 'comment present');
        assert.strictEqual(analyzeCommentRequest.context.entries.length, 1,
                           'context has correct number of entries');
        assert.strictEqual(analyzeCommentRequest.context.entries[0].text,
                           'article text here',
                           'context has article as first entry');
        return Promise.resolve({});
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true,
               comment: {plainText: 'comment text'},
               article: {plainText: 'article text here'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
        });
    });

    it('should pass context from inReplyToComment', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        assert.isOk(analyzeCommentRequest.comment, 'comment present');
        assert.strictEqual(analyzeCommentRequest.context.entries.length, 1,
                           'context has correct number of entries');
        assert.strictEqual(analyzeCommentRequest.context.entries[0].text,
                           'in-reply-to comment here',
                           'context has inReplyToComment as first entry');
        return Promise.resolve({});
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true,
               comment: {plainText: 'comment text'},
               inReplyToComment: {plainText: 'in-reply-to comment here'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
        });
    });

    it('should pass context from article and in-reply-to comment', (done) => {
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        assert.isOk(analyzeCommentRequest.comment, 'comment present');
        assert.strictEqual(analyzeCommentRequest.context.entries.length, 2,
                           'context has correct number of entries');
        assert.strictEqual(analyzeCommentRequest.context.entries[0].text,
                           'article text here',
                           'context has article as first entry');
        assert.strictEqual(analyzeCommentRequest.context.entries[1].text,
                           'in-reply-to comment here',
                           'context has in-reply-to comment as second entry');
        return Promise.resolve({});
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true,
               comment: {plainText: 'comment text'},
               article: {plainText: 'article text here'},
               inReplyToComment: {plainText: 'in-reply-to comment here'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
        });
    });

    it('should fail if `links.callback` missing', (done) => {
      const noop = null as api.IAnalyzeCommentStub;
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(noop)));
      request(server)
        .post('/api/score-comment')
        .send({comment: {plainText: 'Hiya'}})
        .expect(400, done);
    });

    it('should fail if `comment` missing', (done) => {
      const noop = null as api.IAnalyzeCommentStub;
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(noop)));
      request(server)
        .post('/api/score-comment')
        .send({links: {callback: 'foo'}})
        .expect(400, done);
    });

    it('should enforce `requestLimit`', (done) => {
      const origRequestLimit = config.get('requestLimit');

      config.load({requestLimit: '50b'});  // 50 byte limit
      const noop = null as api.IAnalyzeCommentStub;
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(noop)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, comment: {plainText: 'small comment'}})
        .expect(200);

      request(server)
        .post('/api/score-comment')
        .send({sync: true, comment: {
          plainText: ('big huge comment geez this is so big how will we deal'
                      + ' with all this data oh the humanity')}})
        .expect(413, done);  // bodyParser gives 413 (payload too large)

      config.load({requestLimit: origRequestLimit});
    });

    it('should request all configured attributes from ML API', (done) => {
      const configuredAttributes = config.get('attributeRequests');
      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        assert.isOk(analyzeCommentRequest.requestedAttributes,
                    'requestedAttributes present');
        for (const x in configuredAttributes) {
          assert(x in analyzeCommentRequest.requestedAttributes,
                 x + ' is in requestedAttributes');
        }
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, comment: {plainText: 'Hiya'}})
        .expect(200, done);
    });

    it('should support versioned attributes', (done) => {
      // This requests 2 versioned attributes. The assistant should strip the
      // versions from the attribute names.
      const origAttributeRequests = config.get('attributeRequests');
      config.load({attributeRequests: {'INFLAMMATORY@2': {}, 'TOXICITY@3': {}}});

      const stub: api.IAnalyzeCommentStub = (analyzeCommentRequest) => {
        assert.isOk(analyzeCommentRequest.requestedAttributes,
                    'requestedAttributes present');
        for (const x of ['INFLAMMATORY@2', 'TOXICITY@3']) {
          assert(x in analyzeCommentRequest.requestedAttributes,
                 x + ' is in requestedAttributes');
        }
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          'INFLAMMATORY@2': {spanScores: [{begin: 0, end: 4, score: {value: 0.5}}],
                             summaryScore: {value: 0.6}},
          'TOXICITY@3': {summaryScore: {value: 0.2}},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, includeSummaryScores: true, comment: {plainText: 'Hiya'}})
        .expect(200, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          // Check that both 'scores' and 'summaryScores' only have the
          // unversioned attribute names.
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.scores, 'result has `scores`');
          assert(_.isEqual(body.scores,
                           {INFLAMMATORY: [{begin: 0, end: 4, score: 0.5}],
                            TOXICITY: [{begin: 0, end: 4, score: 0.2}]}),
                 'scores are as expected');
          assert.isOk(body.summaryScores, 'result has `summaryScores`');
          assert(_.isEqual(body.summaryScores, {TOXICITY: 0.2, INFLAMMATORY: 0.6}),
                 'summaryScores as expected');
        });

      config.load({attributeRequests: origAttributeRequests});
    });

    it('should return errors from ML', (done) => {
      const stub: api.IAnalyzeCommentStub = (_analyzeCommentRequest) => {
        return Promise.reject<api.IAnalyzeCommentResponse>(Error('Fail town sry'));
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));
      request(server)
        .post('/api/score-comment')
        .send({sync: true, comment: {plainText: 'Please clap.'}})
        .expect(500, done)
        .expect('Content-Type', /json/)
        .expect((res: request.Response) => {
          const body = res.body;
          assert.isOk(body, 'response not hosed');
          assert.isOk(body.error, 'result has `error`');
          assert.isTrue(body.error.includes('Fail town'), 'Error message is present');
        });
    });
  });

  describe('score-comment endpoint posting to links.callback', () => {
    let server: http.Server;
    let app: express.Application;
    let osmodServer: http.Server;
    let osmodApp: express.Application;
    let osmodPort: number;
    beforeEach(function setupServer(done) {
      app = express();
      server = app.listen(0, () => {
        osmodApp = express();
        osmodApp.use(bodyParser.json());
        osmodServer = osmodApp.listen(0, () => {
          // This seems weird but seems to work. ¯\_(ツ)_/¯
          osmodPort = osmodServer.address().port;
          done();
        });
      });
    });
    afterEach(function closeServer(done) {
      server.close(() => {
        osmodServer.close(done);
      });
    });

    it('should post results to `links.callback`', (done) => {
      // Set up fake Osmod server.
      osmodApp.post('/comments/score/123', (req, res) => {
        assert.strictEqual(req.headers['content-type'], 'application/json', 'got JSON result');
        assert.isOk(req.body, 'request not hosed');
        assert.isOk(req.body.scores, 'result has `scores`');
        assert.isTrue(_.isEqual(req.body.scores.INCOHERENT,
                                [{begin: 0, end: 10, score: 0.5}]),
                      'INCOHERENT scores as expected');
        res.send('kthxbai');
        // If result isn't posted, we don't reach here and fail with timeout.
        done();
      });

      // Mount API router.
      const stub: api.IAnalyzeCommentStub = (_analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));

      // Issue request.
      const callbackAddress = 'http://localhost:' + osmodPort + '/comments/score/123';
      request(server)
        .post('/api/score-comment')
        .send({comment: {plainText: 'Fuzzy wuzzy wuzza bear.'},
               links: {callback: callbackAddress}})
        .expect(200)
        .end((err, _res) => {
          // Without an end function, the request doesn't seem to be made.
          if (err) { done(err); }
        });
    });

    it('should post ML errors to `links.callback`', (done) => {
      // Set up fake Osmod server.
      osmodApp.post('/comments/score/123', (req, res) => {
        assert.strictEqual(req.headers['content-type'], 'application/json', 'got JSON result');
        assert.isOk(req.body, 'request not hosed');
        assert.isOk(req.body.error, 'result has `error`');
        assert.isTrue(req.body.error.includes('failwhale'), 'error is propagated');
        res.send('kthxbai');
        // If result isn't posted, we don't reach here and fail with timeout.
        done();
      });

      // Mount API router.
      const stub: api.IAnalyzeCommentStub = (_analyzeCommentRequest) => {
        // Error response.
        return Promise.reject<api.IAnalyzeCommentResponse>('<insert-failwhale-here>');
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));

      // Issue request.
      const callbackAddress = 'http://localhost:' + osmodPort + '/comments/score/123';
      request(server)
        .post('/api/score-comment')
        .send({comment: {plainText: 'Fuzzy wuzzy wuzza bear.'},
               links: {callback: callbackAddress}})
        .expect(200)
        .end((err, _res) => {
          // Without an end function, the request doesn't seem to be made.
          if (err) { done(err); }
        });
    });

    it('should set Authorization and User-Agent headers', (done) => {
      config.load({osmodToken: 'JWT lolcopter', userAgent: '007'});
      // Set up fake Osmod server.
      osmodApp.post('/comments/score/123', (req, res) => {
        assert(req.body, 'request not hosed');
        assert.strictEqual(req.headers['authorization'], 'JWT lolcopter',
                           'sent configured auth token');
        assert.strictEqual(req.headers['user-agent'], '007', 'sent configured user agent');
        res.send('kthxbai');
        done();  // If this isn't called, we fail with timeout.
      });

      // Mount API router.
      const stub: api.IAnalyzeCommentStub = (_analyzeCommentRequest) => {
        const response: api.IAnalyzeCommentResponse = {attributeScores: {
          INCOHERENT: {spanScores: [{begin: 0, end: 10, score: {value: 0.5}}]},
        }};
        return Promise.resolve(response);
      };
      app.use('/api', api.createApiRouter(api.getCommentAnalyzerScorer(stub)));

      // Issue request.
      const callbackAddress = 'http://localhost:' + osmodPort + '/comments/score/123';
      request(server)
        .post('/api/score-comment')
        .send({comment: {plainText: 'Fuzzy wuzzy wuzza bear.'},
               links: {callback: callbackAddress}})
        .expect(200)
        .end((err, _res) => {
          // Without an end function, the request doesn't seem to be made.
          if (err) { done(err); }
        });
    });
  });
});
