// Wrap the patch implementation in a closure in order to avoid polluting the
// Lambda module's namespace.
(function () {
  const tag = '[lambda-tools]';

  const addAllEventHandlers = (handlers) => {
    for (const [event, handler] of Object.entries(handlers)) {
      process.prependListener(event, handler);
    }
  };

  const getHandlerName = () => process.env._HANDLER.split('.')[1];
  const log = (...message) => console.error(tag, ...message);

  const removeAllEventHandlers = (handlers) => {
    for (const [event, handler] of Object.entries(handlers)) {
      process.removeListener(event, handler);
    }
  };

  const wrapHandler = (handler) => (event, context, done) => {
    // Bind the logging to the current request ID. This prevents AWS log patches
    // from changing the ID if a new request starts while backgrounded tasks
    // are executing.
    const requestId = context.awsRequestId;
    const logWithContext = (...message) => log(`RequestId: ${requestId}`, ...message);

    const eventHandlers = {
      beforeExit: (code) => {
        logWithContext(`Received 'beforeExit' with code ${code} before the handler completed. This usually means the handler never called back.`);
        // without this event handlers will pile up with each new event.
        // Eventually the maximum listener count will be hit (the default is 10).
        removeAllEventHandlers(eventHandlers);
      },
      // process should terminate. no cleanup neeed.
      uncaughtException: (error) => logWithContext('Uncaught exception', error),
      // if the unhandled rejection is on the critical path for the handler then
      // the event loop should drain leading to the 'beforeExit' case
      unhandledRejection: (reason, promise) => logWithContext('Unhandled rejection at:', promise, 'reason:', reason),
    };

    const completions = [];

    const finish = (...args) => {
      if (completions.length) {
        logWithContext('The Lambda function called back multiple times. Note that promise resolutions are equivalent to callback invocations.');
        logWithContext('The callback was invoked with the following sets of arguments:\n', completions);
      }

      completions.push(args);
      removeAllEventHandlers(eventHandlers);
      done(...args);
    };

    let returned = null;

    try {
      addAllEventHandlers(eventHandlers);
      returned = handler(event, context, finish);
    } catch (error) {
      finish(error);
      return;
    }

    if (returned && typeof returned.then === 'function') {
      returned.then(
        (result) => { finish(null, result); },
        (error) => { finish(error); },
      );
    }
  };

  const handlerName = getHandlerName();
  if (typeof handlerName !== 'string') {
    log('Could not determine the handler name. Not patching handler invocation.');
    return;
  }

  // The handler name value comes from the Lambda runtime
  const handler = module.exports[handlerName];
  if (typeof handler !== 'function') {
    log('Handler is not a function. Not patching handler invocation.');
    return;
  }

  // The handler name value comes from the Lambda runtime
  module.exports[handlerName] = wrapHandler(handler);
})();
