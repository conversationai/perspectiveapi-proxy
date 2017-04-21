# PerspectiveAPI Proxy

This project shows how to write a simple asynchronous proxy for the
[Perspective API](https://www.perspectiveapi.com). It also provides a simple
HTML interface to help debug issues. It is intended to be used by a system
that wants asynchonous scoring of comments. In the code and documentation
below we refer to the other system as `Osmod` (an [opensource
moderation assistant](https://github.com/conversationai/conversationai-moderator)).

# Requirements

- NodeJS LTS 6.10.x. [nvm](https://github.com/creationix/nvm) is a nice way to
  get Node installed.
- Access to the [Perspective API](https://www.perspectiveapi.com).
  - Once whitelisted, you should be able to enable the API in the
    [Cloud console](https://console.developers.google.com) (go to the **API
    Manager** section, click **Enable API**, and search for "comment analyzer").
  - You'll need to create an API key in the **Credentials** subsection of the
    **API Manager** section.
    - Set the `GOOGLE_CLOUD_API_KEY` environment variable to the key.

# Development

## Running a development server

```
yarn install
GOOGLE_API_KEY=generated-api-key AUTH_WHITELIST=s3cret ATTRIBUTE_REQUESTS='{ "TOXICITY": {} }' PORT=8080 yarn run watch
```

This command will automatically restart your server when you update the code.
Note: See the instructions for generating an API key in
[Requirements](#requirements).

Issue a score-comment request:

```
curl -H 'Authorization: s3cret' \
  -H 'Content-Type: application/json' \
  --data '{"sync":true, "comment": {"plainText": "you big darn dummy!"} }' \
  http://localhost:8080/api/score-comment
```

## Testing

To run linters: `./bin/lint`
To run tests: `./bin/test`

## Testing/debugging model scoring

There's an excrutiatingly simple, Web 1.0 interface for testing comment scoring
requests that the proxy serves as its root page (e.g.,
http://localhost:8080/). It requires an authentication token, which can be
anything included in the `AUTH_WHITELIST` environment variable
(and the `authWhitelist` value of the config JSON file in `dist/config/`).

It's essentially a little wrapper around the basic curl request that parses the
ML API's response and shows how different parts of the comment got scored.

## Deployment

First, make a `production.json` config file into `dist/config/`. It should look
something like this:

```
{
  "port": 8080,
  "osmodToken": "Auth token sent to Osmod so it can trust the proxy.",
  "authWhitelist": ["Auth token accepted by the proxy"],
  "googleCloudApiKey": "Google cloud api key"
  "attributeRequests": {
      "TOXICITY": {},
  }
}
```

- `googleCloudApiKey` (or environment variable `GOOGLE_CLOUD_API_KEY`) is
  a generated API key (see instructions in [Requirements](#requirements)).
- `authWhitelist` (or environment variable `AUTH_WHITELIST`) is a comma-separated
  list of accepted auth tokens from
  Osmod (used when Osmod posts score-comment requests to the
  proxy). Set this to something secret and configure Osmod to
  use it (e.g. using the command `dd if=/dev/urandom bs=1 count=32 | base64`).
- `osmodToken` (or environment variable `OSMOD_TOKEN`) is the proxy's auth token
  included the async response HTTP requests sent to Osmod. This is
  generated (and also stored) on the Osmod side.
- `attributeRequests` (or environment variable `ATTRIBUTE_REQUESTS`) is
  map from [PerspectiveAPI attribute
  names](https://github.com/conversationai/perspectiveapi/blob/master/api_reference.md#attributes) to [an attribute configuration
  object](https://github.com/conversationai/perspectiveapi/blob/master/api_reference.md#methods).
  Sensible defaults are used, so the empty object `{}` is a valid (and typical)
  choice for the attribute configuration.

After creating this json config file, deploy the production proxy like so
(from the server directory):

```
yarn run compile
gcloud auth login
gcloud config set project YOUR_CLOUD_PROJECT_NAME
gcloud app deploy
```

### Locally testing using docker

Build a local version and then the docker image (which includes and then uses
the locally built version):

```bash
yarn install
yarn run compile
docker build -t perspectiveapi-proxy -f Dockerfile.dev .
```

Start a shell in docker image:

```bash
docker run -p 8080:8080 -ti perspectiveapi-proxy:latest /bin/bash
```

And from the docker shell, you can now start the server:

```bash
yarn run start
```

# Architecture

The assistant links the Osmod service with the [Perspective
API](https://www.perspectiveapi.com). The Osmod service issues
`/api/score-comment` requests to the assistant. The assistant forwards that
request to the Perspective API, and (asynchronously) posts the result back
to Osmod.

## Proxy ↔ Osmod protocol

The protocol between the assistant and Osmod is documented here:
https://github.com/Jigsaw-Code/moderator/blob/dev/server/docs/osmod_assistant_protocol.md

## Proxy ↔ PerspectiveAPI protocol

The protocol between the assistant and the PerspectiveAPI is document on
[the perspective github
page](https://github.com/conversationai/perspectiveapi/blob/master/README.md).

## Notes

This example code is to help experimentation with the Perspective API; it is not an official Google product.

