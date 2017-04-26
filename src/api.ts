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
import * as express from 'express';
import * as request from 'request';
import * as bodyParser from 'body-parser';

import config from './config';
import { vlog1, vlog2 }  from './logging';
import createCommentAnalyzerClient from './ml_client';

const REQUEST_LOG_SIZE_LIMIT = 500;
const ERROR_LOG_SIZE_LIMIT = 2000;
const debugRequestLog: Object[] = [];
const debugErrorLog: Object[] = [];
let commentCounter = 0;

function logError(reqId: number, error: any, msg: string): void {
  vlog1(`***ERROR*** [${reqId}] ${msg}:`, error);
  if (debugErrorLog.push({reqId: reqId, msg: msg, error: error}) > ERROR_LOG_SIZE_LIMIT) {
    debugErrorLog.shift();
  }
}

// Add obj to debugRequestLog. Limits size.
function logRequest(obj: Object): void {
  if (debugRequestLog.push(obj) > REQUEST_LOG_SIZE_LIMIT) {
    debugRequestLog.shift();
  }
}

// Interface implemented by scoring function. Provides the Osmod<->Assistant
// API.
export interface ICommentScorer {
  (reqId: number, assistantRequest: IAssistantRequest): Promise<IAssistantResponse>;
}

// Interface for Comment Analyzer API stub (provides the Comment Analyzer API).
export interface IAnalyzeCommentStub {
  (analyzeCommentRequest: IAnalyzeCommentRequest): Promise<IAnalyzeCommentResponse>;
}

// Osmod <-> Assistant API types.
export interface IAssistantRequest {
  sync: boolean;
  includeSummaryScores?: boolean;
  comment: {
    plainText?: string;
  };
  article: {
    plainText?: string;
  };
  inReplyToComment: {
    plainText?: string;
  };
  links: {
    callback: string;
  };
}

type IAssistantResponse = IAssistantResponseGood | IAssistantResponseBad;

export interface IAssistantResponseBad {
  error: string;
}

export interface IAssistantResponseGood {
  scores: IAssistantAttributeSpanScores;
  summaryScores?: IAssistantAttributeSummaryScores;
}

interface IAssistantAttributeSpanScores {
  [attribute: string]: IAssistantSpanScore[];
}

interface IAssistantAttributeSummaryScores {
  [attribute: string]: number;
}

interface IAssistantSpanScore {
  score: number;
  begin?: number;
  end?: number;
}

// Comment Analyzer API types.
export interface IAnalyzeCommentRequest {
  comment: ITextEntry;
  context: { entries: ITextEntry[]; };
  requestedAttributes: IRequestedAttributes;
  languages?: string[];
  clientToken?: string;
}

interface ITextEntry {
  text: string;
}

interface IRequestedAttributes {
  [attribute: string]:  {
    scoreType?: string;
    scoreThreshold?: number;
  };
}

export interface IAnalyzeCommentResponse {
  attributeScores: IAttributeScores;
  languages?: string[];
  clientToken?: string;
}

interface IAttributeScores {
  [attribute: string]: {
    spanScores?: ISpanScore[];
    summaryScore?: { value: number; };
  };
}

interface ISpanScore {
  begin: number;
  end: number;
  score: { value: number; };
}

function ConvertRequestAssistantToCommentAnalyzer(aRequest: IAssistantRequest, reqId: number)
: IAnalyzeCommentRequest {

  let acRequest: IAnalyzeCommentRequest = {
    comment: {text: aRequest.comment.plainText},
    context: {entries: []},
    requestedAttributes: config.get('attributeRequests'),
    languages: ['en'],
    clientToken: config.get('userAgent') + '_request' + reqId,
  };
  if (aRequest.article && aRequest.article.plainText) {
    acRequest.context.entries.push({text: aRequest.article.plainText});
  }
  if (aRequest.inReplyToComment && aRequest.inReplyToComment.plainText) {
    acRequest.context.entries.push({text: aRequest.inReplyToComment.plainText});
  }
  return acRequest;
}

function ConvertResponseCommentAnalyzerToAssistant(
    reqId: number,
    acRequest: IAnalyzeCommentRequest,
    acResponse: IAnalyzeCommentResponse,
    includeSummaryScores: boolean): IAssistantResponseGood {
  // This just flattens nested score values and renames some fields.
  const spanScores: IAssistantAttributeSpanScores = {};
  const summaryScores: IAssistantAttributeSummaryScores = {};
  for (const attributeName in acResponse.attributeScores) {
    const attributeScore = acResponse.attributeScores[attributeName];
    if (attributeScore.summaryScore) {
      summaryScores[attributeName] = attributeScore.summaryScore.value;
    } else {
      logError(reqId, {},
          'Strangely there are no summary scores for: ' + attributeName);
    }
    if (attributeScore.spanScores && attributeScore.spanScores.length > 0) {
      spanScores[attributeName] = attributeScore.spanScores.map(
        ({begin, end, score: {value}}) => ({begin: begin, end: end, score: value})
      );
    } else if (attributeScore.summaryScore) {
      spanScores[attributeName] = [{
          begin: 0,
          end: acRequest.comment.text.length,
          score: summaryScores[attributeName],
        }];
    } else {
      logError(reqId, {},
          'Bizarely there are no span scores and no summary score. Probably a bug!');
    }
  }
  const response: IAssistantResponseGood = {scores: spanScores};
  if (includeSummaryScores) {
    response.summaryScores = summaryScores;
  }
  return response;
}

