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
import * as winston from 'winston';
// TODO: no typings :(
const expressWinston = require('express-winston');

import config from './config';

const VERBOSITY: number = config.get('verbosity');

// Returns a console.log wrapper that only logs when VERBOSITY is >= n.
// VERBOSITY=1 gives high-level logging for RPC handling.
// VERBOSITY=2 logs detailed request and response bodies.
function verbosityLogging(n: number): (...args: any[]) => void {
  function logFn() {
    if (VERBOSITY >= n) {
      console.log.apply(null, arguments);
    }
  }
  return logFn;
}
export const vlog1 = verbosityLogging(1);
export const vlog2 = verbosityLogging(2);

const colorize = config.get('env') === 'local';

// Logger to capture all requests and output them to the console.
export const requestLogger = expressWinston.logger({
  transports: [
    new winston.transports.Console({
      json: false,
      colorize: colorize,
    }),
  ],
  expressFormat: true,
  meta: false,
});

// Logger to capture any top-level errors and output json diagnostic info.
export const errorLogger = expressWinston.errorLogger({
  transports: [
    new winston.transports.Console({
      json: true,
      colorize: colorize,
    }),
  ],
});
