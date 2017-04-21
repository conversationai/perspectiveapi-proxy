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
// Create authenticated channel to the Comment Analyzer API.

// Note: no typings :(
const googleapis = require('googleapis');

import { IAnalyzeCommentResponse, IAnalyzeCommentStub } from './api';

export default function
createCommentAnalyzerClient(discoveryUrl: string, apiKey: string): Promise<IAnalyzeCommentStub> {
  return new Promise((res, rej) => {
    googleapis.discoverAPI(discoveryUrl, (discoverErr: any, client: any) => {
      if (discoverErr) {
        return rej(discoverErr);
      }
      if (!(client.comments && client.comments.analyze)) {
        // Bizarrely, this doesn't cause a discovery error?
        return rej('Unknown error loading API: client is b0rken');
      }
      // NOTE: if we wanted to return the client instead of this function, I
      // think we could still wrap the auth key under the covers with
      // googleapis.options.
      const analyzeComment: IAnalyzeCommentStub = (body) => {
        return new Promise((acRes, acRej) => {
          // Wrap apiKey under the covers.
          client.comments.analyze(
            {key: apiKey, resource: body},
            (err: any, response: IAnalyzeCommentResponse) => {
              if (err) { acRej(err); }
              else { acRes(response); }
            });
        });
      };
      res(analyzeComment);
    });
  });
}
