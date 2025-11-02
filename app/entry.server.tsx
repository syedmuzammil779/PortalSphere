import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import { createReadableStreamFromReadable, type EntryContext } from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { handleCors } from "./utils/cors.server";
import { startCronJob } from './utils/cronJobHandler';
import { initSentry } from './sentry';

//initSentry();
const ABORT_DELAY = 5000;

startCronJob();

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  // Add Shopify document headers
  addDocumentResponseHeaders(request, responseHeaders);

  // Handle CORS
  const corsResponse = handleCors(request);
  if (corsResponse instanceof Response) {
    return corsResponse; // Return if unauthorized
  }
  
  // Add CORS headers to existing headers
  corsResponse.forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  // Handle OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      headers: responseHeaders 
    });
  }

  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer
        context={remixContext}
        url={request.url}
        abortDelay={ABORT_DELAY}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          // Add CORS headers to error responses
          if (corsResponse instanceof Headers) {
            corsResponse.forEach((value, key) => {
              responseHeaders.set(key, value);
            });
          }
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
          // Add CORS headers to error responses
          if (corsResponse instanceof Headers) {
            corsResponse.forEach((value, key) => {
              responseHeaders.set(key, value);
            });
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}