export function getCommentAnalyzerScorer(analyzeComment: IAnalyzeCommentStub): ICommentScorer {
  return (reqId, assistantRequest) => {
    const acRequest = ConvertRequestAssistantToCommentAnalyzer(assistantRequest, reqId);
    // Post request to Comment Analyzer.
    return analyzeComment(acRequest).then((acResponse) => {
      vlog1(`--> ${reqId} score-comment. ML success.`);
      vlog2(`--> ${reqId} score-comment. ML response body:`,
            JSON.stringify(acResponse, null, 2));
      const assistantResponse = ConvertResponseCommentAnalyzerToAssistant(reqId, acRequest,
        acResponse, assistantRequest.includeSummaryScores);
      logRequest({reqId: reqId,
                  request: {commenttext: assistantRequest.comment.plainText,
                            postback: assistantRequest.sync || assistantRequest.links.callback},
                  clientToken: acResponse.clientToken,
                  scores: assistantResponse});
      return assistantResponse;
    }).catch((err) => {
      vlog1(`--> ${reqId} score-comment. ML error:`, err);
      logError(reqId, err, 'score-comment AnalyzeComment error');
      // Note: JSON.stringify on Error objects doesn't work, while toString on
      // normal objects doesn't work. Bleh.
      return {error: 'Assistant error communicating with ML backend: ' + err.toString()};
    });
  };
}

// Post comment score result back to target URL.
function postResult(reqId: number, target: string, result: IAssistantResponse): void {
  const options = {
    headers: {'User-Agent': config.get('userAgent'),
              'Authorization': config.get('osmodToken')},
    uri: target,
    json: true,
    body: result,
  };
  vlog1(`---> ${reqId} (1) score-comment posting back to: ${target}`);
  request.post(options, (postErr, response, body) => {
    const statuscode = response && response.statusCode;
    vlog1(`---> ${reqId} (2) score-comment result callback response code: ${statuscode}, error:`,
          postErr);
    vlog2(`---> ${reqId} (3) score-comment result callback response body:`,
          JSON.stringify(body, null, 2));
    if (postErr || statuscode !== 200) {
      logError(reqId, postErr, 'score-comment postResult error');
      return;
    }
  });
}

// Validates score-comment request body. Returns error message, or null if no
// errors.
function validateScoreComment(body: IAssistantRequest): string {
  if (!body) {
    return 'Request missing body.';
  } else if (!(body.links && body.links.callback) && body.sync !== true) {
    return 'Request missing `links.callback` field.';
  } else if (!(body.comment && body.comment.plainText)) {
    return 'Request missing `comment.plainText` field.';
  } else {
    return null;
  }
}

export function getCommentScorer(): Promise<ICommentScorer> {
  return createCommentAnalyzerClient(config.get('commentAnalyzerDiscoveryUrl'),
                                     config.get('googleCloudApiKey'))
    .then(getCommentAnalyzerScorer);
}

export function createApiRouter(commentScorer: ICommentScorer): express.Router {
  const router = express.Router();
  // https://github.com/expressjs/body-parser#limit
  router.use(bodyParser.json({
    limit: config.get('requestLimit'),
  }));

  // API endpoint for receiving comments.
  router.post('/score-comment', (req, res) => {
    const reqId = ++commentCounter;
    const body = req.body;
    vlog1(`-> ${reqId} Handling POST score-comment. body:`, body);
    const errorMsg = validateScoreComment(body);
    if (errorMsg) {
      logError(reqId, errorMsg, 'validate error');
      res.status(400).json({error: errorMsg});
      return;
    }
    if (body.sync !== true) {
      // Non-sync: return now. Actual scoring result will be sent via postResult.
      res.json({status: 'ok'});
    }
    commentScorer(reqId, body).then((result) => {
      if (body.sync !== true) {
        // Non-sync: post result back to Osmod.
        postResult(reqId, body.links.callback, result);
      } else {
        // Sync: return result.
        // Typescript unions are clunky. Sad!
        const bad: boolean = (result as IAssistantResponseBad).error !== undefined;
        res.status(bad ? 500 : 200).json(result);
      }
    }).catch((err) => {
      // Note: ICommentScorers return errors as IAnalyzeCommentResponseBad, not
      // by rejecting or throwing exceptions. TODO(jetpack): kinda weird. maybe
      // just use reject?
      logError(reqId, err, 'BUG! something really weird and bad happened?');
    });
  });

  // API endpoints for debugging:
  // - POST /echo just returns the JSON body it gets. Can be used as the
  //   "links.result" field in /api/score-comment requests.
  // - GET /log returns recent scoring requests and any errors encountered.
  router.post('/echo', (req, res) => {
    vlog1('=> POST /echo. params:', req.params,
          '; query:', req.query,
          '; body:', req.body);
    res.json({echostatus: 'echoyay', reqbody: req.body});
  });

  router.get('/log', (req, res) => {
    res.send(JSON.stringify({requests: debugRequestLog,
                             errors: debugErrorLog},
                            null, 4));
  });

  router.get('/logjson', (req, res) => {
    res.send({requests: debugRequestLog, errors: debugErrorLog});
  });

  return router;
}
